import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GroupPaginationDto } from "../../groups/dto/group.dto";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const tags = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === "string" ? v.trim().toLowerCase() : v))
    : value;
export class ProjectDetailsDto {
  @ApiProperty({
    example: "Bangla research paper classification",
    minLength: 3,
    maxLength: 200,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title!: string;
  @ApiProperty({
    example: "Investigate methods for classifying Bangla research abstracts.",
    maxLength: 1500,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1500)
  sharedSummary!: string;
  @ApiProperty({ example: ["Artificial Intelligence", "NLP"] })
  @Transform(tags)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  areaTags!: string[];
}
export class CreateProjectDto extends ProjectDetailsDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() groupId!: string;
}
export class UpdateProjectDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 200 })
  @Transform(trim)
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title?: string;
  @ApiPropertyOptional({ maxLength: 1500 })
  @Transform(trim)
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1500)
  sharedSummary?: string;
  @ApiPropertyOptional({ type: [String] })
  @Transform(tags)
  @ValidateIf((_o, v) => v !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  areaTags?: string[];
}
export class SummaryVisibilityDto {
  @ApiProperty({
    description: "Leader explicitly approves sharing only the limited summary",
    example: true,
  })
  @IsBoolean()
  published!: boolean;
}
export class ProjectQueryDto extends GroupPaginationDto {
  @ApiPropertyOptional({ example: "NLP" })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  researchInterest?: string;
}
