import { z } from "zod";

/**
 * Tema visual que la IA genera a partir de una descripción ("jardín de flores", "sci-fi"...).
 * La IA nunca escribe CSS ni código: solo elige valores dentro de estas listas cerradas.
 * Así el tema es seguro (no hay inyección de código) y barato (respuesta JSON pequeña).
 */
export const THEME_FONTS = ["orbitron", "fraunces", "pixel", "rounded", "classic", "hand", "mono", "grotesque"] as const;
export const THEME_PATTERNS = ["stars", "petals", "grid", "pixels", "waves", "dots", "none"] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color en formato #rrggbb");

export const ThemeSchema = z.object({
  bg: hexColor,
  surface: hexColor,
  text: hexColor,
  muted: hexColor,
  accent: hexColor,
  accent2: hexColor,
  font: z.enum(THEME_FONTS).catch("grotesque"),
  pattern: z.enum(THEME_PATTERNS).catch("none"),
  radius: z.coerce.number().transform((v) => Math.min(28, Math.max(0, Math.round(v)))),
  tagline: z.string().max(80).default(""),
});
export type Theme = z.infer<typeof ThemeSchema>;

export const ThemeRequestSchema = z.object({
  prompt: z.string().trim().min(3, "Describe el estilo con al menos 3 caracteres").max(160),
});
export type ThemeRequest = z.infer<typeof ThemeRequestSchema>;

export const SavedThemeSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string(),
  theme: ThemeSchema,
  createdAt: z.string(),
});
export type SavedTheme = z.infer<typeof SavedThemeSchema>;

// ---------- Reglas de accesibilidad (WCAG) ----------

/** Luminancia relativa de un color #rrggbb según WCAG 2.x. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Ratio de contraste entre dos colores (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Devuelve `fg` si se lee bien sobre `bg`; si no, negro o blanco según el fondo. */
export function readableOn(bg: string, fg: string, minRatio = 4.5): string {
  if (contrastRatio(bg, fg) >= minRatio) return fg;
  return luminance(bg) > 0.4 ? "#111111" : "#ffffff";
}

/**
 * Corrige un tema para que siempre sea legible: texto con contraste AA sobre la superficie
 * y texto secundario con al menos 3:1. Es una regla de negocio pura, testeable y compartida.
 */
export function ensureReadable(theme: Theme): Theme {
  const text = readableOn(theme.surface, theme.text);
  const muted = contrastRatio(theme.surface, theme.muted) >= 3 ? theme.muted : text;
  return { ...theme, text, muted };
}
