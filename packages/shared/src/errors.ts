/** Códigos de error estables que la API devuelve y el frontend traduce a mensajes. */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "EMAIL_TAKEN",
  "INVITE_REQUIRED",
  "REVIEW_FIRST",
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
  INVITE_REQUIRED: "Aula Viva está en beta privada. Revisa que tu correo y tu código de invitación sean los que te enviamos.",
  REVIEW_FIRST: "Antes de crear tarjetas nuevas, completa tu repaso de hoy.",
  QUOTA_EXCEEDED: "Ya usaste tus generaciones de hoy. Se renuevan a las 7:00 p. m., hora de Colombia.",
  AI_UNAVAILABLE: "La IA no está disponible ahora mismo. Inténtalo en unos minutos.",
  AI_BAD_OUTPUT: "La IA devolvió un resultado incompleto. Inténtalo de nuevo.",
  RATE_LIMITED: "Demasiados intentos seguidos. Espera un momento.",
  INTERNAL: "Algo salió mal en el servidor.",
};
