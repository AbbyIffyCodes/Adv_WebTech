import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
@Entity("files")
export class SubmissionFile {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "submission_id", type: "uuid" }) submissionId!: string;
  @Column({ name: "review_id", type: "uuid", nullable: true }) reviewId!:
    | string
    | null;
  @Column({ name: "original_name", type: "varchar", length: 180 })
  originalName!: string;
  @Column({ name: "storage_key", type: "varchar", length: 100, select: false })
  storageKey!: string;
  @Column({ name: "file_type", type: "varchar", length: 120 })
  fileType!: string;
  @Column({ type: "int" }) size!: number;
  @Column({ type: "varchar", length: 64 }) sha256!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
