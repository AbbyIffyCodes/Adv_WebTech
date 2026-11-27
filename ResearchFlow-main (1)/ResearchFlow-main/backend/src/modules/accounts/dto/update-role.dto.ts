import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { UserRole } from "../enums/user_role.enum";
export class UpdateRoleDto {
  @IsEnum(UserRole)
  @ApiProperty({
    enum: ["student", "supervisor", "coordinator"],
    example: "supervisor",
  })
  role!: UserRole;
}
