import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { appConfig } from "../../config/app.config";
import { NotificationQueryDto } from "./dto/notification.dto";
import { Notification } from "./entities/notification.entity";
const visible = `(n.source_type='event' OR (n.source_type='group_invitation' AND EXISTS(SELECT 1 FROM group_invitations i WHERE i.id=n.source_id AND i.status='pending' AND i.expires_at>CURRENT_TIMESTAMP)) OR (n.source_type='selection_deadline' AND EXISTS(SELECT 1 FROM selection_requests r WHERE r.id=n.source_id AND r.status IN ('pending','offered') AND n.dedupe_key='selection-deadline:'||r.id::text||':'||extract(epoch FROM r.response_due)::text)) OR (n.source_type='milestone_deadline' AND EXISTS(SELECT 1 FROM milestones m WHERE m.id=n.source_id AND m.status NOT IN ('completed','submitted_for_review') AND n.dedupe_key='milestone-deadline:'||m.id::text||':'||extract(epoch FROM m.due_date)::text)))`;
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly source: DataSource) {}
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(NotificationsService.name);
  onModuleInit() {
    if (
      appConfig.env.NODE_ENV === "test" ||
      !appConfig.env.ENABLE_DEADLINE_ALERTS
    )
      return;
    this.timer = setInterval(() => {
      void this.refresh().catch(() =>
        this.logger.error("Deadline alert refresh failed"),
      );
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async refresh(userId?: string) {
    if (!userId && this.running) return { created: 0 };
    if (!userId) this.running = true;
    try {
      const selection = await this.source.query(
        `INSERT INTO notifications(user_id,project_id,kind,message,source_type,source_id,dedupe_key)
   SELECT DISTINCT u.id,r.project_id,'selection.deadline','A selection response deadline needs attention.','selection_deadline',r.id,'selection-deadline:'||r.id::text||':'||extract(epoch FROM r.response_due)::text FROM selection_requests r JOIN projects p ON p.id=r.project_id JOIN research_groups g ON g.id=p.group_id JOIN users u ON u.id IN (r.supervisor_id,g.leader_id)
   WHERE r.status IN ('pending','offered') AND r.response_due<=CURRENT_TIMESTAMP+interval '24 hours' AND p.archived_at IS NULL AND g.archived_at IS NULL AND u.is_active=true AND ($1::uuid IS NULL OR u.id=$1)
   ON CONFLICT(user_id,dedupe_key) DO NOTHING RETURNING id`,
        [userId ?? null],
      );
      const milestones = await this.source.query(
        `INSERT INTO notifications(user_id,project_id,kind,message,source_type,source_id,dedupe_key)
   SELECT DISTINCT u.id,m.project_id,'milestone.deadline','A milestone deadline needs attention.','milestone_deadline',m.id,'milestone-deadline:'||m.id::text||':'||extract(epoch FROM m.due_date)::text FROM milestones m JOIN projects p ON p.id=m.project_id JOIN research_groups g ON g.id=p.group_id JOIN supervisions s ON s.project_id=p.id AND s.ended_at IS NULL JOIN users u ON u.id IN (m.owner_id,g.leader_id,s.supervisor_id)
   WHERE m.status NOT IN ('completed','submitted_for_review') AND m.due_date<=CURRENT_TIMESTAMP+interval '24 hours' AND p.archived_at IS NULL AND g.archived_at IS NULL AND u.is_active=true AND ($1::uuid IS NULL OR u.id=$1)
   ON CONFLICT(user_id,dedupe_key) DO NOTHING RETURNING id`,
        [userId ?? null],
      );
      return { created: selection.length + milestones.length };
    } finally {
      if (!userId) this.running = false;
    }
  }
  async list(a: AuthUser, q: NotificationQueryDto) {
    await this.refresh(a.id);
    const b = this.source
      .getRepository(Notification)
      .createQueryBuilder("n")
      .where("n.user_id=:id", { id: a.id })
      .andWhere(visible);
    if (q.unread !== undefined)
      b.andWhere(q.unread ? "n.read_at IS NULL" : "n.read_at IS NOT NULL");
    const [items, total] = await b
      .orderBy("n.createdAt", "DESC")
      .addOrderBy("n.id", "ASC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return {
      items: items.map((n) => ({
        id: n.id,
        projectId: n.projectId,
        kind: n.kind,
        message: n.message,
        sourceType: n.sourceType,
        sourceId: n.sourceId,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      total,
      unread: await this.unread(a.id),
      page: q.page,
      limit: q.limit,
    };
  }
  async unread(userId: string) {
    return this.source
      .getRepository(Notification)
      .createQueryBuilder("n")
      .where("n.user_id=:userId", { userId })
      .andWhere("n.read_at IS NULL")
      .andWhere(visible)
      .getCount();
  }
  async read(a: AuthUser, id: string) {
    const result = await this.source.query(
      "UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=$1 AND user_id=$2 RETURNING id,read_at",
      [id, a.id],
    );
    const n = result[0]?.[0];
    if (!n) throw new NotFoundException("Notification not found");
    return { id: n.id, readAt: n.read_at };
  }
  async readAll(a: AuthUser) {
    const result = await this.source.query(
      "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND read_at IS NULL",
      [a.id],
    );
    return { updated: result[1] ?? 0 };
  }
}
