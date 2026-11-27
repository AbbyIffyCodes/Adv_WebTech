import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  Equals,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { GroupPaginationDto } from "../../groups/dto/group.dto";
export class SelectionStartDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() projectId!: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  opportunityId?: string;
  @ApiProperty({ maxLength: 2000 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  statement!: string;
}
export class ApplicationDto extends SelectionStartDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() supervisorId!: string;
}
export class DecisionDto {
  @ApiProperty({ maxLength: 1000 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
export class ConfirmationDto {
  @ApiProperty({
    example: true,
    description:
      "Explicit consent for this named supervisor to access full proposal documents",
  })
  @Equals(true, { message: "Explicit document-sharing consent must be true" })
  shareFullProposal!: boolean;
}
export class SelectionQueryDto extends GroupPaginationDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() projectId!: string;
}
export class AccessGrantDto {
  @ApiProperty({
    format: "uuid",
    description:
      "Named coordinator or the project's active confirmed supervisor",
  })
  @IsUUID()
  granteeId!: string;
}
