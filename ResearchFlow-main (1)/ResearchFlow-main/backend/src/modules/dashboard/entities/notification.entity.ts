import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ name: "project_id", type: "uuid", nullable: true }) projectId!:
    | string
    | null;
  @Column({ type: "varchar", length: 100 }) kind!: string;
  @Column({ type: "text" }) message!: string;
  @Column({ name: "source_type", type: "varchar", length: 30 })
  sourceType!: string;
  @Column({ name: "source_id", type: "uuid" }) sourceId!: string;
  @Column({ name: "dedupe_key", type: "varchar", length: 200 })
  dedupeKey!: string;
  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
