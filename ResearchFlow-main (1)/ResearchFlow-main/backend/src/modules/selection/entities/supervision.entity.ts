import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
@Entity("supervisions")
export class Supervision {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "project_id", type: "uuid" }) projectId!: string;
  @Column({ name: "supervisor_id", type: "uuid" }) supervisorId!: string;
  @Column({ name: "opportunity_id", type: "uuid", nullable: true })
  opportunityId!: string | null;
  @Column({ name: "request_id", type: "uuid" }) requestId!: string;
  @Column({ name: "reserved_places", type: "int" }) reservedPlaces!: number;
  @Column({
    name: "confirmed_at",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  confirmedAt!: Date;
  @Column({ name: "ended_at", type: "timestamptz", nullable: true })
  endedAt!: Date | null;
  @Column({ name: "end_reason", type: "text", nullable: true }) endReason!:
    | string
    | null;
}
