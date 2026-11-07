import { ERROR_MESSAGES, type ErrorCode } from "@aula-viva/shared";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  INVITE_REQUIRED: 403,
  REVIEW_FIRST: 409,
  INVALID_CREDENTIALS: 401,
  QUOTA_EXCEEDED: 429,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  AI_BAD_OUTPUT: 502,
  INTERNAL: 500,
};

/** Error de negocio con un código estable. La capa HTTP lo traduce a una respuesta. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string = ERROR_MESSAGES[code],
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}
