import { z } from "zod";
import type { ErrorCode } from "./errors";

/**
 * Contratos del ciclo anti-olvido:
 * tema (apuntes) → fragmentos → tarjetas generadas por IA → repaso espaciado → progreso.
 */

// ---------- Temas y apuntes ----------

export const NOTES_MIN_CHARS = 200;
export const NOTES_MAX_CHARS = 60_000;

export const CreateTopicSchema = z.object({
  title: z.string().trim().min(2, "Ponle un título al tema").max(120),
  subject: z.string().trim().min(2, "Elige la asignatura").max(60),
  notes: z
    .string()
    .trim()
    .min(NOTES_MIN_CHARS, `Pega al menos ${NOTES_MIN_CHARS} caracteres de apuntes`)
    .max(NOTES_MAX_CHARS, `Los apuntes no pueden pasar de ${NOTES_MAX_CHARS.toLocaleString("es")} caracteres. Divide el tema en partes.`),
});
export type CreateTopicInput = z.infer<typeof CreateTopicSchema>;

/** PDF enviado en base64 para extraer su texto en el servidor. */
export const ExtractPdfSchema = z.object({
  fileName: z.string().max(200),
  dataBase64: z.string().min(1).max(14_000_000, "El PDF no puede pasar de 10 MB"),
});
export type ExtractPdfInput = z.infer<typeof ExtractPdfSchema>;

export interface ExtractPdfResult {
  text: string;
  pages: number;
  /** true si el texto se recortó para no pasar de NOTES_MAX_CHARS. */
  truncated: boolean;
}

/** Un fragmento numerado de los apuntes. Las tarjetas apuntan a él para poder comprobarlas. */
export interface SourceChunk {
  id: string;
  position: number;
  text: string;
}

export interface TopicProgress {
  total: number;
  /** Nunca repasadas. */
  fresh: number;
  /** En aprendizaje o reaprendizaje (intervalos cortos). */
  learning: number;
  /** En repaso con estabilidad menor a 21 días. */
  young: number;
  /** Estabilidad de 21 días o más: dominadas. */
  mature: number;
  /** Pendientes de repasar ahora. */
  due: number;
  /** Repasadas al menos una vez y con probabilidad de recordarlas por debajo del 80 % (se están olvidando). */
  fading: number;
}

export interface Topic {
  id: string;
  title: string;
  subject: string;
  createdAt: string;
  progress: TopicProgress;
}

// ---------- Tarjetas ----------

export const CardKindSchema = z.enum(["flashcard", "question"]);
export type CardKind = z.infer<typeof CardKindSchema>;

export const CardStateSchema = z.enum(["new", "learning", "review", "relearning"]);
export type CardState = z.infer<typeof CardStateSchema>;

export interface Card {
  id: string;
  topicId: string;
  kind: CardKind;
  /** Flashcard: pregunta. Pregunta tipo test: enunciado. */
  front: string;
  /** Flashcard: respuesta. Pregunta tipo test: explicación de la respuesta correcta. */
  back: string;
  /** Solo preguntas tipo test. */
  options: string[] | null;
  answerIndex: number | null;
  suspended: boolean;
  state: CardState;
  due: string;
  reps: number;
  lapses: number;
  source: { position: number; text: string } | null;
}

export const UpdateCardSchema = z
  .object({
    front: z.string().trim().min(1).max(500).optional(),
    back: z.string().trim().min(1).max(1200).optional(),
    options: z.array(z.string().trim().min(1).max(300)).min(2).max(6).optional(),
    answerIndex: z.number().int().min(0).optional(),
    suspended: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No hay cambios" });
export type UpdateCardInput = z.infer<typeof UpdateCardSchema>;

// ---------- Repaso ----------

/** Escala de FSRS/Anki: 1 Otra vez, 2 Difícil, 3 Bien, 4 Fácil. */
export const RatingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type Rating = z.infer<typeof RatingSchema>;
export const RATING_LABELS: Record<Rating, string> = { 1: "Otra vez", 2: "Difícil", 3: "Bien", 4: "Fácil" };

export const ReviewSchema = z.object({ rating: RatingSchema });

export interface QueueCard extends Card {
  /** Cuándo volvería a aparecer con cada valoración, para mostrarlo en los botones. */
  intervals: Record<Rating, string>;
}

export interface ReviewQueue {
  cards: QueueCard[];
  /** Total pendiente (puede ser mayor que las tarjetas devueltas). */
  dueCount: number;
  newCount: number;
}

export interface Dashboard {
  dueNow: number;
  newAvailable: number;
  reviewedToday: number;
  topics: Topic[];
}

// ---------- Generación con IA ----------

export interface GenerationJob {
  id: string;
  topicId: string;
  status: "pending" | "done" | "failed";
  cardsCreated: number;
  errorCode: ErrorCode | null;
  createdAt: string;
}

/** Lo que el modelo debe devolver. `source` = número del fragmento [F n] del que sale cada tarjeta. */
export const GeneratedCardsSchema = z.object({
  flashcards: z
    .array(
      z.object({
        front: z.string().trim().min(3).max(500),
        back: z.string().trim().min(1).max(1200),
        source: z.coerce.number().int().min(1),
      }),
    )
    .max(40),
  questions: z
    .array(
      z
        .object({
          q: z.string().trim().min(3).max(500),
          options: z.array(z.string().trim().min(1).max(300)).min(3).max(5),
          answer: z.coerce.number().int().min(0),
          why: z.string().trim().min(1).max(1200),
          source: z.coerce.number().int().min(1),
        })
        .refine((q) => q.answer < q.options.length, { message: "answer fuera de rango", path: ["answer"] }),
    )
    .max(20),
});
export type GeneratedCards = z.infer<typeof GeneratedCardsSchema>;

// ---------- Reglas puras ----------

/**
 * Divide los apuntes en fragmentos de ~400 a ~900 caracteres respetando párrafos.
 * Cada fragmento se numera y la IA cita el número; así cada tarjeta se puede comprobar.
 */
export function splitIntoChunks(notes: string, target = 700, max = 900): string[] {
  const paragraphs = notes
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n|\n(?=\s*(?:[-•*]|\d+[.)])\s)/)
    // Se conservan los saltos de línea (títulos, listas); solo se normalizan espacios.
    .map((p) => p.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };
  for (const paragraph of paragraphs) {
    // Un párrafo enorme se corta por frases.
    const pieces = paragraph.length > max ? (paragraph.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [paragraph]) : [paragraph];
    for (const raw of pieces) {
      const piece = raw.trim();
      if (!piece) continue;
      if (current && current.length + piece.length + 1 > max) flush();
      current = current ? `${current}\n${piece}` : piece;
      if (current.length >= target) flush();
    }
  }
  flush();
  // Une un último fragmento muy corto al anterior.
  if (chunks.length > 1 && chunks.at(-1)!.length < 150) {
    const last = chunks.pop()!;
    chunks.push(`${chunks.pop()!}\n${last}`);
  }
  return chunks;
}

/** Texto corto para un intervalo: "1 min", "10 min", "2 h", "3 d", "2 mes". */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d`;
  const m = Math.round(d / 30);
  if (m < 12) return `${m} mes`;
  return `${Math.round(d / 365)} año`;
}
