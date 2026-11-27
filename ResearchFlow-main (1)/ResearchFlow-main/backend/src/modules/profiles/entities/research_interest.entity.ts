import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from "typeorm";
import { Profile } from "./profile.entity";

@Entity("research_interests")
export class ResearchInterest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100, unique: true })
  name!: string;

  @ManyToMany(() => Profile, (profile) => profile.researchInterests)
  profiles!: Profile[];
}
