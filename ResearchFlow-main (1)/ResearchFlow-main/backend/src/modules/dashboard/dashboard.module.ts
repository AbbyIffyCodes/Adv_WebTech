import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { NotificationsService } from "./notifications.service";
@Module({
  controllers: [DashboardController],
  providers: [DashboardService, NotificationsService],
  exports: [NotificationsService],
})
export class DashboardModule {}
