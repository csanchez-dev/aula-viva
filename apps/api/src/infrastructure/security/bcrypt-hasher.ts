import bcrypt from "bcryptjs";
import type { PasswordHasher } from "../../application/ports";

/** Hash de contraseñas con bcrypt. Nunca se guarda la contraseña en claro. */
export class BcryptHasher implements PasswordHasher {
  constructor(private readonly rounds = 12) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
