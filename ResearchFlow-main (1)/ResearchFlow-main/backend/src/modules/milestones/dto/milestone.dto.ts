import { ApiProperty, PartialType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsDateString,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
export class CreateMilestoneDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title!: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  description!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() ownerId!: string;
  @ApiProperty({ example: "2027-01-01T17:00:00+06:00" })
  @IsDateString({ strict: true })
  dueDate!: string;
}
export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto, {
  skipNullProperties: false,
}) {}
