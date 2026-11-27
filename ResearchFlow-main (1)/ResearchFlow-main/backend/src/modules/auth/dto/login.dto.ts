import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
export class LoginDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(250)
  @ApiProperty({ type: String, example: "naimul@example.com" })
  email!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @ApiProperty({
    type: String,
    example: "Sample@12345",
    format: "password",
    writeOnly: true,
  })
  password!: string;
}
