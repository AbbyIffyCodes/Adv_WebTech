import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager, In, IsNull } from "typeorm";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { User } from "../accounts/entities/user.entity";
import { UserRole } from "../accounts/enums/user_role.enum";
import { GroupMember } from "../groups/entities/group-member.entity";
import { ResearchGroup } from "../groups/entities/research-group.entity";
import { ResearchInterest } from "../profiles/entities/research_interest.entity";
import {
  CreateProjectDto,
  ProjectQueryDto,
  UpdateProjectDto,
} from "./dto/project.dto";
import { Project } from "./entities/project.entity";

@Injectable()
export class ProjectsService {
  constructor(private readonly source: DataSource) {}
  private view(project: Project) {
    return {
      id: project.id,
      groupId: project.groupId,
      title: project.title,
      sharedSummary: project.sharedSummary,
      areaTags: (project.areaTags ?? []).map((t) => ({
        id: t.id,
        name: t.name,
      })),
      status: project.status,
      publishedAt: project.publishedAt,
      archivedAt: project.archivedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
  private async tags(manager: EntityManager, names: string[]) {
    const repo = manager.getRepository(ResearchInterest);
    // Sort shared tag locks to avoid inverse-order concurrent upserts.
    const sorted = [...new Set(names)].sort();
    for (const name of sorted) await repo.upsert({ name }, ["name"]);
    return repo.find({ where: { name: In(sorted) }, order: { name: "ASC" } });
  }
  private async leader(
    manager: EntityManager,
    actor: AuthUser,
    groupId: string,
  ) {
    if (actor.role !== UserRole.STUDENT)
      throw new ForbiddenException(
        "Only student group leaders can manage projects",
      );
    const user = await manager.getRepository(User).findOne({
      where: { id: actor.id },
      lock: { mode: "pessimistic_write" },
    });
    if (!user?.isActive || user.role !== UserRole.STUDENT)
      throw new ForbiddenException();
    const group = await manager
      .getRepository(ResearchGroup)
      .findOne({ where: { id: groupId }, lock: { mode: "pessimistic_write" } });
    if (!group || group.archivedAt)
      throw new NotFoundException("Active group not found");
    if (
      group.leaderId !== actor.id ||
      !(await manager
        .getRepository(GroupMember)
        .existsBy({ groupId, userId: actor.id, leftAt: IsNull() }))
    )
      throw new ForbiddenException(
        "Only the current group leader can manage this project",
      );
    return group;
  }
  private async transaction<T>(work: (manager: EntityManager) => Promise<T>) {
    try {
      return await this.source.transaction(work);
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException("This group already has an active project");
      throw error;
    }
  }
  async create(actor: AuthUser, dto: CreateProjectDto) {
    return this.transaction(async (manager) => {
      await this.leader(manager, actor, dto.groupId);
      const repo = manager.getRepository(Project);
      if (await repo.existsBy({ groupId: dto.groupId, archivedAt: IsNull() }))
        throw new ConflictException("This group already has an active project");
      const project = repo.create({
        groupId: dto.groupId,
        title: dto.title,
        sharedSummary: dto.sharedSummary,
        areaTags: await this.tags(manager, dto.areaTags),
      });
      return this.view(await repo.save(project));
    });
  }
  async mine(actor: AuthUser) {
    const membership = await this.source
      .getRepository(GroupMember)
      .findOneBy({ userId: actor.id, leftAt: IsNull() });
    if (!membership) return { project: null };
    const project = await this.source.getRepository(Project).findOne({
      where: { groupId: membership.groupId, archivedAt: IsNull() },
      relations: { areaTags: true },
    });
    return { project: project ? this.view(project) : null };
  }
  async get(actor: AuthUser, id: string) {
    const project = await this.source
      .getRepository(Project)
      .findOne({ where: { id }, relations: { areaTags: true, group: true } });
    if (!project) throw new NotFoundException("Project not found");
    const member = await this.source.getRepository(GroupMember).existsBy({
      groupId: project.groupId,
      userId: actor.id,
      leftAt: IsNull(),
    });
    if (
      !member &&
      (!project.publishedAt || project.archivedAt || project.group.archivedAt)
    )
      throw new NotFoundException("Project not found");
    return this.view(project);
  }
  async list(query: ProjectQueryDto) {
    const repo = this.source.getRepository(Project);
    const base = repo
      .createQueryBuilder("project")
      .innerJoin("project.group", "group")
      .where(
        "project.published_at IS NOT NULL AND project.archived_at IS NULL AND group.archived_at IS NULL",
      );
    if (query.researchInterest)
      base.innerJoin("project.areaTags", "filterTag", "filterTag.name = :tag", {
        tag: query.researchInterest,
      });
    const [rows, total] = await base
      .orderBy("project.createdAt", "DESC")
      .addOrderBy("project.id", "ASC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const projects = rows.length
      ? await base
          .clone()
          .andWhere("project.id IN (:...ids)", { ids: rows.map((p) => p.id) })
          .leftJoinAndSelect("project.areaTags", "allTags")
          .getMany()
      : [];
    const lookup = new Map(projects.map((p) => [p.id, p]));
    return {
      items: rows
        .filter((p) => lookup.has(p.id))
        .map((p) => this.view(lookup.get(p.id)!)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  private async mutate(
    actor: AuthUser,
    id: string,
    work: (
      manager: EntityManager,
      project: Project,
      group: ResearchGroup,
    ) => Promise<void>,
  ) {
    return this.transaction(async (manager) => {
      const repo = manager.getRepository(Project);
      const hint = await repo.findOneBy({ id });
      if (!hint) throw new NotFoundException("Project not found");
      const group = await this.leader(manager, actor, hint.groupId);
      const project = await repo.findOne({
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!project || project.archivedAt)
        throw new NotFoundException("Active project not found");
      await work(manager, project, group);
      await repo.save(project);
      return this.view(
        await repo.findOneOrFail({
          where: { id },
          relations: { areaTags: true },
        }),
      );
    });
  }
  async update(actor: AuthUser, id: string, dto: UpdateProjectDto) {
    return this.mutate(actor, id, async (manager, project, group) => {
      if (group.membershipLocked)
        throw new ConflictException(
          "Changes during supervision require a versioned proposal revision",
        );
      if (dto.title !== undefined) project.title = dto.title;
      if (dto.sharedSummary !== undefined)
        project.sharedSummary = dto.sharedSummary;
      if (dto.areaTags !== undefined)
        project.areaTags = await this.tags(manager, dto.areaTags);
    });
  }
  async visibility(actor: AuthUser, id: string, published: boolean) {
    return this.mutate(actor, id, async (_manager, project, group) => {
      if (group.membershipLocked)
        throw new ConflictException(
          "End active supervision before changing summary publication",
        );
      project.publishedAt = published
        ? (project.publishedAt ?? new Date())
        : null;
      project.status = published ? "seeking_supervisor" : "draft";
    });
  }
  async archive(actor: AuthUser, id: string) {
    return this.mutate(actor, id, async (_manager, project, group) => {
      if (group.membershipLocked)
        throw new ConflictException(
          "End active supervision before archiving this project",
        );
      project.archivedAt = new Date();
      project.publishedAt = null;
      project.status = "archived";
    });
  }
}
