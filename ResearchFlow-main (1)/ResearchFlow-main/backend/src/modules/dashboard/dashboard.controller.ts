import {
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
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { GroupPaginationDto } from "../groups/dto/group.dto";
import { DashboardService } from "./dashboard.service";
import { NotificationsService } from "./notifications.service";
import { NotificationQueryDto } from "./dto/notification.dto";
@ApiTags("Role dashboards and private alerts")
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly notifications: NotificationsService,
  ) {}
  @Get("dashboard") get(@CurrentUser() a: AuthUser) {
    return this.dashboard.get(a);
  }
  @Get("dashboard/projects") projects(
    @CurrentUser() a: AuthUser,
    @Query() q: GroupPaginationDto,
  ) {
    return this.dashboard.projects(a, q.page, q.limit);
  }
  @Get("notifications") list(
    @CurrentUser() a: AuthUser,
    @Query() q: NotificationQueryDto,
  ) {
    return this.notifications.list(a, q);
  }
  @Post("notifications/refresh") @HttpCode(200) refresh(
    @CurrentUser() a: AuthUser,
  ) {
    return this.notifications.refresh(a.id);
  }
  @Patch("notifications/read-all") readAll(@CurrentUser() a: AuthUser) {
    return this.notifications.readAll(a);
  }
  @Patch("notifications/:id/read") read(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notifications.read(a, id);
  }
}
