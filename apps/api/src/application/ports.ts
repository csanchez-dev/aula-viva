import type { Card, CardKind, ErrorCode, GenerationJob, Plan, Role, SourceChunk, Theme } from "@aula-viva/shared";
import type { SchedulingState } from "../domain/scheduling";
import type { User } from "../domain/user";

/**
 * Puertos: interfaces que la capa de aplicación necesita del exterior.
 * La infraestructura (PostgreSQL, bcrypt, JWT, Anthropic, FSRS, PDF) las implementa.
 * Los tests usan implementaciones en memoria.
 */

// ---------- Usuarios ----------

export interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
  role?: Role;
}

export interface UserRepository {
  create(user: NewUser): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  setPlan(id: string, plan: Plan): Promise<User | null>;
  setActiveTheme(userId: string, themeId: string | null): Promise<void>;
}

// ---------- Temas y apuntes ----------

export interface StoredTopic {
  id: string;
  title: string;
  subject: string;
  createdAt: Date;
}

export interface TopicRepository {
  /** Crea el tema y sus fragmentos en una sola transacción. */
  create(userId: string, topic: { title: string; subject: string; chunks: string[] }): Promise<StoredTopic>;
  listByUser(userId: string): Promise<StoredTopic[]>;
  findForUser(userId: string, topicId: string): Promise<StoredTopic | null>;
  chunks(topicId: string): Promise<SourceChunk[]>;
  deleteForUser(userId: string, topicId: string): Promise<boolean>;
}

// ---------- Tarjetas y repaso ----------

export interface NewCard {
  kind: CardKind;
  front: string;
  back: string;
  options: string[] | null;
  answerIndex: number | null;
  chunkId: string | null;
}

/** Tarjeta con su estado de memoria (lo que la aplicación usa para planificar). */
export interface StoredCard extends Omit<Card, "state" | "due" | "reps" | "lapses"> {
  scheduling: SchedulingState;
}

export interface CardPatch {
  front?: string;
  back?: string;
  options?: string[];
  answerIndex?: number;
  suspended?: boolean;
}

export interface CardSchedulingRow extends SchedulingState {
  topicId: string;
  suspended: boolean;
}

export interface CardRepository {
  insertMany(userId: string, topicId: string, cards: NewCard[], due: Date): Promise<number>;
  listByTopic(userId: string, topicId: string): Promise<StoredCard[]>;
  findForUser(userId: string, cardId: string): Promise<StoredCard | null>;
  update(userId: string, cardId: string, patch: CardPatch): Promise<StoredCard | null>;
  deleteForUser(userId: string, cardId: string): Promise<boolean>;
  /** Estado de memoria de todas las tarjetas del usuario (para el progreso). */
  schedulingForUser(userId: string): Promise<CardSchedulingRow[]>;
  /** Tarjetas ya estudiadas cuyo repaso vence antes de `now`, de la más atrasada a la más reciente. */
  due(userId: string, now: Date, limit: number, topicId?: string): Promise<StoredCard[]>;
  /** Tarjetas nunca estudiadas, en el orden de los apuntes. */
  fresh(userId: string, limit: number, topicId?: string): Promise<StoredCard[]>;
  countDue(userId: string, now: Date, topicId?: string): Promise<number>;
  countFresh(userId: string, topicId?: string): Promise<number>;
  /** Guarda el nuevo estado y el registro del repaso en una sola transacción. */
  recordReview(userId: string, cardId: string, rating: number, before: SchedulingState, after: SchedulingState, at: Date): Promise<void>;
  reviewsSince(userId: string, since: Date): Promise<number>;
  /** Repasos por día de calendario en Bogotá, desde `since`. */
  reviewsByDay(userId: string, since: Date): Promise<{ day: string; count: number }[]>;
  /** Tarjetas nuevas que el usuario empezó a estudiar desde `since` (para el límite diario). */
  introducedSince(userId: string, since: Date): Promise<number>;
  frontsByTopic(topicId: string): Promise<string[]>;
}

// ---------- Generación ----------

export interface JobRepository {
  create(userId: string, topicId: string, usageEventId: string): Promise<GenerationJob>;
  complete(jobId: string, cardsCreated: number): Promise<void>;
  /** Marca el trabajo como fallido y devuelve el id de la cuota reservada (para liberarla). */
  fail(jobId: string, code: ErrorCode): Promise<string | null>;
  findForUser(userId: string, jobId: string): Promise<GenerationJob | null>;
  latestForTopic(userId: string, topicId: string): Promise<GenerationJob | null>;
}

/** Lo que la aplicación necesita del motor de IA (lo cumple ContentGenerator de @aula-viva/ai). */
export interface AiGenerator {
  generateCards(input: { title: string; subject: string; chunks: { position: number; text: string }[] }): Promise<
    ({ kind: "flashcard"; front: string; back: string; source: number } | {
      kind: "question";
      front: string;
      back: string;
      options: string[];
      answerIndex: number;
      source: number;
    })[]
  >;
  generateTheme(style: string): Promise<Theme>;
}

export interface PdfTextExtractor {
  extract(data: Uint8Array): Promise<{ text: string; pages: number }>;
}

export interface DocxTextExtractor {
  extract(data: Uint8Array): Promise<{ text: string }>;
}

// ---------- Temas visuales (fuera del MVP, la API se conserva) ----------

export interface StoredTheme {
  id: string;
  prompt: string;
  theme: Theme;
  createdAt: string;
}

export interface ThemeRepository {
  create(userId: string, prompt: string, theme: Theme): Promise<StoredTheme>;
  listByUser(userId: string, limit: number): Promise<StoredTheme[]>;
  findForUser(userId: string, themeId: string): Promise<StoredTheme | null>;
}

// ---------- Cuota, seguridad y utilidades ----------

export type UsageKind = "content" | "theme";

export interface UsageRepository {
  countSince(userId: string, since: Date): Promise<number>;
  /**
   * Reserva una unidad de cuota de forma atómica: solo inserta si el usuario
   * está por debajo del límite. Devuelve el id del evento o null si no quedaba cuota.
   */
  tryReserve(userId: string, kind: UsageKind, since: Date, limit: number): Promise<string | null>;
  /** Devuelve una unidad reservada (por ejemplo, si la IA falló). */
  release(eventId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface TokenPayload {
  userId: string;
  role: Role;
}

export interface TokenService {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload | null;
}

export interface Clock {
  now(): Date;
}

/**
 * Ejecuta trabajo en segundo plano sin bloquear la respuesta HTTP.
 * En producción es un simple "lanzar y olvidar"; en los tests se puede esperar a que termine.
 */
export interface BackgroundTasks {
  run(task: () => Promise<void>): void;
}
