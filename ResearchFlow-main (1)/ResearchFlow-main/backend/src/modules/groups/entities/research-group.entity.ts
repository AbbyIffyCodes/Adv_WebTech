import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../accounts/entities/user.entity";

@Entity("research_groups")
export class ResearchGroup {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "varchar", length: 120 }) name!: string;
  @Column({ type: "text", nullable: true }) description!: string | null;
  @Column({ name: "leader_id", type: "uuid" }) leaderId!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "leader_id" })
  leader!: User;
  // Later supervision confirmation will lock membership until capacity/access can be rechecked.
  @Column({ name: "membership_locked", type: "boolean", default: false })
  membershipLocked!: boolean;
  @Column({ name: "archived_at", type: "timestamptz", nullable: true })
  archivedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
