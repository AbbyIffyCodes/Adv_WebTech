import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
@Entity("reviews")
export class Review {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "submission_id", type: "uuid" }) submissionId!: string;
  @Column({ name: "reviewer_id", type: "uuid" }) reviewerId!: string;
  @Column({ type: "varchar", length: 30 }) decision!: string;
  @Column({ type: "text" }) comments!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
