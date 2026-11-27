import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager, In } from "typeorm";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { User } from "../accounts/entities/user.entity";
import { UserRole } from "../accounts/enums/user_role.enum";
import { ResearchInterest } from "../profiles/entities/research_interest.entity";
import { Skill } from "../profiles/entities/skill.entity";
import {
  CreateOpportunityDto,
  OpportunityQueryDto,
  OpportunityStatus,
  UpdateOpportunityDto,
} from "./dto/opportunity.dto";
import { Opportunity } from "./entities/opportunity.entity";
const relations = {
  areaTags: true,
  requiredSkills: true,
  preferredSkills: true,
  supervisor: true,
};
@Injectable()
export class OpportunitiesService {
  constructor(private readonly source: DataSource) {}
  private view(post: Opportunity) {
    const tags = (rows: { id: string; name: string }[] = []) =>
      rows
        .map((t) => ({ id: t.id, name: t.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return {
      id: post.id,
      supervisorId: post.supervisorId,
      supervisorName: post.supervisor?.fullName,
      title: post.title,
      description: post.description,
      criteria: post.criteria,
      areaTags: tags(post.areaTags),
      requiredSkills: tags(post.requiredSkills),
      preferredSkills: tags(post.preferredSkills),
      places: post.places,
      reservedPlaces: post.reservedPlaces,
      remainingPlaces: post.places - post.reservedPlaces,
      deadline: post.deadline,
      status: post.status,
      acceptingApplications:
        post.status === "open" &&
        post.deadline > new Date() &&
        post.reservedPlaces < post.places &&
        post.supervisor?.isActive === true &&
        post.supervisor.role === UserRole.SUPERVISOR,
      openedAt: post.openedAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }
  private date(value: string) {
    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(value))
      throw new BadRequestException("Deadline must include a timezone");
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date <= new Date())
      throw new BadRequestException("Deadline must be in the future");
    return date;
  }
  private async supervisor(manager: EntityManager, actor: AuthUser) {
    if (actor.role !== UserRole.SUPERVISOR)
      throw new ForbiddenException(
        "Only supervisors can manage research opportunities",
      );
    const user = await manager.getRepository(User).findOne({
      where: { id: actor.id },
      lock: { mode: "pessimistic_write" },
    });
    if (!user?.isActive || user.role !== UserRole.SUPERVISOR)
      throw new ForbiddenException();
  }
  private async assignTags(
    manager: EntityManager,
    post: Opportunity,
    dto: CreateOpportunityDto | UpdateOpportunityDto,
  ) {
    if (dto.areaTags !== undefined) {
      const repo = manager.getRepository(ResearchInterest);
      for (const name of [...dto.areaTags].sort())
        await repo.upsert({ name }, ["name"]);
      post.areaTags = await repo.findBy({ name: In(dto.areaTags) });
    }
    if (dto.requiredSkills !== undefined || dto.preferredSkills !== undefined) {
      const repo = manager.getRepository(Skill);
      const names = [
        ...new Set([
          ...(dto.requiredSkills ?? []),
          ...(dto.preferredSkills ?? []),
        ]),
      ].sort();
      for (const name of names) await repo.upsert({ name }, ["name"]);
      if (dto.requiredSkills !== undefined)
        post.requiredSkills = dto.requiredSkills.length
          ? await repo.findBy({ name: In(dto.requiredSkills) })
          : [];
      if (dto.preferredSkills !== undefined)
        post.preferredSkills = dto.preferredSkills.length
          ? await repo.findBy({ name: In(dto.preferredSkills) })
          : [];
    }
  }
  async create(actor: AuthUser, dto: CreateOpportunityDto) {
    const deadline = this.date(dto.deadline);
    return this.source.transaction(async (manager) => {
      await this.supervisor(manager, actor);
      const repo = manager.getRepository(Opportunity);
      const post = repo.create({
        supervisorId: actor.id,
        title: dto.title,
        description: dto.description,
        criteria: dto.criteria,
        places: dto.places,
        deadline,
      });
      await this.assignTags(manager, post, dto);
      await repo.save(post);
      return this.view(
        await repo.findOneOrFail({ where: { id: post.id }, relations }),
      );
    });
  }
  async get(actor: AuthUser, id: string) {
    const post = await this.source
      .getRepository(Opportunity)
      .findOne({ where: { id }, relations });
    if (
      !post ||
      (post.supervisorId !== actor.id &&
        (post.status === "draft" ||
          !post.supervisor.isActive ||
          post.supervisor.role !== UserRole.SUPERVISOR))
    )
      throw new NotFoundException("Opportunity not found");
    return this.view(post);
  }
  async list(actor: AuthUser, query: OpportunityQueryDto, mine = false) {
    const repo = this.source.getRepository(Opportunity);
    const base = repo
      .createQueryBuilder("post")
      .innerJoin("post.supervisor", "owner");
    if (mine) base.where("post.supervisor_id=:ownerId", { ownerId: actor.id });
    else
      base.where(
        "post.status='open' AND post.deadline>CURRENT_TIMESTAMP AND post.reserved_places<post.places AND owner.is_active=true AND owner.role=:role",
        { role: UserRole.SUPERVISOR },
      );
    if (query.supervisorId)
      base.andWhere("post.supervisor_id=:supervisorId", {
        supervisorId: query.supervisorId,
      });
    if (query.researchInterest)
      base.innerJoin("post.areaTags", "filterArea", "filterArea.name=:area", {
        area: query.researchInterest,
      });
    if (query.skill)
      base.andWhere(
        `(EXISTS(SELECT 1 FROM opportunity_required_skills rs JOIN skills s ON s.id=rs.skill_id WHERE rs.opportunity_id=post.id AND s.name=:skill) OR EXISTS(SELECT 1 FROM opportunity_preferred_skills ps JOIN skills s ON s.id=ps.skill_id WHERE ps.opportunity_id=post.id AND s.name=:skill))`,
        { skill: query.skill },
      );
    const [rows, total] = await base
      .clone()
      .orderBy("post.createdAt", "DESC")
      .addOrderBy("post.id", "ASC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const detailed = rows.length
      ? await base
          .clone()
          .andWhere("post.id IN (:...ids)", { ids: rows.map((p) => p.id) })
          .leftJoinAndSelect("post.supervisor", "supervisor")
          .leftJoinAndSelect("post.areaTags", "areas")
          .leftJoinAndSelect("post.requiredSkills", "required")
          .leftJoinAndSelect("post.preferredSkills", "preferred")
          .getMany()
      : [];
    const lookup = new Map(detailed.map((p) => [p.id, p]));
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
    work: (manager: EntityManager, post: Opportunity) => Promise<void>,
  ) {
    return this.source.transaction(async (manager) => {
      await this.supervisor(manager, actor);
      const repo = manager.getRepository(Opportunity);
      const post = await repo.findOne({
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!post) throw new NotFoundException("Opportunity not found");
      if (post.supervisorId !== actor.id)
        throw new ForbiddenException(
          "Only the owning supervisor can manage this opportunity",
        );
      await work(manager, post);
      await repo.save(post);
      return this.view(await repo.findOneOrFail({ where: { id }, relations }));
    });
  }
  async update(actor: AuthUser, id: string, dto: UpdateOpportunityDto) {
    return this.mutate(actor, id, async (manager, post) => {
      if (dto.title !== undefined) post.title = dto.title;
      if (dto.description !== undefined) post.description = dto.description;
      if (dto.criteria !== undefined) post.criteria = dto.criteria;
      if (dto.places !== undefined) {
        if (dto.places < post.reservedPlaces)
          throw new ConflictException(
            "Places cannot be below already reserved student places",
          );
        post.places = dto.places;
      }
      if (dto.deadline !== undefined) post.deadline = this.date(dto.deadline);
      await this.assignTags(manager, post, dto);
    });
  }
  async remove(actor: AuthUser, id: string) {
    return this.source.transaction(async (manager) => {
      await this.supervisor(manager, actor);
      const repo = manager.getRepository(Opportunity);
      const post = await repo.findOne({
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!post) throw new NotFoundException("Opportunity not found");
      if (post.supervisorId !== actor.id)
        throw new ForbiddenException(
          "Only the owner can delete this opportunity",
        );
      if (post.reservedPlaces > 0)
        throw new ConflictException(
          "End active supervision before deleting this opportunity",
        );
      const [refs] = await manager.query(
        `SELECT EXISTS(SELECT 1 FROM selection_requests WHERE opportunity_id=$1)
        OR EXISTS(SELECT 1 FROM suggestions WHERE opportunity_id=$1)
        OR EXISTS(SELECT 1 FROM supervisions WHERE opportunity_id=$1) AS used`,
        [id],
      );
      if (refs.used)
        throw new ConflictException(
          "This opportunity has research history; close recruitment instead",
        );
      await repo.remove(post);
      return { message: "Opportunity deleted" };
    });
  }
  async status(actor: AuthUser, id: string, status: OpportunityStatus) {
    return this.mutate(actor, id, async (_manager, post) => {
      if (status === OpportunityStatus.OPEN) {
        if (post.deadline <= new Date())
          throw new ConflictException(
            "Extend the expired deadline before opening applications",
          );
        if (post.reservedPlaces >= post.places)
          throw new ConflictException("No student places remain");
        post.openedAt ??= new Date();
      } else if (post.status === "draft")
        throw new ConflictException(
          "A draft must be opened before it can be closed",
        );
      post.status = status;
    });
  }
}
