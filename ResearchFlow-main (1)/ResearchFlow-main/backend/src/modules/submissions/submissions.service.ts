import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, unlink, lstat, open } from "node:fs/promises";
import * as path from "node:path";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { UserRole } from "../accounts/enums/user_role.enum";
import { Project } from "../projects/entities/project.entity";
import { ResearchGroup } from "../groups/entities/research-group.entity";
import { User } from "../accounts/entities/user.entity";
import { Supervision } from "../selection/entities/supervision.entity";
import { ActivityEvent } from "../selection/entities/activity-event.entity";
import { SelectionService } from "../selection/selection.service";
import { Submission } from "./entities/submission.entity";
import { Review } from "./entities/review.entity";
import { SubmissionFile } from "./entities/submission-file.entity";
import { CreateReviewDto, SubmitProposalDto } from "./dto/submission.dto";
import { validateFile } from "./file-validation";
import { IsNull } from "typeorm";
import { appConfig } from "../../config/app.config";
import { Milestone } from "../milestones/entities/milestone.entity";
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly source: DataSource,
    private readonly selection: SelectionService,
  ) {}
  private root() {
    return path.resolve(appConfig.env.PRIVATE_UPLOAD_DIR);
  }
  private filePath(key: string) {
    if (!/^[0-9a-f-]{36}\.(pdf|docx|pptx|xlsx|csv|jpg|jpeg|png)$/.test(key))
      throw new NotFoundException("File not found");
    return path.join(this.root(), key);
  }
  private fileView(f: SubmissionFile) {
    return {
      id: f.id,
      submissionId: f.submissionId,
      reviewId: f.reviewId,
      originalName: f.originalName,
      fileType: f.fileType,
      size: f.size,
      sha256: f.sha256,
      createdAt: f.createdAt,
      downloadUrl: `/files/${f.id}/download`,
      previewUrl: ["application/pdf", "image/png", "image/jpeg"].includes(
        f.fileType,
      )
        ? `/files/${f.id}/preview`
        : null,
    };
  }
  private async audit(
    m: EntityManager,
    projectId: string,
    actorId: string,
    action: string,
    details: Record<string, unknown>,
  ) {
    await m
      .getRepository(ActivityEvent)
      .save({ projectId, actorId, action, details });
  }
  async projectForSubmission(id: string) {
    const s = await this.source.getRepository(Submission).findOneBy({ id });
    if (!s) throw new NotFoundException("Submission not found");
    return s.projectId;
  }
  async ensureWriter(actor: AuthUser, projectId: string, review = false) {
    await this.selection.assertDocumentAccess(actor, projectId);
    const project = await this.source
      .getRepository(Project)
      .findOneBy({ id: projectId });
    if (!project || project.archivedAt)
      throw new NotFoundException("Active project not found");
    const group = await this.source
      .getRepository(ResearchGroup)
      .findOneBy({ id: project.groupId });
    const pair = await this.source
      .getRepository(Supervision)
      .findOneBy({ projectId, endedAt: IsNull() });
    if (!pair)
      throw new ConflictException(
        "An active confirmed supervision is required for submissions and reviews",
      );
    if (review) {
      if (actor.role !== UserRole.SUPERVISOR || actor.id !== pair.supervisorId)
        throw new ForbiddenException(
          "Only the current confirmed supervisor can review",
        );
    } else if (actor.role !== UserRole.STUDENT || group?.leaderId !== actor.id)
      throw new ForbiddenException(
        "Only the current group leader can submit a proposal",
      );
  }
  private async withProject<T>(
    actor: AuthUser,
    projectId: string,
    review: boolean,
    work: (m: EntityManager, project: Project) => Promise<T>,
  ) {
    return this.source.transaction(async (m) => {
      const pair = await m
        .getRepository(Supervision)
        .findOneBy({ projectId, endedAt: IsNull() });
      await m.query(
        "SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [[...new Set([actor.id, ...(pair ? [pair.supervisorId] : [])])].sort()],
      );
      const user = await m.getRepository(User).findOneBy({ id: actor.id });
      if (!user?.isActive || user.role !== actor.role)
        throw new ForbiddenException("Account role changed; log in again");
      const hint = await m.getRepository(Project).findOneBy({ id: projectId });
      if (!hint) throw new NotFoundException();
      await m.getRepository(ResearchGroup).findOne({
        where: { id: hint.groupId },
        lock: { mode: "pessimistic_write" },
      });
      const project = await m.getRepository(Project).findOne({
        where: { id: projectId },
        lock: { mode: "pessimistic_write" },
      });
      if (!project) throw new NotFoundException();
      await this.ensureWriter(actor, projectId, review);
      return work(m, project);
    });
  }
  private validate(files: Express.Multer.File[], required: boolean) {
    if (required && !files?.length)
      throw new BadRequestException(
        "Attach at least one file using the files form-data field",
      );
    if (files.length > appConfig.env.UPLOAD_MAX_FILES)
      throw new BadRequestException("Too many attachments");
    for (const f of files) {
      if (f.size > appConfig.env.UPLOAD_MAX_FILE_MB * 1024 * 1024)
        throw new BadRequestException("Attachment exceeds the size limit");
      validateFile(f);
    }
  }
  private async store(
    m: EntityManager,
    files: Express.Multer.File[],
    submissionId: string,
    reviewId: string | null,
    created: string[],
  ) {
    if (!files.length) return;
    await mkdir(this.root(), { recursive: true });
    for (const file of files) {
      const checked = validateFile(file),
        storageKey = randomUUID() + "." + checked.extension;
      const target = this.filePath(storageKey);
      await writeFile(target, file.buffer, { flag: "wx", mode: 0o600 });
      created.push(target);
      await m.getRepository(SubmissionFile).save({
        submissionId,
        reviewId,
        originalName: checked.name,
        storageKey,
        fileType: checked.type,
        size: file.buffer.length,
        sha256: createHash("sha256").update(file.buffer).digest("hex"),
      });
    }
  }
  private async cleanup(created: string[]) {
    await Promise.all(created.map((f) => unlink(f).catch(() => undefined)));
  }
  async submit(
    actor: AuthUser,
    projectId: string,
    dto: SubmitProposalDto,
    files: Express.Multer.File[],
  ) {
    this.validate(files, true);
    const created: string[] = [];
    let id: string;
    try {
      id = await this.withProject(actor, projectId, false, async (m) => {
        const milestone = dto.milestoneId
          ? await m
              .getRepository(Milestone)
              .findOneBy({ id: dto.milestoneId, projectId })
          : null;
        if (dto.milestoneId && !milestone)
          throw new BadRequestException(
            "Milestone must belong to this project",
          );
        if (milestone?.status === "completed")
          throw new ConflictException(
            "Completed milestone evidence cannot be replaced",
          );
        if (milestone) {
          const proposal = await m.getRepository(Submission).findOne({
            where: { projectId, kind: "proposal" },
            order: { versionNo: "DESC" },
          });
          if (proposal?.status !== "approved")
            throw new ConflictException(
              "Approve the latest proposal before milestone evidence",
            );
        }
        const repo = m.getRepository(Submission),
          latest = await repo.findOne({
            where: {
              projectId,
              kind: milestone ? "milestone" : "proposal",
              milestoneId: milestone?.id ?? IsNull(),
            },
            order: { versionNo: "DESC" },
          });
        if (latest && ["submitted", "under_review"].includes(latest.status))
          throw new ConflictException(
            "Wait for the pending review before submitting another revision",
          );
        const s = await repo.save({
          projectId,
          kind: milestone ? "milestone" : "proposal",
          milestoneId: milestone?.id ?? null,
          versionNo: (latest?.versionNo ?? 0) + 1,
          submittedBy: actor.id,
          revisionNote: dto.revisionNote,
        });
        await this.store(m, files, s.id, null, created);
        if (milestone) {
          milestone.status = "submitted_for_review";
          await m.getRepository(Milestone).save(milestone);
        }
        await this.audit(
          m,
          projectId,
          actor.id,
          milestone ? "milestone.evidence_submitted" : "proposal.submitted",
          {
            submissionId: s.id,
            versionNo: s.versionNo,
            fileCount: files.length,
          },
        );
        return s.id;
      });
    } catch (error) {
      await this.cleanup(created);
      throw error;
    }
    return this.detail(actor, id);
  }
  async detail(actor: AuthUser, id: string) {
    const s = await this.source.getRepository(Submission).findOneBy({ id });
    if (!s) throw new NotFoundException("Submission not found");
    await this.selection.assertDocumentAccess(actor, s.projectId);
    const files = await this.source.getRepository(SubmissionFile).find({
      where: { submissionId: id },
      order: { createdAt: "ASC", id: "ASC" },
    });
    const reviews = await this.source
      .getRepository(Review)
      .find({ where: { submissionId: id }, order: { createdAt: "ASC" } });
    return {
      id: s.id,
      projectId: s.projectId,
      kind: s.kind,
      milestoneId: s.milestoneId,
      versionNo: s.versionNo,
      submittedBy: s.submittedBy,
      revisionNote: s.revisionNote,
      status: s.status,
      createdAt: s.createdAt,
      files: files.filter((f) => !f.reviewId).map((f) => this.fileView(f)),
      reviews: reviews.map((r) => ({
        id: r.id,
        reviewerId: r.reviewerId,
        decision: r.decision,
        comments: r.comments,
        createdAt: r.createdAt,
        files: files
          .filter((f) => f.reviewId === r.id)
          .map((f) => this.fileView(f)),
      })),
    };
  }
  async list(
    actor: AuthUser,
    projectId: string,
    page: number,
    limit: number,
    milestoneId?: string,
  ) {
    await this.selection.assertDocumentAccess(actor, projectId);
    const [items, total] = await this.source
      .getRepository(Submission)
      .findAndCount({
        where: {
          projectId,
          kind: milestoneId ? "milestone" : "proposal",
          milestoneId: milestoneId ?? IsNull(),
        },
        order: { versionNo: "DESC" },
        skip: (page - 1) * limit,
        take: limit,
      });
    const latest = await this.source.getRepository(Submission).findOne({
      where: {
        projectId,
        kind: milestoneId ? "milestone" : "proposal",
        milestoneId: milestoneId ?? IsNull(),
      },
      order: { versionNo: "DESC" },
    });
    return {
      items: items.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        versionNo: s.versionNo,
        status: s.status,
        revisionNote: s.revisionNote,
        submittedBy: s.submittedBy,
        createdAt: s.createdAt,
      })),
      ...(milestoneId
        ? { milestoneStatus: latest?.status ?? "not_started" }
        : { proposalStatus: latest?.status ?? "draft" }),
      total,
      page,
      limit,
    };
  }
  private async latest(m: EntityManager, id: string) {
    const s = await m.getRepository(Submission).findOneBy({ id });
    if (!s) throw new NotFoundException("Submission not found");
    const last = await m.getRepository(Submission).findOne({
      where: {
        projectId: s.projectId,
        kind: s.kind,
        milestoneId: s.milestoneId ?? IsNull(),
      },
      order: { versionNo: "DESC" },
    });
    if (last?.id !== id)
      throw new ConflictException("Review the latest proposal version");
    if (!["submitted", "under_review"].includes(s.status))
      throw new ConflictException(
        "This version already has a final review decision",
      );
    return s;
  }
  async startReview(actor: AuthUser, id: string) {
    const projectId = await this.projectForSubmission(id);
    await this.withProject(actor, projectId, true, async (m) => {
      const s = await this.latest(m, id);
      if (s.status === "under_review")
        throw new ConflictException("Review is already in progress");
      s.status = "under_review";
      await m.getRepository(Submission).save(s);
      await this.audit(
        m,
        projectId,
        actor.id,
        (s.milestoneId ? "milestone." : "proposal.") + "under_review",
        {
          submissionId: id,
          versionNo: s.versionNo,
        },
      );
    });
    return this.detail(actor, id);
  }
  async review(
    actor: AuthUser,
    id: string,
    dto: CreateReviewDto,
    files: Express.Multer.File[],
  ) {
    this.validate(files, false);
    const projectId = await this.projectForSubmission(id),
      created: string[] = [];
    try {
      await this.withProject(actor, projectId, true, async (m) => {
        const s = await this.latest(m, id);
        const review = await m.getRepository(Review).save({
          submissionId: id,
          reviewerId: actor.id,
          decision: dto.decision,
          comments: dto.comments,
        });
        await this.store(m, files, id, review.id, created);
        s.status = dto.decision;
        if (s.milestoneId)
          await m.getRepository(Milestone).update(
            { id: s.milestoneId, projectId },
            {
              status:
                dto.decision === "approved" ? "completed" : "revision_required",
            },
          );
        await m.getRepository(Submission).save(s);
        await this.audit(
          m,
          projectId,
          actor.id,
          (s.milestoneId ? "milestone." : "proposal.") + dto.decision,
          {
            submissionId: id,
            reviewId: review.id,
            versionNo: s.versionNo,
          },
        );
      });
    } catch (error) {
      await this.cleanup(created);
      throw error;
    }
    return this.detail(actor, id);
  }
  async download(actor: AuthUser, id: string, preview: boolean) {
    const file = await this.source
      .getRepository(SubmissionFile)
      .createQueryBuilder("file")
      .addSelect("file.storageKey")
      .where("file.id=:id", { id })
      .getOne();
    if (!file) throw new NotFoundException("File not found");
    const projectId = await this.projectForSubmission(file.submissionId);
    await this.selection.assertDocumentAccess(actor, projectId);
    if (
      preview &&
      !["application/pdf", "image/png", "image/jpeg"].includes(file.fileType)
    )
      throw new BadRequestException(
        "Preview supports PDFs and images; download other formats",
      );
    const target = this.filePath(file.storageKey);
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
      const handle = await open(target, "r");
      return { stream: handle.createReadStream(), file, preview };
    } catch {
      throw new NotFoundException("Stored file is unavailable");
    }
  }
}
