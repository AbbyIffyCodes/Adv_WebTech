import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
export class CreateGroupDto {
  @ApiProperty({
    example: "ResearchFlow AI Group",
    minLength: 3,
    maxLength: 120,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  name!: string;
  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
export class UpdateGroupDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 120 })
  @Transform(trim)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
export class InviteGroupMemberDto {
  @ApiProperty({
    description: "Student user ID from the authenticated profile directory",
    format: "uuid",
  })
  @IsUUID()
  inviteeId!: string;
}
export class TransferLeaderDto {
  @ApiProperty({
    description: "An existing active member's user ID",
    format: "uuid",
  })
  @IsUUID()
  leaderId!: string;
}
export class GroupPaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
