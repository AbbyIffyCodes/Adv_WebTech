import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { UserRole } from "../accounts/enums/user_role.enum";
import {
  CreateGroupDto,
  GroupPaginationDto,
  InviteGroupMemberDto,
  TransferLeaderDto,
  UpdateGroupDto,
} from "./dto/group.dto";
import { GroupsService } from "./groups.service";

@ApiTags("Research groups")
@ApiBearerAuth()
@Controller("groups")
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}
  @Post()
  @Roles(UserRole.STUDENT)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateGroupDto) {
    return this.groups.create(actor, dto);
  }
  @Get()
  list(@Query() q: GroupPaginationDto) {
    return this.groups.list(q);
  }
  @Get("mine")
  @Roles(UserRole.STUDENT)
  mine(@CurrentUser() actor: AuthUser) {
    return this.groups.mine(actor);
  }
  @Get("invitations/me")
  @Roles(UserRole.STUDENT)
  invitationsForMe(
    @CurrentUser() actor: AuthUser,
    @Query() query: GroupPaginationDto,
  ) {
    return this.groups.invitationsForMe(actor, query);
  }
  @Post("invitations/:invitationId/accept")
  @HttpCode(200)
  @Roles(UserRole.STUDENT)
  accept(
    @CurrentUser() actor: AuthUser,
    @Param("invitationId", ParseUUIDPipe) id: string,
  ) {
    return this.groups.respond(actor, id, true);
  }
  @Post("invitations/:invitationId/decline")
  @HttpCode(200)
  @Roles(UserRole.STUDENT)
  decline(
    @CurrentUser() actor: AuthUser,
    @Param("invitationId", ParseUUIDPipe) id: string,
  ) {
    return this.groups.respond(actor, id, false);
  }
  @Get(":groupId")
  get(@Param("groupId", ParseUUIDPipe) id: string) {
    return this.groups.get(id);
  }
  @Patch(":groupId")
  @Roles(UserRole.STUDENT)
  update(
    @CurrentUser() actor: AuthUser,
    @Param("groupId", ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(actor, id, dto);
  }
  @Post(":groupId/invitations")
  @Roles(UserRole.STUDENT)
  invite(
    @CurrentUser() actor: AuthUser,
    @Param("groupId", ParseUUIDPipe) id: string,
    @Body() dto: InviteGroupMemberDto,
  ) {
    return this.groups.invite(actor, id, dto.inviteeId);
  }
  @Get(":groupId/invitations")
  @Roles(UserRole.STUDENT)
  invitationsForGroup(
    @CurrentUser() actor: AuthUser,
    @Param("groupId", ParseUUIDPipe) id: string,
    @Query() query: GroupPaginationDto,
  ) {
    return this.groups.invitationsForGroup(actor, id, query);
  }
  @Delete(":groupId/invitations/:invitationId")
  @Roles(UserRole.STUDENT)
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param("groupId", ParseUUIDPipe) id: string,
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
  ) {
    return this.groups.cancelInvitation(actor, id, invitationId);
  }
  @Post(":groupId/leave")
  @HttpCode(200)
  @Roles(UserRole.STUDENT)
  leave(
    @CurrentUser() actor: AuthUser,
    @Param("groupId", ParseUUIDPipe) id: string,
  ) {
    return this.groups.removeMember(actor, id, actor.id, true);
  }
  @Delete(":groupId/members/:userId")
  @Roles(UserRole.STUDENT)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param("groupId", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.groups.removeMember(actor, id, userId);
  }
  @Patch(":groupId/leader")
  @Roles(UserRole.STUDENT)
  transfer(
    @CurrentUser() actor: AuthUser,
    @Param("groupId", ParseUUIDPipe) id: string,
    @Body() dto: TransferLeaderDto,
  ) {
    return this.groups.transferLeader(actor, id, dto.leaderId);
  }
  @Delete(":groupId")
  @Roles(UserRole.STUDENT)
  archive(
    @CurrentUser() actor: AuthUser,
    @Param("groupId", ParseUUIDPipe) id: string,
  ) {
    return this.groups.archive(actor, id);
  }
}
