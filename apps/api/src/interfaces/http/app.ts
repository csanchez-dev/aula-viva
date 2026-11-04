import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { errorHandler, notFound } from "./middleware";
import { buildRouter } from "./routes";
import type { HttpDeps } from "./use-cases";

/** Crea la aplicación Express. No sabe nada de PostgreSQL ni de Anthropic: solo recibe casos de uso. */
export function createApp(deps: HttpDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  // Detrás de proxies, req.ip sale de X-Forwarded-For. Hay que decirle a Express cuántos saltos son de confianza.
  app.set("trust proxy", deps.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: deps.webOrigin, credentials: true }));
  // Límite pequeño para todo salvo la subida de PDF o DOCX (base64 de hasta 10 MB).
  const smallJson = express.json({ limit: "512kb" });
  const fileJson = express.json({ limit: "15mb" });
  const fileUploads = new Set(["/api/notes/extract", "/api/notes/extract-docx"]);
  app.use((req, res, next) => (fileUploads.has(req.path) ? fileJson : smallJson)(req, res, next));
  app.use(cookieParser());

  // Comprobación de vida (Render la usa para saber si la API está lista).
  // Devuelve la IP que ve el servidor: sirve para verificar que TRUST_PROXY está bien configurado.
  app.get("/api/health", (req, res) => {
    res.set("Cache-Control", "no-store").json({ ok: true, ip: req.ip });
  });
  app.use("/api", buildRouter(deps));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
