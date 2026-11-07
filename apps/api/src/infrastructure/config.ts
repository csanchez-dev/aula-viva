import { z } from "zod";

/** Variables de entorno validadas al arrancar: si falta algo, la API no arranca y dice qué falta. */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    // Número de proxies delante de la API: 0 en local, 2 con Netlify -> Render.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+(ms|s|m|h|d|w|y)?$/, 'JWT_EXPIRES_IN debe ser un número con unidad, por ejemplo "7d" o "12h"')
      .default("7d"),
    AI_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL_SMART: z.string().default("claude-sonnet-5-5"),
    AI_MODEL_FAST: z.string().default("claude-haiku-5-5"),
    QUOTA_FREE_PER_DAY: z.coerce.number().int().nonnegative().default(10),
    QUOTA_PRO_PER_DAY: z.coerce.number().int().nonnegative().default(200),
    // Beta privada. Formato: correo:código,correo:código. Vacío = registro abierto. Nunca en el repositorio.
    BETA_INVITES: z.string().optional(),
    // Correos que pueden ver el panel de actividad, separados por comas.
    BETA_ADMIN_EMAILS: z.string().optional(),
    BETA_START: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-11-07"),
    BETA_END: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-11-13"),
    // Token largo y aleatorio para que GitHub Actions lea el informe diario y envíe los recordatorios.
    BETA_REPORT_TOKEN: z.string().min(32).optional(),
    BETA_DAILY_GOAL: z.coerce.number().int().positive().default(5),
  })
  .refine((env) => env.AI_PROVIDER !== "anthropic" || !!env.ANTHROPIC_API_KEY, {
    message: "AI_PROVIDER=anthropic necesita ANTHROPIC_API_KEY",
    path: ["ANTHROPIC_API_KEY"],
  });

export type Config = z.infer<typeof EnvSchema>;

/**
 * Limpia las variables antes de validarlas: quita espacios y saltos de línea de Windows (\r)
 * y trata una variable vacía ("JWT_EXPIRES_IN=") como no definida, para que se use su valor por defecto.
 */
function clean(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    const trimmed = value?.trim();
    out[key] = trimmed ? trimmed : undefined;
  }
  return out;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(clean(env));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuración no válida. Revisa tu archivo .env:\n${problems}`);
  }
  return parsed.data;
}
