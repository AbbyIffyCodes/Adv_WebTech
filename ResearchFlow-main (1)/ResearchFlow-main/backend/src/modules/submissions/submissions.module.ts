import { Module } from "@nestjs/common";
import { SelectionModule } from "../selection/selection.module";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";
import { SubmissionUploadGuard } from "./submission-upload.guard";
@Module({
  imports: [SelectionModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionUploadGuard],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
