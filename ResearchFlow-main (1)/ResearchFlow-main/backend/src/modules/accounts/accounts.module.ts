import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user.entity";
import { Module } from "@nestjs/common";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";
import { Profile } from "../profiles/entities/profile.entity";

@Module({
  imports: [TypeOrmModule.forFeature([User, Profile])],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
