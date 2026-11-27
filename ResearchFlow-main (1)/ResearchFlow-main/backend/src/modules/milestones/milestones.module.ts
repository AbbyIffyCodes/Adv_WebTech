import { Module } from "@nestjs/common";
import { SelectionModule } from "../selection/selection.module";
import { SubmissionsModule } from "../submissions/submissions.module";
import { MilestonesService } from "./milestones.service";
import { MilestonesController } from "./milestones.controller";
@Module({
  imports: [SelectionModule, SubmissionsModule],
  controllers: [MilestonesController],
  providers: [MilestonesService],
})
export class MilestonesModule {}
