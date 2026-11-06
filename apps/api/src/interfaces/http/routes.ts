import {
  CreateTopicSchema,
  ExtractDocxSchema,
  ExtractPdfSchema,
  LoginSchema,
  PlanSchema,
  RegisterSchema,
  ReviewSchema,
  ThemeRequestSchema,
  UpdateCardSchema,
} from "@aula-viva/shared";
import { type CookieOptions, type Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { toPublicUser, type User } from "../../domain/user";
import { auth, parse, requireRole, SESSION_COOKIE, session } from "./middleware";
import type { HttpDeps } from "./use-cases";

const IdParam = z.object({ id: z.string().uuid("Identificador no válido") });
const QueueQuery = z.object({ topicId: z.string().uuid().optional() });
const ActiveThemeSchema = z.object({ themeId: z.string().uuid().nullable() });
const PlanBody = z.object({ plan: PlanSchema });

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function buildRouter(deps: HttpDeps): Router {
  const { useCases: uc } = deps;
  const router = Router();
  const requireAuth = auth(deps.tokens);

  const cookieOptions: CookieOptions = {
    httpOnly: true, // JavaScript del navegador no puede leerla: protege contra XSS
    sameSite: "lax", // no se envía en peticiones de otros sitios: protege contra CSRF
    secure: deps.secureCookies, // solo por HTTPS en producción
    maxAge: SEVEN_DAYS_MS,
    path: "/",
  };
  const startSession = (res: Response, token: string, user: User, status = 200) => {
    res.cookie(SESSION_COOKIE, token, cookieOptions).status(status).json({ user: toPublicUser(user) });
  };

  // ---------- Autenticación ----------
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Demasiados intentos. Espera unos minutos." } }),
  });

  router.post("/auth/register", authLimiter, async (req, res) => {
    const { token, user } = await uc.register.execute(parse(RegisterSchema, req.body));
    startSession(res, token, user, 201);
  });

  router.post("/auth/login", authLimiter, async (req, res) => {
    const { token, user } = await uc.login.execute(parse(LoginSchema, req.body));
    startSession(res, token, user);
  });

  router.post("/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions, maxAge: undefined }).status(204).end();
  });

  router.get("/me", requireAuth, async (_req, res) => {
    res.json(await uc.getMe.execute(session(res).userId));
  });

  // ---------- Apuntes y temas ----------
  // Extrae el texto de un PDF para que el estudiante lo revise antes de crear el tema.
  router.post("/notes/extract", requireAuth, async (req, res) => {
    const { dataBase64 } = parse(ExtractPdfSchema, req.body);
    res.json(await uc.extractPdf.execute(dataBase64));
  });

  // Lo mismo para documentos de Word (.docx).
  router.post("/notes/extract-docx", requireAuth, async (req, res) => {
    const { dataBase64 } = parse(ExtractDocxSchema, req.body);
    res.json(await uc.extractDocx.execute(dataBase64));
  });

  // Crea el tema y responde 202 con el trabajo de generación; el cliente consulta GET /jobs/:id.
  router.post("/topics", requireAuth, async (req, res) => {
    const { topic, job } = await uc.createTopic.execute(session(res).userId, parse(CreateTopicSchema, req.body));
    res.status(202).json({ topicId: topic.id, job });
  });

  router.get("/topics/:id", requireAuth, async (req, res) => {
    const { id } = parse(IdParam, req.params);
    res.set("Cache-Control", "no-store").json(await uc.getTopic.execute(session(res).userId, id));
  });

  router.delete("/topics/:id", requireAuth, async (req, res) => {
    const { id } = parse(IdParam, req.params);
    await uc.deleteTopic.execute(session(res).userId, id);
    res.status(204).end();
  });

  router.post("/topics/:id/generate", requireAuth, async (req, res) => {
    const { id } = parse(IdParam, req.params);
    res.status(202).json({ job: await uc.generateMore.execute(session(res).userId, id) });
  });

  router.get("/topics/:id/quiz", requireAuth, async (req, res) => {
    const { id } = parse(IdParam, req.params);
    res.set("Cache-Control", "no-store").json({ questions: await uc.quiz.execute(session(res).userId, id) });
  });

  router.get("/jobs/:id", requireAuth, async (req, res) => {
    const { id } = parse(IdParam, req.params);
    res.set("Cache-Control", "no-store").json({ job: await uc.getJob.execute(session(res).userId, id) });
  });

  // ---------- Estudio ----------
  router.get("/dashboard", requireAuth, async (_req, res) => {
    res.set("Cache-Control", "no-store").json(await uc.dashboard.execute(session(res).userId));
  });

  router.get("/review/queue", requireAuth, async (req, res) => {
    const { topicId } = parse(QueueQuery, req.query);
    res.set("Cache-Control", "no-store").json(await uc.reviewQueue.execute(session(res).userId, topicId));
  });

  router.post("/cards/:id/review", requireAuth, async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { rating } = parse(ReviewSchema, req.body);
    res.json({ card: await uc.reviewCard.execute(session(res).userId, id, rating) });
  });

  router.patch("/cards/:id", requireAuth, async (req, res) => {
    const { id } = parse(IdParam, req.params);
    res.json({ card: await uc.updateCard.execute(session(res).userId, id, parse(UpdateCardSchema, req.body)) });
  });

  router.delete("/cards/:id", requireAuth, async (req, res) => {
    const { id } = parse(IdParam, req.params);
    await uc.deleteCard.execute(session(res).userId, id);
    res.status(204).end();
  });

  // ---------- Temas visuales (fuera del MVP: la API se conserva para más adelante) ----------
  router.get("/themes", requireAuth, async (_req, res) => {
    const userId = session(res).userId;
    const [themes, active] = await Promise.all([uc.listThemes.execute(userId), uc.getActiveTheme.execute(userId)]);
    res.json({ themes, activeThemeId: active?.id ?? null });
  });

  router.get("/themes/active", requireAuth, async (_req, res) => {
    res.json({ theme: await uc.getActiveTheme.execute(session(res).userId) });
  });

  router.post("/themes", requireAuth, async (req, res) => {
    const { prompt } = parse(ThemeRequestSchema, req.body);
    res.status(201).json({ theme: await uc.createTheme.execute(session(res).userId, prompt) });
  });

  router.put("/themes/active", requireAuth, async (req, res) => {
    const { themeId } = parse(ActiveThemeSchema, req.body);
    await uc.setActiveTheme.execute(session(res).userId, themeId);
    res.status(204).end();
  });

  // ---------- Beta privada ----------
  router.get("/beta/status", requireAuth, async (_req, res) => {
    res.set("Cache-Control", "no-store").json({ beta: await uc.betaStatus.execute(session(res).userId) });
  });

  router.get("/admin/beta-activity", requireAuth, async (_req, res) => {
    res.set("Cache-Control", "no-store").json(await uc.betaActivity.execute(session(res).userId));
  });

  // ---------- Administración ----------
  router.patch("/admin/users/:id/plan", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { plan } = parse(PlanBody, req.body);
    res.json({ user: await uc.changeUserPlan.execute(id, plan) });
  });

  return router;
}
