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
import { CreateMilestoneDto, UpdateMilestoneDto } from "./dto/milestone.dto";
import { MilestonesService } from "./milestones.service";
import { SubmissionsService } from "../submissions/submissions.service";
@ApiTags("Milestones and approved progress")
@ApiBearerAuth()
@Controller()
export class MilestonesController {
  constructor(
    private readonly milestones: MilestonesService,
    private readonly submissions: SubmissionsService,
  ) {}
  @Get("projects/:id/milestones") list(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: GroupPaginationDto,
  ) {
    return this.milestones.list(a, id, q.page, q.limit);
  }
  @Post("projects/:id/milestones") @Roles(UserRole.SUPERVISOR) create(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: CreateMilestoneDto,
  ) {
    return this.milestones.save(a, id, d);
  }
  @Patch("milestones/:id") @Roles(UserRole.SUPERVISOR) async update(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: UpdateMilestoneDto,
  ) {
    return this.milestones.save(a, await this.milestones.projectFor(id), d, id);
  }
  @Post("milestones/:id/start") @Roles(UserRole.STUDENT) @HttpCode(200) start(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.milestones.start(a, id);
  }
  @Get("milestones/:id/submissions") async history(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: GroupPaginationDto,
  ) {
    return this.submissions.list(
      a,
      await this.milestones.projectFor(id),
      q.page,
      q.limit,
      id,
    );
  }
}
