import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/decorators/public.decorator";

@Public()
@Controller()
export class AppController {
  @Get()
  index() {
    return {
      application: "ResearchFlow",
      phase: "Accounts and profiles",
      docs: "/api",
    };
  }
  @Get("health")
  health() {
    return { status: "ok" };
  }
}
