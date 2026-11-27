import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
const normaliseTags = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) =>
        typeof item === "string" ? item.trim().toLowerCase() : item,
      )
    : value;
export class CreateProfileTagsDto {
  @Transform(normaliseTags)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  @ApiPropertyOptional({
    type: [String],
    example: ["Artificial Intelligence", "NLP"],
    maxItems: 20,
  })
  researchInterests?: string[];
  @Transform(normaliseTags)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  @ApiPropertyOptional({
    type: [String],
    example: ["Python", "TypeScript"],
    maxItems: 20,
  })
  skills?: string[];
}
