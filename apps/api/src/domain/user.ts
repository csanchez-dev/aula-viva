import type { Plan, PublicUser, Role } from "@aula-viva/shared";

/** Entidad Usuario tal como la conoce el dominio (incluye el hash, que nunca sale de la API). */
export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  plan: Plan;
  activeThemeId: string | null;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    createdAt: user.createdAt.toISOString(),
  };
}
