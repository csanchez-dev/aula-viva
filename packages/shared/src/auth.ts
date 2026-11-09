import { z } from "zod";

export const RoleSchema = z.enum(["student", "admin"]);
export type Role = z.infer<typeof RoleSchema>;

/** Planes del modelo freemium. */
export const PlanSchema = z.enum(["free", "pro"]);
export type Plan = z.infer<typeof PlanSchema>;

const email = z.string().trim().toLowerCase().email("Correo no válido").max(254);

export const RegisterSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(80),
  email,
  password: z
    .string()
    .min(10, "La contraseña necesita al menos 10 caracteres")
    .max(128)
    .regex(/[A-Za-z]/, "Incluye al menos una letra")
    .regex(/[0-9]/, "Incluye al menos un número"),
  /** Código personal de invitación. El servidor lo exige solo si el programa beta está activo. */
  inviteCode: z.string().trim().max(64).optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email,
  password: z.string().min(1, "Escribe tu contraseña").max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const UsageSchema = z.object({
  used: z.number().int(),
  limit: z.number().int(),
  resetsAt: z.string(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  role: RoleSchema,
  plan: PlanSchema,
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const MeResponseSchema = z.object({
  user: PublicUserSchema,
  usage: UsageSchema,
  /** Papel de la persona en el programa beta privado. */
  beta: z.object({ tester: z.boolean(), admin: z.boolean() }),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
