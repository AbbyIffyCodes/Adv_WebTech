import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { UserRole } from "../accounts/enums/user_role.enum";
import { appConfig } from "../../config/app.config";
import { ApplicationDto, SelectionStartDto } from "./dto/selection.dto";
interface RequestRow {
  id: string;
  project_id: string;
  supervisor_id: string;
  opportunity_id: string | null;
  initiated_by: string;
  direction: string;
  status: string;
  statement: string;
  decision_reason: string | null;
  response_due: Date;
  decided_at: Date | null;
  created_at: Date;
}
interface ProjectRow {
  id: string;
  group_id: string;
  status: string;
  published_at: Date | null;
  archived_at: Date | null;
}
interface GroupRow {
  id: string;
  leader_id: string;
  archived_at: Date | null;
  membership_locked: boolean;
}
interface SupervisionRow {
  id: string;
  project_id: string;
  supervisor_id: string;
  opportunity_id: string | null;
  request_id: string;
  reserved_places: number;
  confirmed_at: Date;
  ended_at: Date | null;
  end_reason: string | null;
}
interface UserRow {
  id: string;
  role: string;
  is_active: boolean;
}
interface GrantRow {
  id: string;
  project_id: string;
  grantee_id: string;
  granted_by: string;
  supervision_id: string | null;
  scope: string;
  revoked_at: Date | null;
  created_at: Date;
}
const rows = async <T>(
  m: EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => {
  const result = await m.query(sql, params);
  // TypeORM's PostgreSQL UPDATE/DELETE RETURNING result includes an affected count.
  return Array.isArray(result?.[0]) && typeof result?.[1] === "number"
    ? result[0]
    : result;
};
@Injectable()
export class SelectionService {
  constructor(private readonly source: DataSource) {}
  private requestView(r: RequestRow, actor: AuthUser) {
    return {
      id: r.id,
      projectId: r.project_id,
      supervisorId: r.supervisor_id,
      opportunityId: r.opportunity_id,
      initiatedBy: r.initiated_by,
      direction: r.direction,
      status:
        ["pending", "offered"].includes(r.status) &&
        r.response_due <= new Date()
          ? "expired"
          : r.status,
      ...(actor.role !== UserRole.COORDINATOR
        ? { statement: r.statement }
        : {}),
      decisionReason: r.decision_reason,
      responseDue: r.response_due,
      decidedAt: r.decided_at,
      createdAt: r.created_at,
    };
  }
  private supervisionView(s: SupervisionRow) {
    return {
      id: s.id,
      projectId: s.project_id,
      supervisorId: s.supervisor_id,
      opportunityId: s.opportunity_id,
      reservedPlaces: s.reserved_places,
      confirmedAt: s.confirmed_at,
      endedAt: s.ended_at,
      endReason: s.end_reason,
    };
  }
  private grantView(g: GrantRow) {
    return {
      id: g.id,
      projectId: g.project_id,
      granteeId: g.grantee_id,
      grantedBy: g.granted_by,
      scope: g.scope,
      supervisionId: g.supervision_id,
      revokedAt: g.revoked_at,
      createdAt: g.created_at,
    };
  }
  private async tx<T>(work: (m: EntityManager) => Promise<T>) {
    try {
      return await this.source.transaction(work);
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new ConflictException(
          "A live request, active supervision or access grant already exists",
        );
      throw e;
    }
  }
  private async lockUsers(
    m: EntityManager,
    actor: AuthUser,
    supervisorId?: string,
    requireAvailable = true,
  ) {
    const users = await rows<UserRow>(
      m,
      "SELECT id,role,is_active FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [
        [
          ...new Set([actor.id, ...(supervisorId ? [supervisorId] : [])]),
        ].sort(),
      ],
    );
    const actual = users.find((u) => u.id === actor.id);
    if (!actual?.is_active || actual.role !== actor.role)
      throw new ForbiddenException("Account role changed; log in again");
    if (supervisorId && requireAvailable) {
      const sup = users.find((u) => u.id === supervisorId);
      if (!sup?.is_active || sup.role !== UserRole.SUPERVISOR)
        throw new ConflictException("An active supervisor is required");
    }
  }
  private async context(m: EntityManager, id: string) {
    const [hint] = await rows<ProjectRow>(
      m,
      "SELECT * FROM projects WHERE id=$1",
      [id],
    );
    if (!hint) throw new NotFoundException("Project not found");
    const [group] = await rows<GroupRow>(
      m,
      "SELECT * FROM research_groups WHERE id=$1 FOR UPDATE",
      [hint.group_id],
    );
    const [project] = await rows<ProjectRow>(
      m,
      "SELECT * FROM projects WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!group || group.archived_at || project.archived_at)
      throw new NotFoundException("Active project not found");
    return { group, project };
  }
  private async leader(m: EntityManager, actor: AuthUser, group: GroupRow) {
    const members = await rows<{ user_id: string }>(
      m,
      "SELECT user_id FROM group_members WHERE group_id=$1 AND user_id=$2 AND left_at IS NULL",
      [group.id, actor.id],
    );
    if (
      actor.role !== UserRole.STUDENT ||
      group.leader_id !== actor.id ||
      !members.length
    )
      throw new ForbiddenException(
        "Only the current group leader can perform this action",
      );
  }
  private async audit(
    m: EntityManager,
    projectId: string,
    actorId: string,
    action: string,
    details: Record<string, unknown> = {},
  ) {
    await m.query(
      "INSERT INTO activity_events(project_id,actor_id,action,details) VALUES($1,$2,$3,$4::jsonb)",
      [projectId, actorId, action, JSON.stringify(details)],
    );
  }
  private due() {
    return new Date(
      Date.now() + appConfig.env.SELECTION_RESPONSE_HOURS * 3600000,
    );
  }
  private async active(m: EntityManager, projectId: string) {
    return (
      await rows<SupervisionRow>(
        m,
        "SELECT * FROM supervisions WHERE project_id=$1 AND ended_at IS NULL",
        [projectId],
      )
    )[0];
  }
  private async eligible(
    m: EntityManager,
    project: ProjectRow,
    supervisorId: string,
    opportunityId: string | null,
  ) {
    if (!project.published_at || project.status === "draft")
      throw new ConflictException(
        "Publish the limited project summary before selection",
      );
    if (await this.active(m, project.id))
      throw new ConflictException(
        "This project already has an active supervisor",
      );
    const members = await rows<{
      user_id: string;
      role: string;
      is_active: boolean;
    }>(
      m,
      "SELECT gm.user_id,u.role,u.is_active FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 AND gm.left_at IS NULL",
      [project.group_id],
    );
    if (
      !members.length ||
      members.some((u) => !u.is_active || u.role !== UserRole.STUDENT)
    )
      throw new ConflictException(
        "Every group member must be an active student",
      );
    if (opportunityId) {
      const [post] = await rows<{
        supervisor_id: string;
        status: string;
        deadline: Date;
        places: number;
        reserved_places: number;
      }>(m, "SELECT * FROM opportunities WHERE id=$1 FOR UPDATE", [
        opportunityId,
      ]);
      if (!post || post.supervisor_id !== supervisorId)
        throw new ConflictException(
          "Opportunity must belong to the selected supervisor",
        );
      if (post.status !== "open" || post.deadline <= new Date())
        throw new ConflictException("Opportunity is closed or expired");
      if (post.places - post.reserved_places < members.length)
        throw new ConflictException(
          "Opportunity does not have enough student places for the entire group",
        );
      const [missing] = await rows<{ n: number }>(
        m,
        `SELECT count(*)::int n FROM opportunity_required_skills req WHERE req.opportunity_id=$1 AND NOT EXISTS (
    SELECT 1 FROM profile_skills ps JOIN group_members gm ON gm.user_id=ps.profile_id WHERE gm.group_id=$2 AND gm.left_at IS NULL AND ps.skill_id=req.skill_id)`,
        [opportunityId, project.group_id],
      );
      if (missing.n)
        throw new ConflictException(
          "The group's combined profile skills do not meet the opportunity's required skills",
        );
    }
    return members.length;
  }
  async start(
    actor: AuthUser,
    dto: SelectionStartDto,
    supervisorId: string,
    direction: "application" | "invitation",
  ) {
    return this.tx(async (m) => {
      await this.lockUsers(m, actor, supervisorId);
      const { group, project } = await this.context(m, dto.projectId);
      if (direction === "application") await this.leader(m, actor, group);
      else if (actor.role !== UserRole.SUPERVISOR || actor.id !== supervisorId)
        throw new ForbiddenException();
      await this.eligible(m, project, supervisorId, dto.opportunityId ?? null);
      await m.query(
        "UPDATE selection_requests SET status='expired',decided_at=CURRENT_TIMESTAMP,decision_reason='Response deadline passed' WHERE project_id=$1 AND supervisor_id=$2 AND status IN ('pending','offered') AND response_due<=CURRENT_TIMESTAMP",
        [project.id, supervisorId],
      );
      const [r] = await rows<RequestRow>(
        m,
        "INSERT INTO selection_requests(project_id,supervisor_id,opportunity_id,initiated_by,direction,statement,response_due) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          project.id,
          supervisorId,
          dto.opportunityId ?? null,
          actor.id,
          direction,
          dto.statement,
          this.due(),
        ],
      );
      await this.audit(m, project.id, actor.id, "selection." + direction, {
        requestId: r.id,
        supervisorId,
      });
      return this.requestView(r, actor);
    });
  }
  application(actor: AuthUser, dto: ApplicationDto) {
    return this.start(actor, dto, dto.supervisorId, "application");
  }
  invitation(actor: AuthUser, dto: SelectionStartDto) {
    return this.start(actor, dto, actor.id, "invitation");
  }
  private async withRequest<T>(
    actor: AuthUser,
    id: string,
    work: (
      m: EntityManager,
      r: RequestRow,
      group: GroupRow,
      project: ProjectRow,
    ) => Promise<T>,
  ) {
    return this.tx(async (m) => {
      const [hint] = await rows<RequestRow>(
        m,
        "SELECT * FROM selection_requests WHERE id=$1",
        [id],
      );
      if (!hint) throw new NotFoundException("Selection request not found");
      await this.lockUsers(m, actor, hint.supervisor_id);
      const { group, project } = await this.context(m, hint.project_id);
      const [r] = await rows<RequestRow>(
        m,
        "SELECT * FROM selection_requests WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (
        !["pending", "offered"].includes(r.status) ||
        r.response_due <= new Date()
      )
        throw new ConflictException(
          "This selection request is no longer awaiting a response",
        );
      return work(m, r, group, project);
    });
  }
  async offer(actor: AuthUser, id: string) {
    return this.withRequest(actor, id, async (m, r, _group, project) => {
      if (actor.role !== UserRole.SUPERVISOR || actor.id !== r.supervisor_id)
        throw new ForbiddenException(
          "Only the named supervisor can offer supervision",
        );
      if (r.direction !== "application" || r.status !== "pending")
        throw new ConflictException(
          "Only a pending student application can receive an offer",
        );
      await this.eligible(m, project, r.supervisor_id, r.opportunity_id);
      const [saved] = await rows<RequestRow>(
        m,
        "UPDATE selection_requests SET status='offered',response_due=$2,decided_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",
        [id, this.due()],
      );
      await this.audit(m, project.id, actor.id, "selection.offered", {
        requestId: id,
      });
      return this.requestView(saved, actor);
    });
  }
  async decision(
    actor: AuthUser,
    id: string,
    reason: string,
    withdraw = false,
  ) {
    return this.withRequest(actor, id, async (m, r, group, project) => {
      const supervisor =
        actor.role === UserRole.SUPERVISOR && actor.id === r.supervisor_id;
      if (!supervisor) await this.leader(m, actor, group);
      if (
        withdraw
          ? r.direction === "application"
            ? supervisor
            : !supervisor
          : r.direction === "invitation"
            ? supervisor
            : !supervisor && r.status !== "offered"
      )
        throw new ForbiddenException(
          "This action is reserved for the request sender or recipient",
        );
      const status = withdraw ? "withdrawn" : "declined";
      const [saved] = await rows<RequestRow>(
        m,
        "UPDATE selection_requests SET status=$2,decision_reason=$3,decided_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",
        [id, status, reason],
      );
      await this.audit(m, project.id, actor.id, "selection." + status, {
        requestId: id,
        reason,
      });
      return this.requestView(saved, actor);
    });
  }
  async confirm(actor: AuthUser, id: string) {
    return this.withRequest(actor, id, async (m, r, group, project) => {
      await this.leader(m, actor, group);
      if (r.direction === "application" && r.status !== "offered")
        throw new ConflictException(
          "Wait for the supervisor to offer supervision first",
        );
      const places = await this.eligible(
        m,
        project,
        r.supervisor_id,
        r.opportunity_id,
      );
      const [profile] = await rows<{ capacity: number | null }>(
        m,
        "SELECT capacity FROM profiles WHERE user_id=$1 FOR UPDATE",
        [r.supervisor_id],
      );
      const [used] = await rows<{ n: number }>(
        m,
        "SELECT COALESCE(sum(reserved_places),0)::int n FROM supervisions WHERE supervisor_id=$1 AND ended_at IS NULL",
        [r.supervisor_id],
      );
      if (profile?.capacity == null || profile.capacity - used.n < places)
        throw new ConflictException(
          "Supervisor capacity is insufficient for all group members",
        );
      const [s] = await rows<SupervisionRow>(
        m,
        "INSERT INTO supervisions(project_id,supervisor_id,opportunity_id,request_id,reserved_places) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [project.id, r.supervisor_id, r.opportunity_id, r.id, places],
      );
      if (r.opportunity_id)
        await m.query(
          "UPDATE opportunities SET reserved_places=reserved_places+$2 WHERE id=$1",
          [r.opportunity_id, places],
        );
      await m.query(
        "UPDATE selection_requests SET status='confirmed',decided_at=CURRENT_TIMESTAMP WHERE id=$1",
        [id],
      );
      await m.query(
        "UPDATE selection_requests SET status='withdrawn',decision_reason='Another pairing was confirmed',decided_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND id<>$2 AND status IN ('pending','offered')",
        [project.id, id],
      );
      await m.query(
        "UPDATE projects SET status='under_supervision',updated_at=CURRENT_TIMESTAMP WHERE id=$1",
        [project.id],
      );
      await m.query(
        "UPDATE research_groups SET membership_locked=true WHERE id=$1",
        [group.id],
      );
      const [grant] = await rows<GrantRow>(
        m,
        "INSERT INTO access_grants(project_id,grantee_id,granted_by,supervision_id) VALUES($1,$2,$3,$4) RETURNING *",
        [project.id, r.supervisor_id, actor.id, s.id],
      );
      await this.audit(m, project.id, actor.id, "supervision.confirmed", {
        supervisionId: s.id,
        supervisorId: r.supervisor_id,
        reservedPlaces: places,
      });
      await this.audit(m, project.id, actor.id, "access.granted", {
        grantId: grant.id,
        granteeId: r.supervisor_id,
      });
      return {
        message:
          "Supervision confirmed; document access explicitly granted. Proposal approval is a separate review.",
        supervision: this.supervisionView(s),
        accessGrant: this.grantView(grant),
      };
    });
  }
  async end(actor: AuthUser, id: string, reason: string) {
    return this.tx(async (m) => {
      const [hint] = await rows<SupervisionRow>(
        m,
        "SELECT * FROM supervisions WHERE id=$1",
        [id],
      );
      if (!hint) throw new NotFoundException("Supervision not found");
      await this.lockUsers(m, actor, hint.supervisor_id, false);
      const { group, project } = await this.context(m, hint.project_id);
      if (actor.id !== hint.supervisor_id || actor.role !== UserRole.SUPERVISOR)
        await this.leader(m, actor, group);
      if (hint.opportunity_id)
        await m.query("SELECT id FROM opportunities WHERE id=$1 FOR UPDATE", [
          hint.opportunity_id,
        ]);
      const [s] = await rows<SupervisionRow>(
        m,
        "SELECT * FROM supervisions WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (s.ended_at) throw new ConflictException("Supervision already ended");
      const [ended] = await rows<SupervisionRow>(
        m,
        "UPDATE supervisions SET ended_at=CURRENT_TIMESTAMP,end_reason=$2 WHERE id=$1 RETURNING *",
        [id, reason],
      );
      if (s.opportunity_id)
        await m.query(
          "UPDATE opportunities SET reserved_places=reserved_places-$2 WHERE id=$1",
          [s.opportunity_id, s.reserved_places],
        );
      await m.query(
        "UPDATE access_grants SET revoked_at=CURRENT_TIMESTAMP WHERE supervision_id=$1 AND revoked_at IS NULL",
        [id],
      );
      await m.query(
        "UPDATE projects SET status='seeking_supervisor',updated_at=CURRENT_TIMESTAMP WHERE id=$1",
        [project.id],
      );
      await m.query(
        "UPDATE research_groups SET membership_locked=false WHERE id=$1",
        [group.id],
      );
      await this.audit(m, project.id, actor.id, "supervision.ended", {
        supervisionId: id,
        reason,
      });
      return this.supervisionView(ended);
    });
  }
  async list(actor: AuthUser, projectId: string, page: number, limit: number) {
    const m = this.source.manager;
    const [project] = await rows<ProjectRow>(
      m,
      "SELECT * FROM projects WHERE id=$1",
      [projectId],
    );
    if (!project) throw new NotFoundException();
    const member =
      (
        await m.query(
          "SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2 AND left_at IS NULL",
          [project.group_id, actor.id],
        )
      ).length > 0;
    if (
      !member &&
      actor.role !== UserRole.COORDINATOR &&
      actor.role !== UserRole.SUPERVISOR
    )
      throw new ForbiddenException();
    const ownOnly = !member && actor.role === UserRole.SUPERVISOR;
    const filter = ownOnly ? " AND supervisor_id=$2" : "";
    const params = ownOnly ? [projectId, actor.id] : [projectId];
    const [count] = await rows<{ n: number }>(
      m,
      "SELECT count(*)::int n FROM selection_requests WHERE project_id=$1" +
        filter,
      params,
    );
    const records = await rows<RequestRow>(
      m,
      "SELECT * FROM selection_requests WHERE project_id=$1" +
        filter +
        ` ORDER BY created_at DESC,id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit],
    );
    const supervisions = await rows<SupervisionRow>(
      m,
      "SELECT * FROM supervisions WHERE project_id=$1" +
        filter +
        " ORDER BY confirmed_at DESC",
      params,
    );
    return {
      items: records.map((r) => this.requestView(r, actor)),
      supervisions: supervisions.map((s) => this.supervisionView(s)),
      total: count.n,
      page,
      limit,
    };
  }
  async capacity(id: string) {
    const [r] = await rows<{
      capacity: number | null;
      n: number;
      is_active: boolean;
      role: string;
    }>(
      this.source.manager,
      `SELECT p.capacity,u.is_active,u.role,COALESCE((SELECT sum(reserved_places)::int FROM supervisions WHERE supervisor_id=u.id AND ended_at IS NULL),0) n FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=$1`,
      [id],
    );
    if (!r || !r.is_active || r.role !== UserRole.SUPERVISOR)
      throw new NotFoundException("Active supervisor not found");
    return {
      supervisorId: id,
      capacity: r.capacity,
      reservedPlaces: r.n,
      remainingPlaces: Math.max(0, (r.capacity ?? 0) - r.n),
    };
  }
  async grants(actor: AuthUser, projectId: string) {
    return this.tx(async (m) => {
      await this.lockUsers(m, actor);
      const { group } = await this.context(m, projectId);
      await this.leader(m, actor, group);
      return {
        items: (
          await rows<GrantRow>(
            m,
            "SELECT * FROM access_grants WHERE project_id=$1 ORDER BY created_at DESC",
            [projectId],
          )
        ).map((g) => this.grantView(g)),
      };
    });
  }
  async grant(actor: AuthUser, projectId: string, granteeId: string) {
    return this.tx(async (m) => {
      // Lock every named user in UUID order before the group and project.
      await m.query(
        "SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [[actor.id, granteeId]],
      );
      await this.lockUsers(m, actor);
      const { group } = await this.context(m, projectId);
      await this.leader(m, actor, group);
      const [user] = await rows<UserRow>(
        m,
        "SELECT id,role,is_active FROM users WHERE id=$1",
        [granteeId],
      );
      if (!user?.is_active)
        throw new ConflictException("Grantee must be an active named user");
      let supervisionId: string | null = null;
      if (user.role === UserRole.SUPERVISOR) {
        const s = await this.active(m, projectId);
        if (!s || s.supervisor_id !== granteeId)
          throw new ConflictException(
            "Supervisor must have a current confirmed pairing",
          );
        supervisionId = s.id;
      } else if (user.role !== UserRole.COORDINATOR)
        throw new ConflictException(
          "Only a named coordinator or confirmed supervisor can receive an external document grant",
        );
      const [g] = await rows<GrantRow>(
        m,
        "INSERT INTO access_grants(project_id,grantee_id,granted_by,supervision_id) VALUES($1,$2,$3,$4) RETURNING *",
        [projectId, granteeId, actor.id, supervisionId],
      );
      await this.audit(m, projectId, actor.id, "access.granted", {
        grantId: g.id,
        granteeId,
      });
      return this.grantView(g);
    });
  }
  async revoke(actor: AuthUser, projectId: string, id: string) {
    return this.tx(async (m) => {
      await this.lockUsers(m, actor);
      const { group } = await this.context(m, projectId);
      await this.leader(m, actor, group);
      const [g] = await rows<GrantRow>(
        m,
        "UPDATE access_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id=$1 AND project_id=$2 AND revoked_at IS NULL RETURNING *",
        [id, projectId],
      );
      if (!g) throw new NotFoundException("Active access grant not found");
      await this.audit(m, projectId, actor.id, "access.revoked", {
        grantId: id,
        granteeId: g.grantee_id,
      });
      return this.grantView(g);
    });
  }
  async documentAccess(actor: AuthUser, projectId: string) {
    const [r] = await rows<{ allowed: boolean }>(
      this.source.manager,
      `SELECT (
   EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=p.group_id AND gm.user_id=$2 AND gm.left_at IS NULL) OR
   EXISTS(SELECT 1 FROM access_grants a JOIN users u ON u.id=a.grantee_id WHERE a.project_id=p.id AND a.grantee_id=$2 AND a.revoked_at IS NULL AND u.is_active=true AND
    ((u.role='coordinator' AND a.supervision_id IS NULL) OR (u.role='supervisor' AND EXISTS(SELECT 1 FROM supervisions s WHERE s.id=a.supervision_id AND s.project_id=p.id AND s.supervisor_id=u.id AND s.ended_at IS NULL))))
   ) allowed FROM projects p JOIN research_groups g ON g.id=p.group_id WHERE p.id=$1 AND p.archived_at IS NULL AND g.archived_at IS NULL`,
      [projectId, actor.id],
    );
    return { projectId, allowed: r?.allowed === true };
  }
  async assertDocumentAccess(actor: AuthUser, projectId: string) {
    if (!(await this.documentAccess(actor, projectId)).allowed)
      throw new ForbiddenException(
        "Explicit current document access is required",
      );
  }
  async activity(
    actor: AuthUser,
    projectId: string,
    page: number,
    limit: number,
  ) {
    const listed = await this.list(actor, projectId, 1, 1);
    if (
      actor.role === UserRole.SUPERVISOR &&
      !listed.supervisions.some(
        (s) => s.supervisorId === actor.id && !s.endedAt,
      )
    )
      throw new ForbiddenException();
    const [count] = await rows<{ n: number }>(
      this.source.manager,
      "SELECT count(*)::int n FROM activity_events WHERE project_id=$1",
      [projectId],
    );
    const events = await rows<{
      id: string;
      actor_id: string;
      action: string;
      details: unknown;
      occurred_at: Date;
    }>(
      this.source.manager,
      "SELECT * FROM activity_events WHERE project_id=$1 ORDER BY occurred_at DESC,id LIMIT $2 OFFSET $3",
      [projectId, limit, (page - 1) * limit],
    );
    return {
      items: events.map((e) => ({
        id: e.id,
        actorId: e.actor_id,
        action: e.action,
        details: e.details,
        occurredAt: e.occurred_at,
      })),
      total: count.n,
      page,
      limit,
    };
  }
}
