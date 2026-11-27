import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { UserRole } from "../../accounts/enums/user_role.enum";
export class ProfileQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  @ApiPropertyOptional({ enum: ["student", "supervisor", "coordinator"] })
  role?: UserRole;
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ type: String, example: "artificial intelligence" })
  researchInterest?: string;
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ type: String, example: "python" })
  skill?: string;
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ type: Boolean, example: true })
  seekingSupervisor?: boolean;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  page: number = 1;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  limit: number = 20;
}
