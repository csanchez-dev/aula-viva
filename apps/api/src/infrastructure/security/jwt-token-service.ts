import { RoleSchema } from "@aula-viva/shared";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { TokenPayload, TokenService } from "../../application/ports";

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: SignOptions["expiresIn"],
  ) {}

  sign(payload: TokenPayload): string {
    return jwt.sign({ role: payload.role }, this.secret, {
      subject: payload.userId,
      expiresIn: this.expiresIn,
      algorithm: "HS256",
    });
  }

  verify(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret, { algorithms: ["HS256"] });
      if (typeof decoded === "string" || !decoded.sub) return null;
      const role = RoleSchema.safeParse(decoded.role);
      return role.success ? { userId: decoded.sub, role: role.data } : null;
    } catch {
      return null;
    }
  }
}
