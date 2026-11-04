/** Códigos de error estables que la API devuelve y el frontend traduce a mensajes. */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "EMAIL_TAKEN",
  "INVALID_CREDENTIALS",
  "QUOTA_EXCEEDED",
  "AI_UNAVAILABLE",
  "AI_BAD_OUTPUT",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Mensajes en español para mostrar al usuario. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Revisa los datos del formulario.",
  UNAUTHENTICATED: "Inicia sesión para continuar.",
  FORBIDDEN: "No tienes permiso para hacer esto.",
  NOT_FOUND: "No encontramos lo que buscas.",
  EMAIL_TAKEN: "Ya existe una cuenta con ese correo.",
  INVALID_CREDENTIALS: "Correo o contraseña incorrectos.",
  QUOTA_EXCEEDED: "Has usado todas tus generaciones de hoy. Vuelve mañana o pásate a Pro.",
  AI_UNAVAILABLE: "La IA no está disponible ahora mismo. Inténtalo en unos minutos.",
  AI_BAD_OUTPUT: "La IA devolvió un resultado incompleto. Inténtalo de nuevo.",
  RATE_LIMITED: "Demasiados intentos seguidos. Espera un momento.",
  INTERNAL: "Algo salió mal en el servidor.",
};
