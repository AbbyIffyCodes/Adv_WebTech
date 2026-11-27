import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { memoryStorage } from "multer";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { UserRole } from "../accounts/enums/user_role.enum";
import { GroupPaginationDto } from "../groups/dto/group.dto";
import { appConfig } from "../../config/app.config";
import { CreateReviewDto, SubmitProposalDto } from "./dto/submission.dto";
import { SubmissionUploadGuard } from "./submission-upload.guard";
import { SubmissionsService } from "./submissions.service";
const upload = () =>
  FilesInterceptor("files", appConfig.env.UPLOAD_MAX_FILES, {
    storage: memoryStorage(),
    limits: {
      files: appConfig.env.UPLOAD_MAX_FILES,
      fileSize: appConfig.env.UPLOAD_MAX_FILE_MB * 1024 * 1024,
      fields: 5,
      fieldSize: 10000,
      parts: appConfig.env.UPLOAD_MAX_FILES + 5,
    },
  });
@ApiTags("Private proposal submissions and reviews")
@ApiBearerAuth()
@Controller()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}
  @Post("projects/:projectId/submissions")
  @Roles(UserRole.STUDENT)
  @UseGuards(SubmissionUploadGuard)
  @UseInterceptors(upload())
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["revisionNote", "files"],
      properties: {
        revisionNote: { type: "string" },
        milestoneId: {
          type: "string",
          format: "uuid",
          description:
            "Optional: bind this evidence bundle to a milestone in the same project",
        },
        files: { type: "array", items: { type: "string", format: "binary" } },
      },
    },
  })
  submit(
    @CurrentUser() a: AuthUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: SubmitProposalDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.submissions.submit(a, projectId, dto, files);
  }
  @Get("projects/:projectId/submissions")
  list(
    @CurrentUser() a: AuthUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Query() q: GroupPaginationDto,
  ) {
    return this.submissions.list(a, projectId, q.page, q.limit);
  }
  @Get("submissions/:id") detail(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.submissions.detail(a, id);
  }
  @Post("submissions/:submissionId/start-review")
  @Roles(UserRole.SUPERVISOR)
  @HttpCode(200)
  @UseGuards(SubmissionUploadGuard)
  start(
    @CurrentUser() a: AuthUser,
    @Param("submissionId", ParseUUIDPipe) id: string,
  ) {
    return this.submissions.startReview(a, id);
  }
  @Post("submissions/:submissionId/reviews")
  @Roles(UserRole.SUPERVISOR)
  @UseGuards(SubmissionUploadGuard)
  @UseInterceptors(upload())
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["decision", "comments"],
      properties: {
        decision: { type: "string", enum: ["revision_required", "approved"] },
        comments: { type: "string" },
        files: { type: "array", items: { type: "string", format: "binary" } },
      },
    },
  })
  review(
    @CurrentUser() a: AuthUser,
    @Param("submissionId", ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.submissions.review(a, id, dto, files);
  }
  private async stream(
    a: AuthUser,
    id: string,
    preview: boolean,
    res: Response,
  ) {
    const result = await this.submissions.download(a, id, preview),
      name = result.file.originalName;
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "sandbox; default-src 'none'; frame-ancestors 'self'",
    );
    const encoded = encodeURIComponent(name).replace(/'/g, "%27");
    const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
    return new StreamableFile(result.stream, {
      type: result.file.fileType,
      length: result.file.size,
      disposition: `${preview ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    });
  }
  @Get("files/:id/download") download(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.stream(a, id, false, res);
  }
  @Get("files/:id/preview") preview(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.stream(a, id, true, res);
  }
}
