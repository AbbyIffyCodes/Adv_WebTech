import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
@Entity("submissions")
export class Submission {
  @Column({ name: "milestone_id", type: "uuid", nullable: true }) milestoneId!:
    | string
    | null;
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "project_id", type: "uuid" }) projectId!: string;
  @Column({ type: "varchar", length: 20, default: "proposal" }) kind!: string;
  @Column({ name: "version_no", type: "int" }) versionNo!: number;
  @Column({ name: "submitted_by", type: "uuid" }) submittedBy!: string;
  @Column({ name: "revision_note", type: "text" }) revisionNote!: string;
  @Column({ type: "varchar", length: 30, default: "submitted" })
  status!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
