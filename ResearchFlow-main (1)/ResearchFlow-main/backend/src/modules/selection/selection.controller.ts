import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { UserRole } from "../accounts/enums/user_role.enum";
import { GroupPaginationDto } from "../groups/dto/group.dto";
import {
  AccessGrantDto,
  ApplicationDto,
  ConfirmationDto,
  DecisionDto,
  SelectionQueryDto,
  SelectionStartDto,
} from "./dto/selection.dto";
import { SelectionService } from "./selection.service";
@ApiTags("Selection, supervision and document consent")
@ApiBearerAuth()
@Controller()
export class SelectionController {
  constructor(private readonly selection: SelectionService) {}
  @Post("selection/applications") @Roles(UserRole.STUDENT) application(
    @CurrentUser() a: AuthUser,
    @Body() d: ApplicationDto,
  ) {
    return this.selection.application(a, d);
  }
  @Post("selection/invitations") @Roles(UserRole.SUPERVISOR) invitation(
    @CurrentUser() a: AuthUser,
    @Body() d: SelectionStartDto,
  ) {
    return this.selection.invitation(a, d);
  }
  @Get("selection/requests") list(
    @CurrentUser() a: AuthUser,
    @Query() q: SelectionQueryDto,
  ) {
    return this.selection.list(a, q.projectId, q.page, q.limit);
  }
  @Post("selection/requests/:id/offer")
  @HttpCode(200)
  @Roles(UserRole.SUPERVISOR)
  offer(@CurrentUser() a: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.selection.offer(a, id);
  }
  @Post("selection/requests/:id/decline") @HttpCode(200) decline(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.selection.decision(a, id, d.reason);
  }
  @Post("selection/requests/:id/withdraw") @HttpCode(200) withdraw(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.selection.decision(a, id, d.reason, true);
  }
  @Post("selection/requests/:id/confirm")
  @HttpCode(200)
  @Roles(UserRole.STUDENT)
  confirm(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() _d: ConfirmationDto,
  ) {
    return this.selection.confirm(a, id);
  }
  @Post("selection/supervisions/:id/end") @HttpCode(200) end(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.selection.end(a, id, d.reason);
  }
  @Get("selection/capacity/:id") capacity(
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.selection.capacity(id);
  }
  @Get("projects/:id/access-grants") @Roles(UserRole.STUDENT) grants(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.selection.grants(a, id);
  }
  @Post("projects/:id/access-grants") @Roles(UserRole.STUDENT) grant(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: AccessGrantDto,
  ) {
    return this.selection.grant(a, id, d.granteeId);
  }
  @Delete("projects/:id/access-grants/:grantId")
  @Roles(UserRole.STUDENT)
  revoke(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("grantId", ParseUUIDPipe) grantId: string,
  ) {
    return this.selection.revoke(a, id, grantId);
  }
  @Get("projects/:id/document-access") access(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.selection.documentAccess(a, id);
  }
  @Get("projects/:id/activity") activity(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: GroupPaginationDto,
  ) {
    return this.selection.activity(a, id, q.page, q.limit);
  }
}
