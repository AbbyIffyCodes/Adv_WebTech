import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { ProfilesService } from "./profiles.service";
import { UpdateProfileDto } from "./dto/profile.dto";
import { ProfileQueryDto } from "./dto/profile-query.dto";
import { CreateWorkLinkDto, UpdateWorkLinkDto } from "./dto/worklink.dto";
import { CreateProfileTagsDto } from "./dto/profiletags.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Research profiles")
@ApiBearerAuth()
@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}
  @Get()
  list(@Query() query: ProfileQueryDto) {
    return this.profiles.getProfiles(query);
  }
  @Get(":userId")
  get(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.profiles.getProfileByUserId(userId);
  }
  @Patch(":userId")
  update(
    @CurrentUser() actor: AuthUser,
    @Param("userId", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profiles.updateProfile(actor, id, dto);
  }
  @Post(":userId/work-links")
  addLink(
    @CurrentUser() actor: AuthUser,
    @Param("userId", ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkLinkDto,
  ) {
    return this.profiles.createWorkLink(actor, id, dto);
  }
  @Patch(":userId/work-links/:workLinkId")
  updateLink(
    @CurrentUser() actor: AuthUser,
    @Param("userId", ParseUUIDPipe) id: string,
    @Param("workLinkId", ParseUUIDPipe) linkId: string,
    @Body() dto: UpdateWorkLinkDto,
  ) {
    return this.profiles.updateWorkLink(actor, id, linkId, dto);
  }
  @Delete(":userId/work-links/:workLinkId")
  removeLink(
    @CurrentUser() actor: AuthUser,
    @Param("userId", ParseUUIDPipe) id: string,
    @Param("workLinkId", ParseUUIDPipe) linkId: string,
  ) {
    return this.profiles.deleteWorkLink(actor, id, linkId);
  }
  @Post(":userId/tags")
  addTags(
    @CurrentUser() actor: AuthUser,
    @Param("userId", ParseUUIDPipe) id: string,
    @Body() dto: CreateProfileTagsDto,
  ) {
    return this.profiles.saveTags(actor, id, dto, false);
  }
  @Patch(":userId/tags")
  replaceTags(
    @CurrentUser() actor: AuthUser,
    @Param("userId", ParseUUIDPipe) id: string,
    @Body() dto: CreateProfileTagsDto,
  ) {
    return this.profiles.saveTags(actor, id, dto, true);
  }
}
