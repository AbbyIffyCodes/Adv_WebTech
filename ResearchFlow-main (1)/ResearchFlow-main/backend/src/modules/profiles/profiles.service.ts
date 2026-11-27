import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Profile } from "./entities/profile.entity";
import { WorkLink } from "./entities/work_link.entity";
import { ResearchInterest } from "./entities/research_interest.entity";
import { Skill } from "./entities/skill.entity";
import { UpdateProfileDto } from "./dto/profile.dto";
import { ProfileQueryDto } from "./dto/profile-query.dto";
import { CreateWorkLinkDto, UpdateWorkLinkDto } from "./dto/worklink.dto";
import { CreateProfileTagsDto } from "./dto/profiletags.dto";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { UserRole } from "../accounts/enums/user_role.enum";

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    @InjectRepository(WorkLink) private readonly links: Repository<WorkLink>,
  ) {}

  private requireOwner(actor: AuthUser, userId: string) {
    if (actor.id !== userId)
      throw new ForbiddenException("You can edit only your own profile");
  }

  private publicProfile(profile: Profile) {
    return {
      userId: profile.userId,
      fullName: profile.user.fullName,
      role: profile.user.role,
      bio: profile.bio,
      availability:
        profile.user.role === UserRole.SUPERVISOR ? profile.availability : null,
      capacity:
        profile.user.role === UserRole.SUPERVISOR ? profile.capacity : null,
      seekingSupervisor:
        profile.user.role === UserRole.STUDENT
          ? profile.seekingSupervisor
          : false,
      researchInterests: profile.researchInterests ?? [],
      skills: profile.skills ?? [],
      workLinks: (profile.workLinks ?? []).map((link) => ({
        id: link.id,
        label: link.label,
        url: link.url,
      })),
    };
  }

  async getProfiles(query: ProfileQueryDto) {
    const builder = this.profiles
      .createQueryBuilder("profile")
      .innerJoinAndSelect("profile.user", "user")
      .leftJoinAndSelect("profile.researchInterests", "interests")
      .leftJoinAndSelect("profile.skills", "skills")
      .leftJoinAndSelect("profile.workLinks", "workLinks")
      .where("user.is_active = :active", { active: true })
      .andWhere("user.role IN (:...directoryRoles)", {
        directoryRoles: [UserRole.STUDENT, UserRole.SUPERVISOR],
      });
    if (query.role) builder.andWhere("user.role = :role", { role: query.role });
    if (query.researchInterest)
      builder.andWhere(
        "EXISTS (SELECT 1 FROM profile_research_interests pri JOIN research_interests ri ON ri.id = pri.research_interest_id WHERE pri.profile_id = profile.user_id AND lower(ri.name) = :interest)",
        { interest: query.researchInterest },
      );
    if (query.skill)
      builder.andWhere(
        "EXISTS (SELECT 1 FROM profile_skills ps JOIN skills sk ON sk.id = ps.skill_id WHERE ps.profile_id = profile.user_id AND lower(sk.name) = :skill)",
        { skill: query.skill },
      );
    if (query.seekingSupervisor !== undefined) {
      builder.andWhere(
        "user.role = :studentRole AND profile.seeking_supervisor = :seeking",
        {
          studentRole: UserRole.STUDENT,
          seeking: query.seekingSupervisor,
        },
      );
    }
    const [profiles, total] = await builder
      .orderBy("profile.createdAt", "DESC")
      .addOrderBy("profile.userId", "ASC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: profiles.map((profile) => this.publicProfile(profile)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getProfileByUserId(userId: string) {
    const profile = await this.profiles.findOne({
      where: { userId, user: { isActive: true } },
      relations: {
        user: true,
        researchInterests: true,
        skills: true,
        workLinks: true,
      },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    return this.publicProfile(profile);
  }

  async updateProfile(actor: AuthUser, userId: string, dto: UpdateProfileDto) {
    this.requireOwner(actor, userId);
    if (
      actor.role !== UserRole.SUPERVISOR &&
      (dto.capacity !== undefined || dto.availability !== undefined)
    ) {
      throw new ForbiddenException(
        "Only supervisors can set supervision capacity or availability",
      );
    }
    if (
      actor.role !== UserRole.STUDENT &&
      dto.seekingSupervisor !== undefined
    ) {
      throw new ForbiddenException("Only students can set seekingSupervisor");
    }
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length) {
      let result;
      try {
        result = await this.profiles.update({ userId }, changes);
      } catch (error) {
        if (
          (error as { constraint?: string }).constraint ===
          "CK_profiles_reserved_capacity"
        )
          throw new ConflictException(
            "Capacity cannot be below active reserved student places",
          );
        throw error;
      }
      if (!result.affected) throw new NotFoundException("Profile not found");
    }
    return this.getProfileByUserId(userId);
  }

  async createWorkLink(
    actor: AuthUser,
    userId: string,
    dto: CreateWorkLinkDto,
  ) {
    this.requireOwner(actor, userId);
    const profile = await this.profiles.findOneBy({ userId });
    if (!profile) throw new NotFoundException("Profile not found");
    const link = await this.links.save(
      this.links.create({ label: dto.label, url: dto.url, profile }),
    );
    return { id: link.id, label: link.label, url: link.url };
  }

  async updateWorkLink(
    actor: AuthUser,
    userId: string,
    linkId: string,
    dto: UpdateWorkLinkDto,
  ) {
    this.requireOwner(actor, userId);
    const link = await this.links.findOne({
      where: { id: linkId, profile: { userId } },
    });
    if (!link) throw new NotFoundException("Work link not found");
    if (dto.label !== undefined) link.label = dto.label;
    if (dto.url !== undefined) link.url = dto.url;
    const saved = await this.links.save(link);
    return { id: saved.id, label: saved.label, url: saved.url };
  }

  async deleteWorkLink(actor: AuthUser, userId: string, linkId: string) {
    this.requireOwner(actor, userId);
    const link = await this.links.findOne({
      where: { id: linkId, profile: { userId } },
    });
    if (!link) throw new NotFoundException("Work link not found");
    await this.links.delete({ id: linkId });
    return { message: "Work link deleted" };
  }

  async saveTags(
    actor: AuthUser,
    userId: string,
    dto: CreateProfileTagsDto,
    replace: boolean,
  ) {
    this.requireOwner(actor, userId);
    await this.profiles.manager.transaction(async (manager) => {
      const profile = await manager
        .getRepository(Profile)
        .findOne({ where: { userId }, lock: { mode: "pessimistic_write" } });
      if (!profile) throw new NotFoundException("Profile not found");
      for (const field of ["researchInterests", "skills"] as const) {
        const names = dto[field];
        if (names === undefined || names === null) continue;
        const interest = field === "researchInterests";
        const table = interest
          ? "profile_research_interests"
          : "profile_skills";
        const foreignKey = interest ? "research_interest_id" : "skill_id";
        if (replace) {
          await manager
            .createQueryBuilder()
            .delete()
            .from(table)
            .where("profile_id = :id", { id: userId })
            .execute();
        }
        for (const name of names) {
          const tags = manager.getRepository<ResearchInterest | Skill>(
            interest ? ResearchInterest : Skill,
          );
          let tag = await tags
            .createQueryBuilder("tag")
            .where("lower(tag.name) = :name", { name })
            .getOne();
          if (!tag) {
            await tags.upsert({ name }, ["name"]);
            tag = await tags.findOneByOrFail({ name });
          }
          await manager
            .createQueryBuilder()
            .insert()
            .into(table)
            .values({ profile_id: userId, [foreignKey]: tag.id })
            .orIgnore()
            .execute();
        }
      }
    });
    return this.getProfileByUserId(userId);
  }
}
