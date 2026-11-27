import {
  Body,
  Controller,
  Delete,
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
  CreateProjectDto,
  ProjectQueryDto,
  SummaryVisibilityDto,
  UpdateProjectDto,
} from "./dto/project.dto";
import { ProjectsService } from "./projects.service";
@ApiTags("Projects and permitted summaries")
@ApiBearerAuth()
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}
  @Post()
  @Roles(UserRole.STUDENT)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(actor, dto);
  }
  @Get("mine")
  @Roles(UserRole.STUDENT)
  mine(@CurrentUser() actor: AuthUser) {
    return this.projects.mine(actor);
  }
  @Get()
  list(@Query() query: ProjectQueryDto) {
    return this.projects.list(query);
  }
  @Get(":id")
  get(@CurrentUser() actor: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.projects.get(actor, id);
  }
  @Patch(":id")
  @Roles(UserRole.STUDENT)
  update(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(actor, id, dto);
  }
  @Patch(":id/summary-visibility")
  @Roles(UserRole.STUDENT)
  visibility(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SummaryVisibilityDto,
  ) {
    return this.projects.visibility(actor, id, dto.published);
  }
  @Delete(":id")
  @Roles(UserRole.STUDENT)
  archive(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.projects.archive(actor, id);
  }
}
