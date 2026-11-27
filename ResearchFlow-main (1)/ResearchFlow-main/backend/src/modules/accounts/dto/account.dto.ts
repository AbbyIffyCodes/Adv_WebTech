import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsByteLength,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
} from "class-validator";
export class AccountDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  @ApiProperty({
    type: String,
    example: "Naimul Hassan",
    minLength: 3,
    maxLength: 120,
  })
  fullName!: string;
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(250)
  @ApiProperty({ type: String, example: "naimul@example.com", maxLength: 250 })
  email!: string;
  @IsString()
  @MaxLength(72)
  @IsByteLength(8, 72)
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  })
  @ApiProperty({
    type: String,
    example: "Sample@12345",
    format: "password",
    writeOnly: true,
    minLength: 8,
    maxLength: 72,
    description: "At least 8 characters; at most 72 UTF-8 bytes",
  })
  password!: string;
}
