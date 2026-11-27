import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { isUUID } from "class-validator";
import { User } from "../accounts/entities/user.entity";
import { appConfig } from "../../config/app.config";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: appConfig.env.JWT_BEARER_SECRET,
      algorithms: ["HS256"],
      issuer: "researchflow-api",
      audience: "researchflow-client",
    });
  }
  async validate(payload: {
    sub?: unknown;
    version?: unknown;
    exp?: unknown;
  }): Promise<AuthUser> {
    if (
      typeof payload.sub !== "string" ||
      !isUUID(payload.sub) ||
      !Number.isInteger(payload.version) ||
      typeof payload.exp !== "number"
    ) {
      throw new UnauthorizedException("Invalid access token");
    }
    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user?.isActive || user.tokenVersion !== payload.version) {
      throw new UnauthorizedException("Session expired; please log in again");
    }
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }
}
