import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
@Entity("activity_events")
export class ActivityEvent {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "project_id", type: "uuid" }) projectId!: string;
  @Column({ name: "actor_id", type: "uuid" }) actorId!: string;
  @Column({ type: "varchar", length: 100 }) action!: string;
  @Column({ type: "jsonb", default: () => "'{}'::jsonb" }) details!: Record<
    string,
    unknown
  >;
  @CreateDateColumn({ name: "occurred_at", type: "timestamptz" })
  occurredAt!: Date;
}
