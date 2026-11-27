import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { GroupPaginationDto } from "../../groups/dto/group.dto";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
export enum SupportReason {
  DECLINED = "declined",
  UNANSWERED = "unanswered",
  CAPACITY = "capacity",
  UNAVAILABLE = "unavailable",
  CONCERN = "concern",
}
export class CreateSupportCaseDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() projectId!: string;
  @ApiProperty({ enum: SupportReason })
  @IsEnum(SupportReason)
  reason!: SupportReason;
  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  requestId?: string;
}
export class CreateSuggestionDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  supervisorId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  opportunityId?: string;
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  researchDirection?: string;
  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  explanation!: string;
}
export enum SuggestionResponse {
  ACCEPTED = "accepted",
  DECLINED = "declined",
}
export class RespondSuggestionDto {
  @ApiProperty({ enum: SuggestionResponse })
  @IsEnum(SuggestionResponse)
  response!: SuggestionResponse;
  @ApiProperty({ maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
export enum SupportStatus {
  IN_REVIEW = "in_review",
  RESOLVED = "resolved",
}
export class UpdateSupportStatusDto {
  @ApiProperty({ enum: SupportStatus })
  @IsEnum(SupportStatus)
  status!: SupportStatus;
  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string;
}
export class ReopenCaseDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
export class SupportQueryDto extends GroupPaginationDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  projectId?: string;
  @ApiPropertyOptional({
    enum: ["open", "in_review", "awaiting_student", "resolved"],
  })
  @IsOptional()
  @IsEnum(["open", "in_review", "awaiting_student", "resolved"])
  status?: string;
}
