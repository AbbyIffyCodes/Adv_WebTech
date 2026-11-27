import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager, IsNull } from "typeorm";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { UserRole } from "../accounts/enums/user_role.enum";
import { User } from "../accounts/entities/user.entity";
import { Project } from "../projects/entities/project.entity";
import { ResearchGroup } from "../groups/entities/research-group.entity";
import { GroupMember } from "../groups/entities/group-member.entity";
import { ActivityEvent } from "../selection/entities/activity-event.entity";
import { SelectionRequest } from "../selection/entities/selection-request.entity";
import { SelectionService } from "../selection/selection.service";
import { Opportunity } from "../opportunities/entities/opportunity.entity";
import { SupportCase } from "./entities/support-case.entity";
import { Suggestion } from "./entities/suggestion.entity";
import {
  CreateSupportCaseDto,
  CreateSuggestionDto,
  RespondSuggestionDto,
  SupportQueryDto,
  UpdateSupportStatusDto,
} from "./dto/support.dto";
@Injectable()
export class SupportService {
  constructor(
    private readonly source: DataSource,
    private readonly selection: SelectionService,
  ) {}
  private coordinator(a: AuthUser) {
    if (a.role !== UserRole.COORDINATOR)
      throw new ForbiddenException("Coordinator role required");
  }
  private async member(
    m: EntityManager,
    a: AuthUser,
    project: Project,
    leader = false,
  ) {
    const group = await m
      .getRepository(ResearchGroup)
      .findOneBy({ id: project.groupId });
    if (
      a.role !== UserRole.STUDENT ||
      !group ||
      !(await m
        .getRepository(GroupMember)
        .existsBy({ groupId: group.id, userId: a.id, leftAt: IsNull() })) ||
      (leader && group.leaderId !== a.id)
    )
      throw new ForbiddenException(
        "Current group membership and leader permission are required for this action",
      );
  }
  private async audit(
    m: EntityManager,
    a: AuthUser,
    projectId: string,
    action: string,
    details: Record<string, unknown>,
  ) {
    await m
      .getRepository(ActivityEvent)
      .save({ projectId, actorId: a.id, action, details });
  }
  private async locked<T>(
    a: AuthUser,
    projectId: string,
    work: (m: EntityManager, p: Project) => Promise<T>,
  ) {
    return this.source.transaction(async (m) => {
      const user = await m
        .getRepository(User)
        .findOne({ where: { id: a.id }, lock: { mode: "pessimistic_write" } });
      if (!user?.isActive || user.role !== a.role)
        throw new ForbiddenException();
      const hint = await m.getRepository(Project).findOneBy({ id: projectId });
      if (!hint) throw new NotFoundException("Project not found");
      const group = await m
        .getRepository(ResearchGroup)
        .findOne({
          where: { id: hint.groupId },
          lock: { mode: "pessimistic_write" },
        });
      const project = await m
        .getRepository(Project)
        .findOne({
          where: { id: projectId },
          lock: { mode: "pessimistic_write" },
        });
      if (!project || project.archivedAt || group?.archivedAt)
        throw new NotFoundException("Active project not found");
      return work(m, project);
    });
  }
  async create(a: AuthUser, d: CreateSupportCaseDto) {
    return this.locked(a, d.projectId, async (m, p) => {
      if (a.role !== UserRole.COORDINATOR) await this.member(m, a, p);
      if (d.requestId) {
        const r = await m
          .getRepository(SelectionRequest)
          .findOneBy({ id: d.requestId, projectId: p.id });
        if (!r)
          throw new BadRequestException(
            "Linked request must belong to this project",
          );
        if (d.reason === "declined" && r.status !== "declined")
          throw new ConflictException("Linked request has not been declined");
        if (
          d.reason === "unanswered" &&
          (!["pending", "offered", "expired"].includes(r.status) ||
            r.responseDue > new Date())
        )
          throw new ConflictException(
            "Linked request has not passed its response deadline",
          );
      }
      const saved = await m
        .getRepository(SupportCase)
        .save({
          projectId: p.id,
          raisedBy: a.id,
          reason: d.reason,
          description: d.description,
          requestId: d.requestId ?? null,
        });
      await this.audit(m, a, p.id, "support.created", {
        caseId: saved.id,
        reason: d.reason,
      });
      return saved;
    });
  }
  async get(a: AuthUser, id: string) {
    const c = await this.source.getRepository(SupportCase).findOneBy({ id });
    if (!c) throw new NotFoundException("Case not found");
    const p = await this.source
      .getRepository(Project)
      .findOneByOrFail({ id: c.projectId });
    if (a.role !== UserRole.COORDINATOR)
      await this.member(this.source.manager, a, p);
    return {
      ...c,
      projectSummary: {
        id: p.id,
        title: p.publishedAt ? p.title : null,
        sharedSummary: p.publishedAt ? p.sharedSummary : null,
        status: p.status,
      },
      suggestions: await this.source
        .getRepository(Suggestion)
        .find({
          where: { caseId: id },
          order: { createdAt: "ASC", id: "ASC" },
        }),
    };
  }
  async list(a: AuthUser, q: SupportQueryDto) {
    const b = this.source.getRepository(SupportCase).createQueryBuilder("c");
    if (a.role !== UserRole.COORDINATOR) {
      if (a.role !== UserRole.STUDENT) throw new ForbiddenException();
      b.where(
        "EXISTS(SELECT 1 FROM projects p JOIN group_members gm ON gm.group_id=p.group_id WHERE p.id=c.project_id AND gm.user_id=:user AND gm.left_at IS NULL)",
        { user: a.id },
      );
    }
    if (q.projectId)
      b.andWhere("c.project_id=:project", { project: q.projectId });
    if (q.status) b.andWhere("c.status=:status", { status: q.status });
    const [items, total] = await b
      .orderBy("c.createdAt", "DESC")
      .addOrderBy("c.id", "ASC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return { items, total, page: q.page, limit: q.limit };
  }
  private async target(
    m: EntityManager,
    p: Project,
    d: {
      supervisorId?: string | null;
      opportunityId?: string | null;
      researchDirection?: string | null;
    },
  ) {
    if (
      [d.supervisorId, d.opportunityId, d.researchDirection].filter(
        (v) => v != null,
      ).length !== 1
    )
      throw new BadRequestException(
        "Suggest exactly one supervisor, opportunity or research direction",
      );
    const members = await m
      .getRepository(GroupMember)
      .countBy({ groupId: p.groupId, leftAt: IsNull() });
    let supervisorId = d.supervisorId;
    if (d.opportunityId) {
      const post = await m
        .getRepository(Opportunity)
        .findOneBy({ id: d.opportunityId });
      if (
        !post ||
        post.status !== "open" ||
        post.deadline <= new Date() ||
        post.places - post.reservedPlaces < members
      )
        throw new ConflictException(
          "Opportunity is unavailable or has insufficient student places",
        );
      supervisorId = post.supervisorId;
    }
    if (supervisorId) {
      const available = await this.selection.capacity(supervisorId);
      if (available.remainingPlaces < members)
        throw new ConflictException(
          "Suggested supervisor has insufficient student places",
        );
    }
  }
  private async caseMutation<T>(
    a: AuthUser,
    id: string,
    work: (m: EntityManager, p: Project, c: SupportCase) => Promise<T>,
  ) {
    const hint = await this.source.getRepository(SupportCase).findOneBy({ id });
    if (!hint) throw new NotFoundException("Case not found");
    return this.locked(a, hint.projectId, async (m, p) => {
      const c = await m
        .getRepository(SupportCase)
        .findOne({ where: { id }, lock: { mode: "pessimistic_write" } });
      if (!c) throw new NotFoundException();
      return work(m, p, c);
    });
  }
  async suggest(a: AuthUser, id: string, d: CreateSuggestionDto) {
    this.coordinator(a);
    return this.caseMutation(a, id, async (m, p, c) => {
      if (c.status === "resolved")
        throw new ConflictException(
          "Reopen the case before suggesting alternatives",
        );
      await this.target(m, p, d);
      const suggestion = await m
        .getRepository(Suggestion)
        .save({
          caseId: id,
          coordinatorId: a.id,
          supervisorId: d.supervisorId ?? null,
          opportunityId: d.opportunityId ?? null,
          researchDirection: d.researchDirection ?? null,
          explanation: d.explanation,
        });
      c.status = "awaiting_student";
      await m.getRepository(SupportCase).save(c);
      await this.audit(m, a, p.id, "support.suggested", {
        caseId: id,
        suggestionId: suggestion.id,
      });
      return suggestion;
    });
  }
  async respond(a: AuthUser, id: string, d: RespondSuggestionDto) {
    const hint = await this.source.getRepository(Suggestion).findOneBy({ id });
    if (!hint) throw new NotFoundException("Suggestion not found");
    return this.caseMutation(a, hint.caseId, async (m, p, c) => {
      await this.member(m, a, p, true);
      if (c.status === "resolved")
        throw new ConflictException("Case is resolved");
      const suggestion = await m
        .getRepository(Suggestion)
        .findOne({ where: { id }, lock: { mode: "pessimistic_write" } });
      if (!suggestion || suggestion.response !== "pending")
        throw new ConflictException("Suggestion already answered");
      if (d.response === "accepted") await this.target(m, p, suggestion);
      suggestion.response = d.response;
      suggestion.responseReason = d.reason;
      suggestion.respondedBy = a.id;
      suggestion.respondedAt = new Date();
      await m.getRepository(Suggestion).save(suggestion);
      const pending = await m
        .getRepository(Suggestion)
        .countBy({ caseId: c.id, response: "pending" });
      c.status = pending ? "awaiting_student" : "in_review";
      await m.getRepository(SupportCase).save(c);
      await this.audit(m, a, p.id, "support.suggestion_" + d.response, {
        caseId: c.id,
        suggestionId: id,
        reason: d.reason,
      });
      return {
        suggestion,
        message:
          "Response recorded. Any new pairing still requires mutual confirmation and document consent; direction changes require a proposal revision.",
      };
    });
  }
  async status(a: AuthUser, id: string, d: UpdateSupportStatusDto) {
    this.coordinator(a);
    return this.caseMutation(a, id, async (m, p, c) => {
      if (c.status === "resolved")
        throw new ConflictException("Case is already resolved");
      if (
        await m
          .getRepository(Suggestion)
          .existsBy({ caseId: id, response: "pending" })
      )
        throw new ConflictException(
          "Wait for the group leader to answer pending suggestions",
        );
      c.status = d.status;
      c.resolutionNote = d.note;
      c.resolvedAt = d.status === "resolved" ? new Date() : null;
      await m.getRepository(SupportCase).save(c);
      await this.audit(m, a, p.id, "support." + d.status, {
        caseId: id,
        note: d.note,
      });
      return c;
    });
  }
  async reopen(a: AuthUser, id: string, reason: string) {
    return this.caseMutation(a, id, async (m, p, c) => {
      if (a.role !== UserRole.COORDINATOR) await this.member(m, a, p, true);
      if (c.status !== "resolved")
        throw new ConflictException("Only a resolved case can be reopened");
      c.status = "open";
      c.resolvedAt = null;
      c.resolutionNote = null;
      await m.getRepository(SupportCase).save(c);
      await this.audit(m, a, p.id, "support.reopened", { caseId: id, reason });
      return c;
    });
  }
  async attention(a: AuthUser, page: number, limit: number) {
    this.coordinator(a);
    const items = await this.source.query(
      `SELECT id,project_id AS "projectId",status,reason,created_at AS "createdAt" FROM support_cases WHERE status<>'resolved' ORDER BY created_at DESC,id LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit],
    );
    const [n] = await this.source.query(
      "SELECT count(*)::int total FROM support_cases WHERE status<>'resolved'",
    );
    const [counts] = await this.source.query(
      `SELECT count(*) FILTER(WHERE status='declined')::int declined,count(*) FILTER(WHERE status IN ('pending','offered') AND response_due<=CURRENT_TIMESTAMP)::int unanswered FROM selection_requests`,
    );
    return { items, total: n.total, page, limit, selectionSignals: counts };
  }
}
