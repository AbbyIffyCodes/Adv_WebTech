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
import { User } from "../../accounts/entities/user.entity";
import { ResearchInterest } from "../../profiles/entities/research_interest.entity";
import { Skill } from "../../profiles/entities/skill.entity";
@Entity("opportunities")
export class Opportunity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "supervisor_id", type: "uuid" }) supervisorId!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supervisor_id" })
  supervisor!: User;
  @Column({ type: "varchar", length: 200 }) title!: string;
  @Column({ type: "text" }) description!: string;
  @Column({ type: "text" }) criteria!: string;
  @Column({ type: "int" }) places!: number;
  // Only final supervision confirmation may reserve places, never a public DTO.
  @Column({ name: "reserved_places", type: "int", default: 0 })
  reservedPlaces!: number;
  @Column({ type: "timestamptz" }) deadline!: Date;
  @Column({ type: "varchar", length: 20, default: "draft" }) status!:
    | "draft"
    | "open"
    | "closed";
  @Column({ name: "opened_at", type: "timestamptz", nullable: true })
  openedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
  @ManyToMany(() => ResearchInterest)
  @JoinTable({
    name: "opportunity_research_interests",
    joinColumn: { name: "opportunity_id", referencedColumnName: "id" },
    inverseJoinColumn: {
      name: "research_interest_id",
      referencedColumnName: "id",
    },
  })
  areaTags!: ResearchInterest[];
  @ManyToMany(() => Skill)
  @JoinTable({
    name: "opportunity_required_skills",
    joinColumn: { name: "opportunity_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "skill_id", referencedColumnName: "id" },
  })
  requiredSkills!: Skill[];
  @ManyToMany(() => Skill)
  @JoinTable({
    name: "opportunity_preferred_skills",
    joinColumn: { name: "opportunity_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "skill_id", referencedColumnName: "id" },
  })
  preferredSkills!: Skill[];
}
