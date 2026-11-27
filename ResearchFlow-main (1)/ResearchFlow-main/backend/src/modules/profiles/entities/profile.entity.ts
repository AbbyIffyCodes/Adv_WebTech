import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../accounts/entities/user.entity";
import { JoinTable, ManyToMany, OneToMany } from "typeorm";
import { ResearchInterest } from "./research_interest.entity";
import { Skill } from "./skill.entity";
import { WorkLink } from "./work_link.entity";

@Entity("profiles")
export class Profile {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId!: string;

  @OneToOne(() => User, (user) => user.profile, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id", referencedColumnName: "id" })
  user!: User;

  @Column({ type: "text", nullable: true })
  bio!: string | null;

  @Column({ type: "varchar", length: 250, nullable: true })
  availability!: string | null;

  @Column({ type: "int", nullable: true })
  capacity!: number | null;

  @Column({ name: "seeking_supervisor", type: "boolean", default: false })
  seekingSupervisor!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToMany(
    () => ResearchInterest,
    (researchInterest) => researchInterest.profiles,
  )
  @JoinTable({
    name: "profile_research_interests",
    joinColumn: { name: "profile_id", referencedColumnName: "userId" },
    inverseJoinColumn: {
      name: "research_interest_id",
      referencedColumnName: "id",
    },
  })
  researchInterests!: ResearchInterest[];

  @ManyToMany(() => Skill, (skill) => skill.profiles)
  @JoinTable({
    name: "profile_skills",
    joinColumn: { name: "profile_id", referencedColumnName: "userId" },
    inverseJoinColumn: { name: "skill_id", referencedColumnName: "id" },
  })
  skills!: Skill[];

  @OneToMany(() => WorkLink, (workLink) => workLink.profile)
  workLinks!: WorkLink[];
}
