import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { IRequest } from "../interfaces/request.interface";
import { AuthUser } from "../interfaces/auth-user.interface";
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<IRequest>().user;
    if (!user) throw new UnauthorizedException("Authentication required");
    return field ? user[field] : user;
  },
);
export const OptionalCurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<IRequest>().user ?? null,
);
