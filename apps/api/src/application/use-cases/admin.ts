import type { Plan, PublicUser } from "@aula-viva/shared";
import { AppError } from "../../domain/errors";
import { toPublicUser } from "../../domain/user";
import type { UserRepository } from "../ports";

/**
 * Cambia el plan de un usuario. Hoy lo hace un administrador a mano;
 * cuando integres pagos (Stripe), lo llamará el webhook de suscripciones.
 */
export class ChangeUserPlan {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string, plan: Plan): Promise<PublicUser> {
    const user = await this.users.setPlan(userId, plan);
    if (!user) throw new AppError("NOT_FOUND");
    return toPublicUser(user);
  }
}
