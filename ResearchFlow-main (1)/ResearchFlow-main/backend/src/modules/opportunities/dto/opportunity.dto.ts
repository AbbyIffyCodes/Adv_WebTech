import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
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
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { GroupPaginationDto } from "../../groups/dto/group.dto";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const tags = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === "string" ? v.trim().toLowerCase() : v))
    : value;
export class CreateOpportunityDto {
  @ApiProperty({
    example: "Bangla NLP research assistant",
    minLength: 3,
    maxLength: 200,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title!: string;
  @ApiProperty({ maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;
  @ApiProperty({
    description:
      "Selection criteria in addition to required and preferred skills",
    maxLength: 3000,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  criteria!: string;
  @ApiProperty({ minimum: 1, maximum: 1000, example: 4 })
  @IsInt()
  @Min(1)
  @Max(1000)
  places!: number;
  @ApiProperty({
    description: "Future ISO timestamp with timezone",
    example: "2027-01-31T23:59:00+06:00",
  })
  @IsDateString({ strict: true })
  deadline!: string;
  @ApiProperty({ example: ["NLP"] })
  @Transform(tags)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  areaTags!: string[];
  @ApiProperty({ example: ["Python"] })
  @Transform(tags)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  requiredSkills!: string[];
  @ApiProperty({ example: ["TypeScript"] })
  @Transform(tags)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  preferredSkills!: string[];
}
// PartialType must not treat null as an omitted update.
export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto, {
  skipNullProperties: false,
}) {}
export enum OpportunityStatus {
  OPEN = "open",
  CLOSED = "closed",
}
export class OpportunityStatusDto {
  @ApiProperty({ enum: OpportunityStatus })
  @IsEnum(OpportunityStatus)
  status!: OpportunityStatus;
}
export class OpportunityQueryDto extends GroupPaginationDto {
  @ApiPropertyOptional({ example: "NLP" })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  researchInterest?: string;
  @ApiPropertyOptional({
    example: "Python",
    description: "Matches either required or preferred skills",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  skill?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  supervisorId?: string;
}
