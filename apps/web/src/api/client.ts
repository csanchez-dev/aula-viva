import {
  type ApiErrorBody,
  type BetaActivityReport,
  type BetaStatus,
  type Card,
  type CreateTopicInput,
  type Dashboard,
  ERROR_MESSAGES,
  type ErrorCode,
  type ExtractDocxResult,
  type ExtractPdfResult,
  type GenerationJob,
  type LoginInput,
  type MeResponse,
  type PublicUser,
  type Rating,
  type RegisterInput,
  type ReviewQueue,
  type Topic,
  type UpdateCardInput,
} from "@aula-viva/shared";

/** Error de la API con su código estable y un mensaje listo para mostrar. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("INTERNAL", "No hay conexión con el servidor. Revisa tu conexión a internet.", 0);
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    // Sin cuerpo de error propio y con 502/503/504: el proxy no llegó a la API (está arrancando o caída).
    if (!err && [502, 503, 504].includes(res.status)) {
      throw new ApiError("INTERNAL", "El servidor está arrancando. Vuelve a intentarlo en unos segundos.", res.status);
    }
    const code = err?.code ?? "INTERNAL";
    throw new ApiError(code, err?.message || ERROR_MESSAGES[code], res.status);
  }
  return data as T;
}

/** Cliente tipado: cada función corresponde a un endpoint de la API. */
export const api = {
  register: (input: RegisterInput) => request<{ user: PublicUser }>("POST", "/auth/register", input),
  login: (input: LoginInput) => request<{ user: PublicUser }>("POST", "/auth/login", input),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<MeResponse>("GET", "/me"),

  dashboard: () => request<Dashboard>("GET", "/dashboard"),
  betaStatus: () => request<{ beta: BetaStatus | null }>("GET", "/beta/status"),
  betaActivity: () => request<BetaActivityReport>("GET", "/admin/beta-activity"),
  extractPdf: (fileName: string, dataBase64: string) =>
    request<ExtractPdfResult>("POST", "/notes/extract", { fileName, dataBase64 }),
  extractDocx: (fileName: string, dataBase64: string) =>
    request<ExtractDocxResult>("POST", "/notes/extract-docx", { fileName, dataBase64 }),
  createTopic: (input: CreateTopicInput) => request<{ topicId: string; job: GenerationJob }>("POST", "/topics", input),
  topic: (id: string) => request<{ topic: Topic; cards: Card[]; job: GenerationJob | null }>("GET", `/topics/${id}`),
  deleteTopic: (id: string) => request<void>("DELETE", `/topics/${id}`),
  generateMore: (id: string) => request<{ job: GenerationJob }>("POST", `/topics/${id}/generate`),
  quiz: (id: string) => request<{ questions: Card[] }>("GET", `/topics/${id}/quiz`),
  job: (id: string) => request<{ job: GenerationJob }>("GET", `/jobs/${id}`),

  queue: (topicId?: string) => request<ReviewQueue>("GET", `/review/queue${topicId ? `?topicId=${topicId}` : ""}`),
  review: (cardId: string, rating: Rating) => request<{ card: Card }>("POST", `/cards/${cardId}/review`, { rating }),
  updateCard: (cardId: string, patch: UpdateCardInput) => request<{ card: Card }>("PATCH", `/cards/${cardId}`, patch),
  deleteCard: (cardId: string) => request<void>("DELETE", `/cards/${cardId}`),
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Consulta un trabajo de generación hasta que termina.
 * Empieza cada segundo y va espaciando hasta cada 3 s para no saturar la API.
 */
export async function waitForJob(jobId: string, maxWaitMs = 6 * 60 * 1000): Promise<GenerationJob> {
  const deadline = Date.now() + maxWaitMs;
  let delay = 1000;
  for (;;) {
    await sleep(delay);
    delay = Math.min(3000, delay + 500);
    try {
      const { job } = await api.job(jobId);
      if (job.status !== "pending") return job;
    } catch (error) {
      // Un fallo puntual de red no cancela el trabajo: se sigue consultando.
      if (error instanceof ApiError && error.status > 0 && error.status < 502) throw error;
    }
    if (Date.now() > deadline) throw new ApiError("AI_UNAVAILABLE", "La IA está tardando demasiado. Inténtalo de nuevo.", 504);
  }
}

/**
 * En el plan gratuito de Render la API se duerme tras 15 minutos sin uso y tarda ~1 minuto en despertar.
 * Esta función llama a /health hasta que responde, avisando a la interfaz mientras espera.
 */
export async function waitForApi(onWaiting: (seconds: number) => void, maxWaitMs = 120_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) return true;
    } catch {
      // red caída o servidor aún arrancando
    }
    onWaiting(Math.round((Date.now() - started) / 1000));
    await sleep(3000);
  }
  return false;
}

export const errorText = (error: unknown, fallback = "Algo salió mal. Inténtalo de nuevo.") =>
  error instanceof ApiError ? error.message : fallback;
