import { LlmBadOutputError, LlmUnavailableError } from "@aula-viva/ai";
import {
  type CreateTopicInput,
  type ErrorCode,
  type ExtractPdfResult,
  type GenerationJob,
  NOTES_MAX_CHARS,
  splitIntoChunks,
  type Topic,
} from "@aula-viva/shared";
import { AppError } from "../../domain/errors";
import { type Scheduler, summarizeProgress } from "../../domain/scheduling";
import type {
  AiGenerator,
  BackgroundTasks,
  CardRepository,
  CardSchedulingRow,
  Clock,
  JobRepository,
  NewCard,
  PdfTextExtractor,
  StoredTopic,
  TopicRepository,
  UserRepository,
} from "../ports";
import type { QuotaService } from "../quota-service";

/** Un trabajo que sigue "pending" tras este tiempo se da por perdido (por ejemplo, el servidor se reinició). */
export const JOB_STALE_AFTER_MS = 6 * 60 * 1000;

function errorCodeOf(error: unknown): ErrorCode {
  if (error instanceof LlmUnavailableError) return "AI_UNAVAILABLE";
  if (error instanceof LlmBadOutputError) return "AI_BAD_OUTPUT";
  if (error instanceof AppError) return error.code;
  return "INTERNAL";
}

export function toTopic(topic: StoredTopic, rows: CardSchedulingRow[], scheduler: Scheduler, now: Date): Topic {
  return {
    id: topic.id,
    title: topic.title,
    subject: topic.subject,
    createdAt: topic.createdAt.toISOString(),
    progress: summarizeProgress(rows, scheduler, now),
  };
}

/**
 * Genera tarjetas para un tema en segundo plano: reserva cuota, crea el trabajo, responde al instante.
 * Lo comparten "crear tema" y "generar más tarjetas".
 */
export class CardGeneration {
  constructor(
    private readonly topics: TopicRepository,
    private readonly cards: CardRepository,
    private readonly jobs: JobRepository,
    private readonly ai: AiGenerator,
    private readonly quota: QuotaService,
    private readonly background: BackgroundTasks,
    private readonly clock: Clock,
  ) {}

  async start(userId: string, plan: "free" | "pro", topic: StoredTopic): Promise<GenerationJob> {
    const eventId = await this.quota.reserve(userId, plan, "content");
    let job: GenerationJob;
    try {
      job = await this.jobs.create(userId, topic.id, eventId);
    } catch (error) {
      await this.quota.release(eventId);
      throw error;
    }
    this.background.run(() => this.work(userId, topic, job.id));
    return job;
  }

  private async work(userId: string, topic: StoredTopic, jobId: string): Promise<void> {
    try {
      const chunks = await this.topics.chunks(topic.id);
      const existing = new Set((await this.cards.frontsByTopic(topic.id)).map((f) => f.toLowerCase()));
      const drafts = await this.ai.generateCards({
        title: topic.title,
        subject: topic.subject,
        chunks: chunks.map((c) => ({ position: c.position, text: c.text })),
      });
      const byPosition = new Map(chunks.map((c) => [c.position, c.id]));
      const fresh: NewCard[] = drafts
        .filter((d) => !existing.has(d.front.toLowerCase()))
        .map((d) => ({
          kind: d.kind,
          front: d.front,
          back: d.back,
          options: d.kind === "question" ? d.options : null,
          answerIndex: d.kind === "question" ? d.answerIndex : null,
          chunkId: byPosition.get(d.source) ?? null,
        }));
      const created = await this.cards.insertMany(userId, topic.id, fresh, this.clock.now());
      await this.jobs.complete(jobId, created);
    } catch (error) {
      if (error instanceof LlmUnavailableError) {
        // Sin esto, una clave inválida o sin saldo solo se ve como "la IA no está disponible".
        const cause = error.cause instanceof Error ? error.cause.message : error.message;
        console.warn("[jobs] la IA no respondió:", cause);
      } else if (!(error instanceof LlmBadOutputError)) {
        console.error("[jobs] fallo inesperado generando tarjetas", error);
      }
      const reserved = await this.jobs.fail(jobId, errorCodeOf(error));
      if (reserved) await this.quota.release(reserved);
    }
  }
}

