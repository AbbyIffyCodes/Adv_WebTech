import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ResearchGroup } from "../../groups/entities/research-group.entity";
import { ResearchInterest } from "../../profiles/entities/research_interest.entity";

@Entity("projects")
export class Project {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "group_id", type: "uuid" }) groupId!: string;
  @ManyToOne(() => ResearchGroup, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "group_id" })
  group!: ResearchGroup;
  @Column({ type: "varchar", length: 200 }) title!: string;
  // A deliberately limited summary; full proposals will be versioned submissions.
  @Column({ name: "shared_summary", type: "text" }) sharedSummary!: string;
  @Column({ type: "varchar", length: 30, default: "draft" }) status!:
    | "draft"
    | "seeking_supervisor"
    | "under_supervision"
    | "archived";
  @Column({ name: "published_at", type: "timestamptz", nullable: true })
  publishedAt!: Date | null;
  @Column({ name: "archived_at", type: "timestamptz", nullable: true })
  archivedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
  @ManyToMany(() => ResearchInterest)
  @JoinTable({
    name: "project_research_interests",
    joinColumn: { name: "project_id", referencedColumnName: "id" },
    inverseJoinColumn: {
      name: "research_interest_id",
      referencedColumnName: "id",
    },
  })
  areaTags!: ResearchInterest[];
}
