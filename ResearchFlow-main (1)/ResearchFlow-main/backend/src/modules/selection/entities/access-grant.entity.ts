import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
@Entity("access_grants")
export class AccessGrant {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "project_id", type: "uuid" }) projectId!: string;
  @Column({ name: "grantee_id", type: "uuid" }) granteeId!: string;
  @Column({ name: "granted_by", type: "uuid" }) grantedBy!: string;
  @Column({ type: "varchar", length: 30, default: "full_documents" })
  scope!: string;
  @Column({ name: "supervision_id", type: "uuid", nullable: true })
  supervisionId!: string | null;
  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
