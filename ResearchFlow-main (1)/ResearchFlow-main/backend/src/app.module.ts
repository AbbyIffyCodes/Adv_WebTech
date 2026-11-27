import { HttpErrorFilter } from "./common/filters/http-error.filter";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PostgresDatabaseProviderModule } from "./providers/database/postgres/provider.module";
import { AccountsModule } from "./modules/accounts/accounts.module";
import { ProfilesModule } from "./modules/profiles/profiles.module";
import { AuthModule } from "./modules/auth/auth.module";
import { GroupsModule } from "./modules/groups/groups.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { OpportunitiesModule } from "./modules/opportunities/opportunities.module";
import { SelectionModule } from "./modules/selection/selection.module";
import { SubmissionsModule } from "./modules/submissions/submissions.module";
import { MilestonesModule } from "./modules/milestones/milestones.module";
import { SupportModule } from "./modules/support/support.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { AuthGuard } from "./common/guard/auth.guard";
import { RolesGuard } from "./common/guard/roles.guard";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { appConfig } from "./config/app.config";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PostgresDatabaseProviderModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ...(appConfig.env.ENABLE_QUEUE
      ? [
          BullModule.forRoot({
            redis: {
              host: appConfig.env.REDIS_HOST,
              port: appConfig.env.REDIS_PORT,
              password: appConfig.env.REDIS_PASSWORD,
            },
          }),
        ]
      : []),
    AccountsModule,
    ProfilesModule,
    AuthModule,
    GroupsModule,
    ProjectsModule,
    OpportunitiesModule,
    SelectionModule,
    SubmissionsModule,
    MilestonesModule,
    SupportModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: HttpErrorFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
