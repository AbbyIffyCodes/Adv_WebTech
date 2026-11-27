import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from "typeorm";
import { Profile } from "./profile.entity";

@Entity("skills")
export class Skill {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100, unique: true })
  name!: string;

  @ManyToMany(() => Profile, (profile) => profile.skills)
  profiles!: Profile[];
}
