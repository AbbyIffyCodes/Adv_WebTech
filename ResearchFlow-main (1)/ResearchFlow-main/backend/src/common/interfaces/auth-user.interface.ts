import { UserRole } from "../../modules/accounts/enums/user_role.enum";
export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}
