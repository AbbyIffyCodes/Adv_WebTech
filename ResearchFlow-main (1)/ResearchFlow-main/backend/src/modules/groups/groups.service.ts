import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager, IsNull, LessThanOrEqual } from "typeorm";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { User } from "../accounts/entities/user.entity";
import { UserRole } from "../accounts/enums/user_role.enum";
import { ResearchGroup } from "./entities/research-group.entity";
import { Project } from "../projects/entities/project.entity";
import { GroupMember } from "./entities/group-member.entity";
import {
  GroupInvitation,
  GroupInvitationStatus as Status,
} from "./entities/group-invitation.entity";
import {
  CreateGroupDto,
  GroupPaginationDto,
  UpdateGroupDto,
} from "./dto/group.dto";

@Injectable()
export class GroupsService {
  constructor(private readonly source: DataSource) {}

  private requireStudent(actor: AuthUser) {
    if (actor.role !== UserRole.STUDENT)
      throw new ForbiddenException("Only students can manage research groups");
  }
  private async transaction<T>(work: (manager: EntityManager) => Promise<T>) {
    try {
      return await this.source.transaction(work);
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException(
          "An active group membership or pending invitation already exists",
        );
      throw error;
    }
  }
  private async lockStudents(manager: EntityManager, ids: string[]) {
    // Always lock users in the same order, before the group and invitation rows.
    for (const id of [...new Set(ids)].sort()) {
      const user = await manager
        .getRepository(User)
        .findOne({ where: { id }, lock: { mode: "pessimistic_write" } });
      if (!user || !user.isActive || user.role !== UserRole.STUDENT)
        throw new ConflictException(
          "Every participant must be an active student",
        );
    }
  }
  private async lockGroup(manager: EntityManager, id: string) {
    const group = await manager
      .getRepository(ResearchGroup)
      .findOne({ where: { id }, lock: { mode: "pessimistic_write" } });
    if (!group || group.archivedAt)
      throw new NotFoundException("Active research group not found");
    return group;
  }
  private requireLeader(actor: AuthUser, group: ResearchGroup) {
    if (actor.id !== group.leaderId)
      throw new ForbiddenException(
        "Only the group leader can perform this action",
      );
  }
  private requireUnlocked(group: ResearchGroup) {
    if (group.membershipLocked)
      throw new ConflictException(
        "Group membership is locked; supervision capacity and access must be rechecked first",
      );
  }
  private async requireNoGroup(manager: EntityManager, userId: string) {
    if (
      await manager
        .getRepository(GroupMember)
        .existsBy({ userId, leftAt: IsNull() })
    )
      throw new ConflictException(
        "Student already belongs to an active research group",
      );
  }
  private invitationView(invitation: GroupInvitation) {
    return {
      id: invitation.id,
      groupId: invitation.groupId,
      inviteeId: invitation.inviteeId,
      invitedById: invitation.invitedById,
      status:
        invitation.status === Status.PENDING &&
        invitation.expiresAt <= new Date()
          ? Status.EXPIRED
          : invitation.status,
      expiresAt: invitation.expiresAt,
      respondedAt: invitation.respondedAt,
      createdAt: invitation.createdAt,
    };
  }

