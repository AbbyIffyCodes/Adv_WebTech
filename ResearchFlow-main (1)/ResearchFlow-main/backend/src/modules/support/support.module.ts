import { Module } from "@nestjs/common";
import { SelectionModule } from "../selection/selection.module";
import { SupportService } from "./support.service";
import { SupportController } from "./support.controller";
@Module({
  imports: [SelectionModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
