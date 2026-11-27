import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Profile } from "./profile.entity";

@Entity("work_links")
export class WorkLink {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Profile, (profile) => profile.workLinks, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "profile_id", referencedColumnName: "userId" })
  profile!: Profile;

  @Column({ type: "varchar", length: 100 })
  label!: string;

  @Column({ type: "text" })
  url!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
