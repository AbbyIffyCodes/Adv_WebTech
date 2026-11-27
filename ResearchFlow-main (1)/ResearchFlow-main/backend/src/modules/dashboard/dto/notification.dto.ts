import { Transform } from "class-transformer";
import { IsBoolean, ValidateIf } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { GroupPaginationDto } from "../../groups/dto/group.dto";
export class NotificationQueryDto extends GroupPaginationDto {
  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @ValidateIf((_o, v) => v !== undefined)
  @IsBoolean()
  unread?: boolean;
}
