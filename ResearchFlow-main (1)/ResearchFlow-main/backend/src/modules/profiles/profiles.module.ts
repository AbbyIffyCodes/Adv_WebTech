import { TypeOrmModule } from "@nestjs/typeorm";
import { Profile } from "./entities/profile.entity";
import { ResearchInterest } from "./entities/research_interest.entity";
import { Skill } from "./entities/skill.entity";
import { WorkLink } from "./entities/work_link.entity";
import { Module } from "@nestjs/common";
import { ProfilesService } from "./profiles.service";
import { ProfilesController } from "./profiles.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([Profile, ResearchInterest, Skill, WorkLink]),
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
