import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
@Entity("support_cases")
export class SupportCase {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "project_id", type: "uuid" }) projectId!: string;
  @Column({ name: "raised_by", type: "uuid" }) raisedBy!: string;
  @Column({ type: "varchar", length: 30 }) reason!: string;
  @Column({ type: "text" }) description!: string;
  @Column({ name: "request_id", type: "uuid", nullable: true }) requestId!:
    | string
    | null;
  @Column({ type: "varchar", length: 30, default: "open" }) status!: string;
  @Column({ name: "resolution_note", type: "text", nullable: true })
  resolutionNote!: string | null;
  @Column({ name: "resolved_at", type: "timestamptz", nullable: true })
  resolvedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
