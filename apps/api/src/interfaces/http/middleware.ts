import { LlmBadOutputError, LlmUnavailableError } from "@aula-viva/ai";
import type { ApiErrorBody, Role } from "@aula-viva/shared";
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType, ZodTypeDef } from "zod";
import type { TokenService } from "../../application/ports";
import { AppError } from "../../domain/errors";

export const SESSION_COOKIE = "av_session";

/** Datos de sesión que el middleware de autenticación deja en la petición. */
export interface AuthedLocals {
  userId: string;
  role: Role;
}

export function auth(tokens: TokenService): RequestHandler {
  return (req, res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const payload = typeof token === "string" ? tokens.verify(token) : null;
    if (!payload) return next(new AppError("UNAUTHENTICATED"));
    res.locals.auth = { userId: payload.userId, role: payload.role } satisfies AuthedLocals;
    next();
  };
}

export function requireRole(role: Role): RequestHandler {
  return (_req, res, next) => {
    const current = (res.locals.auth as AuthedLocals | undefined)?.role;
    next(current === role ? undefined : new AppError("FORBIDDEN"));
  };
}

export const session = (res: Response): AuthedLocals => res.locals.auth as AuthedLocals;

/** Valida datos de entrada con un esquema compartido; si falla, responde 400 con los detalles. */
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", result.error.issues[0]?.message, result.error.flatten().fieldErrors);
  }
  return result.data;
}

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError("NOT_FOUND"));

/** Traduce cualquier error a una respuesta JSON uniforme { error: { code, message } }. */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  let appError: AppError;
  if (err instanceof AppError) appError = err;
  else if (err instanceof LlmUnavailableError) appError = new AppError("AI_UNAVAILABLE");
  else if (err instanceof LlmBadOutputError) appError = new AppError("AI_BAD_OUTPUT");
  else if (isBodyParseError(err)) appError = new AppError("VALIDATION_ERROR", "El cuerpo de la petición no es JSON válido.");
  else if (bodyErrorType(err) === "entity.too.large") appError = new AppError("VALIDATION_ERROR", "El archivo es demasiado grande (máximo 10 MB).");
  else appError = new AppError("INTERNAL");
  if (appError.status >= 500 && !(err instanceof AppError)) console.error("[api]", appError.code, err);
  const body: ApiErrorBody = { error: { code: appError.code, message: appError.message, details: appError.details } };
  res.status(appError.status).json(body);
};

function bodyErrorType(err: unknown): string | undefined {
  return typeof err === "object" && err !== null ? (err as { type?: string }).type : undefined;
}

function isBodyParseError(err: unknown): boolean {
  return bodyErrorType(err) === "entity.parse.failed";
}
