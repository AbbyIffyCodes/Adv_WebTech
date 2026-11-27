import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
export class UpdateAccountDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @ApiPropertyOptional({ minLength: 3, maxLength: 120 })
  fullName?: string;
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @ValidateIf((_o, v) => v !== undefined)
  @IsEmail()
  @MaxLength(250)
  @ApiPropertyOptional({ example: "member@example.com" })
  email?: string;
}
