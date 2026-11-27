import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
export class UpdateProfileDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({
    type: String,
    example: "Interested in artificial intelligence",
    maxLength: 2000,
    nullable: true,
  })
  bio?: string | null;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(250)
  @ApiPropertyOptional({
    type: String,
    example: "Open for requests",
    maxLength: 250,
    nullable: true,
  })
  availability?: string | null;
  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ type: Number, example: 5, minimum: 0, nullable: true })
  capacity?: number | null;
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  @ApiPropertyOptional({ type: Boolean, example: true })
  seekingSupervisor?: boolean;
}
