import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsUUID,
} from "class-validator";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
export class SubmitProposalDto {
  @IsOptional() @IsUUID() milestoneId?: string;
  @ApiProperty({
    maxLength: 1000,
    example: "First proposal draft for supervisor review",
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  revisionNote!: string;
}
export enum ReviewDecision {
  REVISION_REQUIRED = "revision_required",
  APPROVED = "approved",
}
export class CreateReviewDto {
  @ApiProperty({ enum: ReviewDecision })
  @IsEnum(ReviewDecision)
  decision!: ReviewDecision;
  @ApiProperty({ maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  comments!: string;
}
