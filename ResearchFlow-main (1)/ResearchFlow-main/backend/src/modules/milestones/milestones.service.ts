import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, IsNull } from "typeorm";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { SelectionService } from "../selection/selection.service";
import { Supervision } from "../selection/entities/supervision.entity";
import { ActivityEvent } from "../selection/entities/activity-event.entity";
import { Project } from "../projects/entities/project.entity";
import { ResearchGroup } from "../groups/entities/research-group.entity";
import { GroupMember } from "../groups/entities/group-member.entity";
import { Submission } from "../submissions/entities/submission.entity";
import { UserRole } from "../accounts/enums/user_role.enum";
import { User } from "../accounts/entities/user.entity";
import { CreateMilestoneDto, UpdateMilestoneDto } from "./dto/milestone.dto";
import { Milestone } from "./entities/milestone.entity";
@Injectable()
export class MilestonesService {
  constructor(
    private readonly source: DataSource,
    private readonly selection: SelectionService,
  ) {}
  private view(m: Milestone) {
    return {
      ...m,
      overdue:
        m.dueDate < new Date() &&
        !["submitted_for_review", "completed"].includes(m.status),
      awaitingReview: m.status === "submitted_for_review",
    };
  }
  private date(value: string) {
    const date = new Date(value);
    if (
      !/(Z|[+-]\d{2}:\d{2})$/i.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date <= new Date()
    )
      throw new BadRequestException("Use a future deadline with a timezone");
    return date;
  }
  async list(actor: AuthUser, projectId: string, page: number, limit: number) {
    await this.selection.list(actor, projectId, 1, 1);
    if (actor.role === UserRole.SUPERVISOR) {
      const s = await this.source
        .getRepository(Supervision)
        .findOneBy({ projectId, supervisorId: actor.id, endedAt: IsNull() });
      if (!s) throw new ForbiddenException();
    }
    const [items, total] = await this.source
      .getRepository(Milestone)
      .findAndCount({
        where: { projectId },
        order: { dueDate: "ASC", id: "ASC" },
        skip: (page - 1) * limit,
        take: limit,
      });
    const counts = await this.source.query(
      `SELECT count(*)::int total,count(*) FILTER(WHERE status='completed')::int completed,count(*) FILTER(WHERE status='submitted_for_review')::int awaiting_review,count(*) FILTER(WHERE due_date<CURRENT_TIMESTAMP AND status NOT IN ('submitted_for_review','completed'))::int overdue FROM milestones WHERE project_id=$1`,
      [projectId],
    );
    const c = counts[0];
    return {
      items: items.map((m) => this.view(m)),
      total,
      page,
      limit,
      progress: {
        total: c.total,
        completed: c.completed,
        percentage: c.total
          ? Math.round((10000 * c.completed) / c.total) / 100
          : null,
        state: c.total ? "planned" : "not_yet_planned",
        awaitingReview: c.awaiting_review,
        overdue: c.overdue,
      },
    };
  }
  async save(
    actor: AuthUser,
    projectId: string,
    dto: CreateMilestoneDto | UpdateMilestoneDto,
    id?: string,
  ) {
    if (actor.role !== UserRole.SUPERVISOR) throw new ForbiddenException();
    await this.selection.assertDocumentAccess(actor, projectId);
    return this.source.transaction(async (m) => {
      await m.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [actor.id]);
      const hint = await m.getRepository(Project).findOneBy({ id: projectId });
      if (!hint || hint.archivedAt) throw new NotFoundException();
      await m.getRepository(ResearchGroup).findOne({
        where: { id: hint.groupId },
        lock: { mode: "pessimistic_write" },
      });
      await m.getRepository(Project).findOne({
        where: { id: projectId },
        lock: { mode: "pessimistic_write" },
      });
      const pair = await m
        .getRepository(Supervision)
        .findOneBy({ projectId, supervisorId: actor.id, endedAt: IsNull() });
      if (!pair)
        throw new ForbiddenException(
          "Only the active confirmed supervisor can plan milestones",
        );
      await this.selection.assertDocumentAccess(actor, projectId);
      const latest = await m.getRepository(Submission).findOne({
        where: { projectId, kind: "proposal" },
        order: { versionNo: "DESC" },
      });
      if (latest?.status !== "approved")
        throw new ConflictException(
          "Approve the latest proposal before milestone planning",
        );
      const repo = m.getRepository(Milestone);
      let task = id
        ? await repo.findOneBy({ id, projectId })
        : repo.create({ projectId });
      if (!task) throw new NotFoundException("Milestone not found");
      if (["completed", "submitted_for_review"].includes(task.status))
        throw new ConflictException(
          "Completed tasks and tasks awaiting review cannot be rewritten",
        );
      if (dto.ownerId !== undefined) {
        if (
          !(await m
            .getRepository(User)
            .existsBy({
              id: dto.ownerId,
              isActive: true,
              role: UserRole.STUDENT,
            }))
        )
          throw new ConflictException("Owner must be an active student");
        if (
          !(await m.getRepository(GroupMember).existsBy({
            groupId: hint.groupId,
            userId: dto.ownerId,
            leftAt: IsNull(),
          }))
        )
          throw new ConflictException(
            "Milestone owner must be a current group member",
          );
        task.ownerId = dto.ownerId;
      }
      if (dto.title !== undefined) task.title = dto.title;
      if (dto.description !== undefined) task.description = dto.description;
      if (dto.dueDate !== undefined) task.dueDate = this.date(dto.dueDate);
      task = await repo.save(task);
      await m.getRepository(ActivityEvent).save({
        projectId,
        actorId: actor.id,
        action: id ? "milestone.plan_updated" : "milestone.created",
        details: {
          milestoneId: task.id,
          ownerId: task.ownerId,
          dueDate: task.dueDate,
        },
      });
      return this.view(task);
    });
  }
  async start(actor: AuthUser, id: string) {
    const task = await this.source.getRepository(Milestone).findOneBy({ id });
    if (!task) throw new NotFoundException();
    await this.selection.assertDocumentAccess(actor, task.projectId);
    return this.source.transaction(async (m) => {
      await m.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [actor.id]);
      const project = await m
        .getRepository(Project)
        .findOneByOrFail({ id: task.projectId });
      await m.getRepository(ResearchGroup).findOne({
        where: { id: project.groupId },
        lock: { mode: "pessimistic_write" },
      });
      await m.getRepository(Project).findOne({
        where: { id: project.id },
        lock: { mode: "pessimistic_write" },
      });
      const row = await m.getRepository(Milestone).findOneByOrFail({ id });
      if (actor.role !== UserRole.STUDENT || row.ownerId !== actor.id)
        throw new ForbiddenException(
          "Only the assigned owner can start this task",
        );
      if (
        !(await m.getRepository(GroupMember).existsBy({
          groupId: project.groupId,
          userId: actor.id,
          leftAt: IsNull(),
        }))
      )
        throw new ForbiddenException();
      if (
        !(await m
          .getRepository(Supervision)
          .existsBy({ projectId: project.id, endedAt: IsNull() }))
      )
        throw new ConflictException("Active supervision required");
      if (!["not_started", "revision_required"].includes(row.status))
        throw new ConflictException("Milestone cannot start from this state");
      row.status = "in_progress";
      await m.getRepository(Milestone).save(row);
      await m.getRepository(ActivityEvent).save({
        projectId: project.id,
        actorId: actor.id,
        action: "milestone.started",
        details: { milestoneId: id },
      });
      return this.view(row);
    });
  }
  async projectFor(id: string) {
    const m = await this.source.getRepository(Milestone).findOneBy({ id });
    if (!m) throw new NotFoundException("Milestone not found");
    return m.projectId;
  }
}
