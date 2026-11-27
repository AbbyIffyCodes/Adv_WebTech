import {
  Body,
  Get,
  Delete,
  Query,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AccountsService } from "./accounts.service";
import { AccountDto } from "./dto/account.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "./enums/user_role.enum";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { UpdateAccountDto } from "./dto/update-account.dto";
import { GroupPaginationDto } from "../groups/dto/group.dto";
@ApiTags("Accounts")
@Controller("accounts")
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}
  @Get()
  @ApiBearerAuth()
  @Roles(UserRole.COORDINATOR)
  list(@Query() q: GroupPaginationDto) {
    return this.accountsService.list(q);
  }
  @Get(":id")
  @ApiBearerAuth()
  get(@CurrentUser() a: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.accountsService.get(a, id);
  }
  @Patch(":id")
  @ApiBearerAuth()
  update(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(a, id, dto);
  }
  @Delete(":id")
  @ApiBearerAuth()
  @Roles(UserRole.COORDINATOR)
  deactivate(
    @CurrentUser() a: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.accountsService.deactivate(a, id);
  }
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  createAccount(@Body() dto: AccountDto) {
    return this.accountsService.createAccount(dto);
  }
  @Roles(UserRole.COORDINATOR)
  @ApiBearerAuth()
  @Patch(":id/role")
  updateRole(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.accountsService.updateRole(actor, id, dto.role);
  }
}
