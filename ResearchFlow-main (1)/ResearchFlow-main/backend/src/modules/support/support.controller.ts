import {
  Body,
  Controller,
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
import { GroupPaginationDto } from "../groups/dto/group.dto";
import {
  CreateSupportCaseDto,
  CreateSuggestionDto,
  RespondSuggestionDto,
  ReopenCaseDto,
  SupportQueryDto,
  UpdateSupportStatusDto,
} from "./dto/support.dto";
import { SupportService } from "./support.service";
@ApiTags("Coordinator support and alternatives")
@ApiBearerAuth()
@Controller("support")
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Post("cases") create(
    @CurrentUser() a: AuthUser,
    @Body() d: CreateSupportCaseDto,
  ) {
    return this.support.create(a, d);
  }
  @Get("cases") list(@CurrentUser() a: AuthUser, @Query() q: SupportQueryDto) {
    return this.support.list(a, q);
  }
  @Get("needs-attention") @Roles(UserRole.COORDINATOR) attention(
    @CurrentUser() a: AuthUser,
    @Query() q: GroupPaginationDto,
  ) {
    return this.support.attention(a, q.page, q.limit);
  }
  @Get("cases/:id") get(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.support.get(a, id);
  }
  @Post("cases/:id/suggestions") @Roles(UserRole.COORDINATOR) suggest(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: CreateSuggestionDto,
  ) {
    return this.support.suggest(a, id, d);
  }
  @Post("suggestions/:id/respond")
  @HttpCode(200)
  @Roles(UserRole.STUDENT)
  respond(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: RespondSuggestionDto,
  ) {
    return this.support.respond(a, id, d);
  }
  @Patch("cases/:id/status") @Roles(UserRole.COORDINATOR) status(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: UpdateSupportStatusDto,
  ) {
    return this.support.status(a, id, d);
  }
  @Post("cases/:id/reopen") @HttpCode(200) reopen(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: ReopenCaseDto,
  ) {
    return this.support.reopen(a, id, d.reason);
  }
}
