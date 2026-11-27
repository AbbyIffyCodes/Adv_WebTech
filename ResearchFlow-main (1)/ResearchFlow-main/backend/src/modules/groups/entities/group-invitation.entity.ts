import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../accounts/entities/user.entity";
import { ResearchGroup } from "./research-group.entity";

export enum GroupInvitationStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  DECLINED = "declined",
  CANCELLED = "cancelled",
  EXPIRED = "expired",
}
@Entity("group_invitations")
@Index("UQ_group_invitations_pending", ["groupId", "inviteeId"], {
  unique: true,
  where: "\"status\" = 'pending'",
})
export class GroupInvitation {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "group_id", type: "uuid" }) groupId!: string;
  @ManyToOne(() => ResearchGroup, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "group_id" })
  group!: ResearchGroup;
  @Column({ name: "invitee_id", type: "uuid" }) inviteeId!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "invitee_id" })
  invitee!: User;
  @Column({ name: "invited_by_id", type: "uuid" }) invitedById!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "invited_by_id" })
  invitedBy!: User;
  @Column({
    type: "varchar",
    length: 20,
    default: GroupInvitationStatus.PENDING,
  })
  status!: GroupInvitationStatus;
  @Column({ name: "expires_at", type: "timestamptz" }) expiresAt!: Date;
  @Column({ name: "responded_at", type: "timestamptz", nullable: true })
  respondedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
