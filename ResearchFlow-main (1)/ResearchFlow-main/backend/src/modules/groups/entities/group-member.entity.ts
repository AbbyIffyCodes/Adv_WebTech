import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { User } from "../../accounts/entities/user.entity";
import { ResearchGroup } from "./research-group.entity";

@Entity("group_members")
@Index("UQ_group_members_active_user", ["userId"], {
  unique: true,
  where: '"left_at" IS NULL',
})
export class GroupMember {
  @PrimaryColumn({ name: "group_id", type: "uuid" }) groupId!: string;
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId!: string;
  @ManyToOne(() => ResearchGroup, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "group_id" })
  group!: ResearchGroup;
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user!: User;
  @Column({
    name: "joined_at",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  joinedAt!: Date;
  @Column({ name: "left_at", type: "timestamptz", nullable: true })
  leftAt!: Date | null;
}