  async create(actor: AuthUser, dto: CreateGroupDto) {
    this.requireStudent(actor);
    const id = await this.transaction(async (manager) => {
      await this.lockStudents(manager, [actor.id]);
      await this.requireNoGroup(manager, actor.id);
      const groups = manager.getRepository(ResearchGroup);
      const group = await groups.save(
        groups.create({
          name: dto.name,
          description: dto.description ?? null,
          leaderId: actor.id,
        }),
      );
      await manager
        .getRepository(GroupMember)
        .save({ groupId: group.id, userId: actor.id });
      return group.id;
    });
    return this.get(id);
  }
  async list(q: GroupPaginationDto) {
    const [groups, total] = await this.source
      .getRepository(ResearchGroup)
      .findAndCount({
        where: { archivedAt: IsNull() },
        order: { createdAt: "DESC", id: "ASC" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      });
    return {
      items: await Promise.all(groups.map((g) => this.get(g.id))),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
  async mine(actor: AuthUser) {
    this.requireStudent(actor);
    const member = await this.source
      .getRepository(GroupMember)
      .findOneBy({ userId: actor.id, leftAt: IsNull() });
    return { group: member ? await this.get(member.groupId) : null };
  }
  async get(id: string) {
    const group = await this.source
      .getRepository(ResearchGroup)
      .findOneBy({ id });
    if (!group) throw new NotFoundException("Research group not found");
    const members = await this.source.getRepository(GroupMember).find({
      where: { groupId: id, leftAt: IsNull() },
      relations: { user: true },
      order: { joinedAt: "ASC", userId: "ASC" },
    });
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      leaderId: group.leaderId,
      membershipLocked: group.membershipLocked,
      archivedAt: group.archivedAt,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      members: members.map((member) => ({
        userId: member.userId,
        fullName: member.user.fullName,
        role: member.user.role,
        joinedAt: member.joinedAt,
      })),
      memberCount: members.length,
    };
  }
  async update(actor: AuthUser, id: string, dto: UpdateGroupDto) {
    this.requireStudent(actor);
    await this.transaction(async (manager) => {
      await this.lockStudents(manager, [actor.id]);
      const group = await this.lockGroup(manager, id);
      this.requireLeader(actor, group);
      if (dto.name !== undefined) group.name = dto.name;
      if (dto.description !== undefined) group.description = dto.description;
      await manager.getRepository(ResearchGroup).save(group);
    });
    return this.get(id);
  }
  async invite(actor: AuthUser, id: string, inviteeId: string) {
    this.requireStudent(actor);
    if (actor.id === inviteeId)
      throw new ConflictException("You are already the group leader");
    return this.transaction(async (manager) => {
      await this.lockStudents(manager, [actor.id, inviteeId]);
      const group = await this.lockGroup(manager, id);
      this.requireLeader(actor, group);
      this.requireUnlocked(group);
      await this.requireNoGroup(manager, inviteeId);
      const invitations = manager.getRepository(GroupInvitation);
      const now = new Date();
      // Retire expired rows before enforcing the pending-invitation unique index.
      await invitations.update(
        {
          groupId: id,
          inviteeId,
          status: Status.PENDING,
          expiresAt: LessThanOrEqual(now),
        },
        { status: Status.EXPIRED },
      );
      if (
        await invitations.existsBy({
          groupId: id,
          inviteeId,
          status: Status.PENDING,
        })
      )
        throw new ConflictException(
          "Student already has a pending invitation to this group",
        );
      const invitation = await invitations.save(
        invitations.create({
          groupId: id,
          inviteeId,
          invitedById: actor.id,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        }),
      );
      return this.invitationView(invitation);
    });
  }
  async invitationsForMe(actor: AuthUser, query: GroupPaginationDto) {
    this.requireStudent(actor);
    const [rows, total] = await this.source
      .getRepository(GroupInvitation)
      .findAndCount({
        where: { inviteeId: actor.id },
        relations: { group: true },
        order: { createdAt: "DESC", id: "ASC" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
    return {
      items: rows.map((row) => ({
        ...this.invitationView(row),
        group: {
          id: row.group.id,
          name: row.group.name,
          leaderId: row.group.leaderId,
          archivedAt: row.group.archivedAt,
        },
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  async invitationsForGroup(
    actor: AuthUser,
    id: string,
    query: GroupPaginationDto,
  ) {
    this.requireStudent(actor);
    const group = await this.source
      .getRepository(ResearchGroup)
      .findOneBy({ id });
    if (!group || group.archivedAt)
      throw new NotFoundException("Active research group not found");
    this.requireLeader(actor, group);
    const [rows, total] = await this.source
      .getRepository(GroupInvitation)
      .findAndCount({
        where: { groupId: id },
        order: { createdAt: "DESC", id: "ASC" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
    return {
      items: rows.map((row) => this.invitationView(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  async respond(actor: AuthUser, invitationId: string, accept: boolean) {
    this.requireStudent(actor);
    const invitation = await this.source
      .getRepository(GroupInvitation)
      .findOneBy({ id: invitationId, inviteeId: actor.id });
    if (!invitation) throw new NotFoundException("Invitation not found");
    return this.transaction(async (manager) => {
      await this.lockStudents(manager, [actor.id]);
      const group = await this.lockGroup(manager, invitation.groupId);
      const invitations = manager.getRepository(GroupInvitation);
      const current = await invitations.findOne({
        where: { id: invitationId, inviteeId: actor.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!current) throw new NotFoundException("Invitation not found");
      if (current.status !== Status.PENDING || current.expiresAt <= new Date())
        throw new ConflictException(
          "Invitation is no longer pending or has expired",
        );
      if (accept) {
        this.requireUnlocked(group);
        await this.requireNoGroup(manager, actor.id);
        const members = manager.getRepository(GroupMember);
        const previous = await members.findOneBy({
          groupId: group.id,
          userId: actor.id,
        });
        if (previous) {
          previous.leftAt = null;
          previous.joinedAt = new Date();
          await members.save(previous);
        } else
          await members.save(
            members.create({ groupId: group.id, userId: actor.id }),
          );
      }
      current.status = accept ? Status.ACCEPTED : Status.DECLINED;
      current.respondedAt = new Date();
      await invitations.save(current);
      return this.invitationView(current);
    });
  }
  async cancelInvitation(actor: AuthUser, id: string, invitationId: string) {
    this.requireStudent(actor);
    return this.transaction(async (manager) => {
      await this.lockStudents(manager, [actor.id]);
      const group = await this.lockGroup(manager, id);
      this.requireLeader(actor, group);
      const invitations = manager.getRepository(GroupInvitation);
      const invitation = await invitations.findOne({
        where: { id: invitationId, groupId: id },
        lock: { mode: "pessimistic_write" },
      });
      if (!invitation) throw new NotFoundException("Invitation not found");
      if (
        invitation.status !== Status.PENDING ||
        invitation.expiresAt <= new Date()
      )
        throw new ConflictException(
          "Invitation is no longer pending or has expired",
        );
      invitation.status = Status.CANCELLED;
      invitation.respondedAt = new Date();
      return this.invitationView(await invitations.save(invitation));
    });
  }
  async removeMember(
    actor: AuthUser,
    id: string,
    userId: string,
    leaving = false,
  ) {
    this.requireStudent(actor);
    await this.transaction(async (manager) => {
      await this.lockStudents(manager, [actor.id, userId]);
      const group = await this.lockGroup(manager, id);
      if (!leaving) this.requireLeader(actor, group);
      else if (actor.id !== userId) throw new ForbiddenException();
      this.requireUnlocked(group);
      if (userId === group.leaderId)
        throw new ConflictException(
          "Transfer leadership to another member or archive the group before leaving",
        );
      const members = manager.getRepository(GroupMember);
      const member = await members.findOneBy({
        groupId: id,
        userId,
        leftAt: IsNull(),
      });
      if (!member) throw new NotFoundException("Active member not found");
      member.leftAt = new Date();
      await members.save(member);
    });
    return { message: leaving ? "You left the group" : "Member removed" };
  }
  async transferLeader(actor: AuthUser, id: string, leaderId: string) {
    this.requireStudent(actor);
    await this.transaction(async (manager) => {
      await this.lockStudents(manager, [actor.id, leaderId]);
      const group = await this.lockGroup(manager, id);
      this.requireLeader(actor, group);
      this.requireUnlocked(group);
      if (
        !(await manager
          .getRepository(GroupMember)
          .existsBy({ groupId: id, userId: leaderId, leftAt: IsNull() }))
      )
        throw new ConflictException(
          "New leader must be an active member of this group",
        );
      group.leaderId = leaderId;
      await manager.getRepository(ResearchGroup).save(group);
    });
    return this.get(id);
  }
  async archive(actor: AuthUser, id: string) {
    this.requireStudent(actor);
    await this.transaction(async (manager) => {
      await this.lockStudents(manager, [actor.id]);
      const group = await this.lockGroup(manager, id);
      this.requireLeader(actor, group);
      this.requireUnlocked(group);
      if (
        await manager
          .getRepository(Project)
          .existsBy({ groupId: id, archivedAt: IsNull() })
      )
        throw new ConflictException(
          "Archive the group's active project before archiving the group",
        );
      const now = new Date();
      group.archivedAt = now;
      await manager.getRepository(ResearchGroup).save(group);
      await manager
        .getRepository(GroupMember)
        .update({ groupId: id, leftAt: IsNull() }, { leftAt: now });
      await manager
        .getRepository(GroupInvitation)
        .update(
          { groupId: id, status: Status.PENDING },
          { status: Status.CANCELLED, respondedAt: now },
        );
    });
    return { message: "Research group archived" };
  }
}
