import {
  Body,
  Delete,
  Controller,
  Get,
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
  CreateOpportunityDto,
  OpportunityQueryDto,
  OpportunityStatusDto,
  UpdateOpportunityDto,
} from "./dto/opportunity.dto";
import { OpportunitiesService } from "./opportunities.service";
@ApiTags("Research opportunities")
@ApiBearerAuth()
@Controller("opportunities")
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}
  @Delete(":id")
  @Roles(UserRole.SUPERVISOR)
  remove(@CurrentUser() a: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.opportunities.remove(a, id);
  }
  @Post()
  @Roles(UserRole.SUPERVISOR)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateOpportunityDto) {
    return this.opportunities.create(actor, dto);
  }
  @Get("mine")
  @Roles(UserRole.SUPERVISOR)
  mine(@CurrentUser() actor: AuthUser, @Query() query: OpportunityQueryDto) {
    return this.opportunities.list(actor, query, true);
  }
  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: OpportunityQueryDto) {
    return this.opportunities.list(actor, query);
  }
  @Get(":id")
  get(@CurrentUser() actor: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.opportunities.get(actor, id);
  }
  @Patch(":id")
  @Roles(UserRole.SUPERVISOR)
  update(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.opportunities.update(actor, id, dto);
  }
  @Patch(":id/status")
  @Roles(UserRole.SUPERVISOR)
  status(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: OpportunityStatusDto,
  ) {
    return this.opportunities.status(actor, id, dto.status);
  }
}
