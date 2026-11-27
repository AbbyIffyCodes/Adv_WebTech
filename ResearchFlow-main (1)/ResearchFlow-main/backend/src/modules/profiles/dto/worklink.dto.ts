import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from "class-validator";
const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
export class CreateWorkLinkDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ type: String, example: "GitHub", maxLength: 100 })
  label!: string;
  @Transform(trimString)
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @ApiProperty({
    type: String,
    example: "https://github.com/naimulhassan173",
    maxLength: 2048,
  })
  url!: string;
}
export class UpdateWorkLinkDto {
  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiPropertyOptional({ type: String, example: "GitHub", maxLength: 100 })
  label?: string;
  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @ApiPropertyOptional({
    type: String,
    example: "https://github.com/naimulhassan173",
    maxLength: 2048,
  })
  url?: string;
}
