import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
@Entity("selection_requests")
export class SelectionRequest {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "project_id", type: "uuid" }) projectId!: string;
  @Column({ name: "supervisor_id", type: "uuid" }) supervisorId!: string;
  @Column({ name: "opportunity_id", type: "uuid", nullable: true })
  opportunityId!: string | null;
  @Column({ name: "initiated_by", type: "uuid" }) initiatedBy!: string;
  @Column({ type: "varchar", length: 20 }) direction!:
    | "application"
    | "invitation";
  @Column({ type: "varchar", length: 20, default: "pending" }) status!: string;
  @Column({ type: "text" }) statement!: string;
  @Column({ name: "decision_reason", type: "text", nullable: true })
  decisionReason!: string | null;
  @Column({ name: "response_due", type: "timestamptz" }) responseDue!: Date;
  @Column({ name: "decided_at", type: "timestamptz", nullable: true })
  decidedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
