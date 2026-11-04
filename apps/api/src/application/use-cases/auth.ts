import type { LoginInput, MeResponse, RegisterInput } from "@aula-viva/shared";
import { AppError } from "../../domain/errors";
import { toPublicUser, type User } from "../../domain/user";
import type { PasswordHasher, TokenService, UserRepository } from "../ports";
import type { QuotaService } from "../quota-service";

export interface AuthResult {
  token: string;
  user: User;
}

export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: RegisterInput): Promise<AuthResult> {
    if (await this.users.findByEmail(input.email)) throw new AppError("EMAIL_TAKEN");
    const user = await this.users.create({
      name: input.name,
      email: input.email,
      passwordHash: await this.hasher.hash(input.password),
    });
    return { user, token: this.tokens.sign({ userId: user.id, role: user.role }) };
  }
}

export class LoginUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: LoginInput): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    // Mismo error si el correo no existe o la contraseña no coincide: no revelamos qué cuentas existen.
    const ok = user ? await this.hasher.verify(input.password, user.passwordHash) : false;
    if (!user || !ok) throw new AppError("INVALID_CREDENTIALS");
    return { user, token: this.tokens.sign({ userId: user.id, role: user.role }) };
  }
}

export class GetMe {
  constructor(
    private readonly users: UserRepository,
    private readonly quota: QuotaService,
  ) {}

  async execute(userId: string): Promise<MeResponse> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError("UNAUTHENTICATED");
    return { user: toPublicUser(user), usage: await this.quota.status(user.id, user.plan) };
  }
}
