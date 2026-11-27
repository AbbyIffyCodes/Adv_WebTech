import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
@Entity("milestones")
export class Milestone {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "project_id", type: "uuid" }) projectId!: string;
  @Column({ name: "owner_id", type: "uuid" }) ownerId!: string;
  @Column({ type: "varchar", length: 200 }) title!: string;
  @Column({ type: "text" }) description!: string;
  @Column({ name: "due_date", type: "timestamptz" }) dueDate!: Date;
  @Column({ type: "varchar", length: 30, default: "not_started" })
  status!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
