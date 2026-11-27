import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { UserRole } from "../accounts/enums/user_role.enum";
import { NotificationsService } from "./notifications.service";
interface ProjectSummary {
  id: string;
  groupId: string;
  title: string | null;
  status: string;
  totalMilestones: number;
  completedMilestones: number;
  awaitingMilestoneReview: number;
  overdueMilestones: number;
}
@Injectable()
export class DashboardService {
  constructor(
    private readonly source: DataSource,
    private readonly notifications: NotificationsService,
  ) {}
  private scope(a: AuthUser) {
    return a.role === UserRole.COORDINATOR
      ? "TRUE"
      : a.role === UserRole.SUPERVISOR
        ? `EXISTS(SELECT 1 FROM supervisions s WHERE s.project_id=p.id AND s.supervisor_id=$1 AND s.ended_at IS NULL)`
        : `EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=p.group_id AND gm.user_id=$1 AND gm.left_at IS NULL)`;
  }
  async projects(a: AuthUser, page: number, limit: number) {
    const sql = `FROM projects p JOIN research_groups g ON g.id=p.group_id WHERE p.archived_at IS NULL AND g.archived_at IS NULL AND (${this.scope(a)}) AND $1::uuid IS NOT NULL`;
    const [count] = await this.source.query(
      "SELECT count(*)::int total " + sql,
      [a.id],
    );
    const items: ProjectSummary[] = await this.source.query(
      `SELECT p.id,p.group_id AS "groupId",CASE WHEN p.published_at IS NOT NULL OR $4='student' THEN p.title ELSE NULL END title,p.status,
    (SELECT count(*)::int FROM milestones m WHERE m.project_id=p.id) AS "totalMilestones",
    (SELECT count(*)::int FROM milestones m WHERE m.project_id=p.id AND m.status='completed') AS "completedMilestones",
    (SELECT count(*)::int FROM milestones m WHERE m.project_id=p.id AND m.status='submitted_for_review') AS "awaitingMilestoneReview",
    (SELECT count(*)::int FROM milestones m WHERE m.project_id=p.id AND m.due_date<CURRENT_TIMESTAMP AND m.status NOT IN ('completed','submitted_for_review')) AS "overdueMilestones"
    ${sql} ORDER BY p.created_at DESC,p.id LIMIT $2 OFFSET $3`,
      [a.id, limit, (page - 1) * limit, a.role],
    );
    return {
      items: items.map((p) => ({
        ...p,
        progress: p.totalMilestones
          ? Math.round((10000 * p.completedMilestones) / p.totalMilestones) /
            100
          : null,
      })),
      total: count.total,
      page,
      limit,
    };
  }
  async get(a: AuthUser) {
    await this.notifications.refresh(a.id);
    const projects = await this.projects(a, 1, 20),
      unreadAlerts = await this.notifications.unread(a.id);
    if (a.role === UserRole.COORDINATOR) {
      const [counts] = await this.source.query(
        `SELECT (SELECT count(*)::int FROM users WHERE role='student' AND is_active=true) students,(SELECT count(*)::int FROM users WHERE role='supervisor' AND is_active=true) supervisors,(SELECT count(*)::int FROM supervisions WHERE ended_at IS NULL) AS "activePairings",(SELECT COALESCE(sum(reserved_places),0)::int FROM supervisions WHERE ended_at IS NULL) AS "reservedStudentPlaces",(SELECT count(*)::int FROM support_cases WHERE status<>'resolved') AS "openSupportCases",(SELECT count(*)::int FROM selection_requests WHERE status IN ('pending','offered') AND response_due<=CURRENT_TIMESTAMP) AS "unansweredRequests"`,
      );
      return { role: a.role, counts, projects, unreadAlerts };
    }
    if (a.role === UserRole.SUPERVISOR) {
      const [counts] = await this.source.query(
        `SELECT (SELECT capacity FROM profiles WHERE user_id=$1) capacity,(SELECT COALESCE(sum(reserved_places),0)::int FROM supervisions WHERE supervisor_id=$1 AND ended_at IS NULL) AS "reservedPlaces",(SELECT count(*)::int FROM selection_requests WHERE supervisor_id=$1 AND direction='application' AND status='pending' AND response_due>CURRENT_TIMESTAMP) AS "pendingApplications",(SELECT count(*)::int FROM opportunities WHERE supervisor_id=$1 AND status='open' AND deadline>CURRENT_TIMESTAMP AND reserved_places<places) AS "openOpportunities",(SELECT count(*)::int FROM submissions sub JOIN supervisions s ON s.project_id=sub.project_id AND s.ended_at IS NULL WHERE s.supervisor_id=$1 AND sub.status IN ('submitted','under_review') AND EXISTS(SELECT 1 FROM access_grants g WHERE g.project_id=sub.project_id AND g.grantee_id=$1 AND g.supervision_id=s.id AND g.revoked_at IS NULL)) AS "pendingReviews"`,
        [a.id],
      );
      return {
        role: a.role,
        counts: {
          ...counts,
          remainingPlaces: Math.max(
            0,
            (counts.capacity ?? 0) - counts.reservedPlaces,
          ),
        },
        projects,
        unreadAlerts,
      };
    }
    const [counts] = await this.source.query(
      `SELECT (SELECT count(*)::int FROM group_invitations WHERE invitee_id=$1 AND status='pending' AND expires_at>CURRENT_TIMESTAMP) AS "groupInvitations",(SELECT count(*)::int FROM selection_requests r JOIN projects p ON p.id=r.project_id JOIN research_groups g ON g.id=p.group_id WHERE g.leader_id=$1 AND r.response_due>CURRENT_TIMESTAMP AND ((r.direction='invitation' AND r.status='pending') OR r.status='offered')) AS "selectionResponsesDue",(SELECT count(*)::int FROM milestones WHERE owner_id=$1 AND status IN ('not_started','in_progress','revision_required')) AS "assignedWork",(SELECT count(*)::int FROM suggestions s JOIN support_cases c ON c.id=s.case_id JOIN projects p ON p.id=c.project_id JOIN research_groups g ON g.id=p.group_id WHERE g.leader_id=$1 AND s.response='pending' AND c.status<>'resolved') AS "supportResponsesDue"`,
      [a.id],
    );
    return { role: a.role, counts, projects, unreadAlerts };
  }
}
