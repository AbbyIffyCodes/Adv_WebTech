import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PostgresDatabaseProviderModule } from "@/providers/database/postgres/provider.module";
import { AppController } from "@/src/app.controller";
import { AppService } from "@/src/app.service";
import global_config from "@/config/global_config";
import { UsersModule } from "./modules/users/users.module";
import { ProductModule } from "./modules/products/product.module";
import { OrdersModule } from "./modules/orders/orders.module";

@Module({
  imports: [
    PostgresDatabaseProviderModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [global_config],
    }),
    UsersModule,
    ProductModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
