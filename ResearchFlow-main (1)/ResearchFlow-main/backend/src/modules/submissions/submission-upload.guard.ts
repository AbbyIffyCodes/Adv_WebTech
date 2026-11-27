import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { isUUID } from "class-validator";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { SubmissionsService } from "./submissions.service";
@Injectable()
export class SubmissionUploadGuard implements CanActivate {
  constructor(private readonly submissions: SubmissionsService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      user: AuthUser;
      params: { projectId?: string; submissionId?: string };
    }>();
    const id = req.params.projectId ?? req.params.submissionId;
    if (!id || !isUUID(id))
      throw new BadRequestException("Valid UUID required");
    const review = Boolean(req.params.submissionId),
      projectId = review ? await this.submissions.projectForSubmission(id) : id;
    await this.submissions.ensureWriter(req.user, projectId, review);
    return true;
  }
}
