import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
@Entity("suggestions")
export class Suggestion {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "case_id", type: "uuid" }) caseId!: string;
  @Column({ name: "coordinator_id", type: "uuid" }) coordinatorId!: string;
  @Column({ name: "supervisor_id", type: "uuid", nullable: true })
  supervisorId!: string | null;
  @Column({ name: "opportunity_id", type: "uuid", nullable: true })
  opportunityId!: string | null;
  @Column({ name: "research_direction", type: "text", nullable: true })
  researchDirection!: string | null;
  @Column({ type: "text" }) explanation!: string;
  @Column({ type: "varchar", length: 20, default: "pending" })
  response!: string;
  @Column({ name: "response_reason", type: "text", nullable: true })
  responseReason!: string | null;
  @Column({ name: "responded_by", type: "uuid", nullable: true }) respondedBy!:
    | string
    | null;
  @Column({ name: "responded_at", type: "timestamptz", nullable: true })
  respondedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