/** Crea un tema a partir de los apuntes y lanza la generación de tarjetas. */
export class CreateTopic {
  constructor(
    private readonly users: UserRepository,
    private readonly topics: TopicRepository,
    private readonly generation: CardGeneration,
  ) {}

  async execute(userId: string, input: CreateTopicInput): Promise<{ topic: StoredTopic; job: GenerationJob }> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError("UNAUTHENTICATED");
    const chunks = splitIntoChunks(input.notes);
    if (chunks.length === 0) throw new AppError("VALIDATION_ERROR", "Los apuntes están vacíos.");
    const topic = await this.topics.create(userId, { title: input.title, subject: input.subject, chunks });
    const job = await this.generation.start(user.id, user.plan, topic);
    return { topic, job };
  }
}

/** Vuelve a pasar los apuntes por la IA para conseguir tarjetas nuevas (sin repetir las que ya hay). */
export class GenerateMoreCards {
  constructor(
    private readonly users: UserRepository,
    private readonly topics: TopicRepository,
    private readonly generation: CardGeneration,
  ) {}

  async execute(userId: string, topicId: string): Promise<GenerationJob> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError("UNAUTHENTICATED");
    const topic = await this.topics.findForUser(userId, topicId);
    if (!topic) throw new AppError("NOT_FOUND");
    return this.generation.start(user.id, user.plan, topic);
  }
}

/** Estado de un trabajo. Marca como fallidos los que se quedaron colgados y devuelve su cuota. */
export class GetGenerationJob {
  constructor(
    private readonly jobs: JobRepository,
    private readonly quota: QuotaService,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, jobId: string): Promise<GenerationJob> {
    const job = await this.jobs.findForUser(userId, jobId);
    if (!job) throw new AppError("NOT_FOUND");
    const age = this.clock.now().getTime() - new Date(job.createdAt).getTime();
    if (job.status === "pending" && age > JOB_STALE_AFTER_MS) {
      const reserved = await this.jobs.fail(job.id, "AI_UNAVAILABLE");
      if (reserved) await this.quota.release(reserved);
      return { ...job, status: "failed", errorCode: "AI_UNAVAILABLE" };
    }
    return job;
  }
}

export class DeleteTopic {
  constructor(private readonly topics: TopicRepository) {}

  async execute(userId: string, topicId: string): Promise<void> {
    if (!(await this.topics.deleteForUser(userId, topicId))) throw new AppError("NOT_FOUND");
  }
}

/** Extrae el texto de un PDF para que el estudiante lo revise antes de crear el tema. */
export class ExtractPdfText {
  constructor(private readonly extractor: PdfTextExtractor) {}

  async execute(base64: string): Promise<ExtractPdfResult> {
    const data = Buffer.from(base64, "base64");
    if (data.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new AppError("VALIDATION_ERROR", "El archivo no es un PDF válido.");
    }
    let result: { text: string; pages: number };
    try {
      result = await this.extractor.extract(new Uint8Array(data));
    } catch {
      throw new AppError("VALIDATION_ERROR", "No se pudo leer el PDF. Prueba a copiar y pegar el texto.");
    }
    const text = result.text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text.length < 50) {
      throw new AppError(
        "VALIDATION_ERROR",
        "El PDF no tiene texto seleccionable (parece escaneado). Copia y pega el texto o usa otro archivo.",
      );
    }
    const truncated = text.length > NOTES_MAX_CHARS;
    return { text: truncated ? text.slice(0, NOTES_MAX_CHARS) : text, pages: result.pages, truncated };
  }
}
