import { type Card, type Dashboard, type GenerationJob, formatInterval, type QueueCard, type Rating, type ReviewQueue, type Topic, type UpdateCardInput } from "@aula-viva/shared";
import { AppError } from "../../domain/errors";
import { startOfDayUtc } from "../../domain/quota";
import type { Scheduler } from "../../domain/scheduling";
import type { CardRepository, CardSchedulingRow, Clock, JobRepository, StoredCard, TopicRepository } from "../ports";
import { toTopic } from "./topics";

/** Tarjetas nuevas que se presentan como máximo cada día (para no ahogar al estudiante). */
export const NEW_CARDS_PER_DAY = 20;
const QUEUE_SIZE = 30;

export function toCard(card: StoredCard): Card {
  const { scheduling, ...rest } = card;
  return {
    ...rest,
    state: scheduling.state,
    due: scheduling.due.toISOString(),
    reps: scheduling.reps,
    lapses: scheduling.lapses,
  };
}

const byTopic = (rows: CardSchedulingRow[], topicId: string) => rows.filter((r) => r.topicId === topicId);

/** Pantalla "Hoy": cuánto toca repasar y el progreso de cada tema. */
export class GetDashboard {
  constructor(
    private readonly topics: TopicRepository,
    private readonly cards: CardRepository,
    private readonly scheduler: Scheduler,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<Dashboard> {
    const now = this.clock.now();
    const today = startOfDayUtc(now);
    const [topics, rows, dueNow, freshTotal, reviewedToday, introduced] = await Promise.all([
      this.topics.listByUser(userId),
      this.cards.schedulingForUser(userId),
      this.cards.countDue(userId, now),
      this.cards.countFresh(userId),
      this.cards.reviewsSince(userId, today),
      this.cards.introducedSince(userId, today),
    ]);
    return {
      dueNow,
      newAvailable: Math.min(freshTotal, Math.max(0, NEW_CARDS_PER_DAY - introduced)),
      reviewedToday,
      topics: topics.map((t) => toTopic(t, byTopic(rows, t.id), this.scheduler, now)),
    };
  }
}

/** Un tema con su progreso, todas sus tarjetas (para revisarlas y editarlas) y su última generación. */
export class GetTopic {
  constructor(
    private readonly topics: TopicRepository,
    private readonly cards: CardRepository,
    private readonly jobs: JobRepository,
    private readonly scheduler: Scheduler,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, topicId: string): Promise<{ topic: Topic; cards: Card[]; job: GenerationJob | null }> {
    const topic = await this.topics.findForUser(userId, topicId);
    if (!topic) throw new AppError("NOT_FOUND");
    const [stored, job] = await Promise.all([this.cards.listByTopic(userId, topicId), this.jobs.latestForTopic(userId, topicId)]);
    const rows = stored.map((c) => ({ ...c.scheduling, topicId, suspended: c.suspended }));
    return { topic: toTopic(topic, rows, this.scheduler, this.clock.now()), cards: stored.map(toCard), job };
  }
}

/**
 * Cola de repaso: primero lo que vence (lo que estás a punto de olvidar),
 * después tarjetas nuevas hasta el límite diario.
 */
export class GetReviewQueue {
  constructor(
    private readonly cards: CardRepository,
    private readonly scheduler: Scheduler,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, topicId?: string): Promise<ReviewQueue> {
    const now = this.clock.now();
    const introduced = await this.cards.introducedSince(userId, startOfDayUtc(now));
    const newAllowance = Math.max(0, NEW_CARDS_PER_DAY - introduced);
    const [due, dueCount, freshCount] = await Promise.all([
      this.cards.due(userId, now, QUEUE_SIZE, topicId),
      this.cards.countDue(userId, now, topicId),
      this.cards.countFresh(userId, topicId),
    ]);
    const room = Math.min(newAllowance, QUEUE_SIZE - due.length);
    const fresh = room > 0 ? await this.cards.fresh(userId, room, topicId) : [];
    const cards: QueueCard[] = [...due, ...fresh].map((c) => {
      const preview = this.scheduler.preview(c.scheduling, now);
      const interval = (r: Rating) => formatInterval(preview[r].getTime() - now.getTime());
      return { ...toCard(c), intervals: { 1: interval(1), 2: interval(2), 3: interval(3), 4: interval(4) } };
    });
    return { cards, dueCount, newCount: Math.min(freshCount, newAllowance) };
  }
}

/** Registra un repaso y calcula cuándo vuelve la tarjeta. */
export class ReviewCard {
  constructor(
    private readonly cards: CardRepository,
    private readonly scheduler: Scheduler,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, cardId: string, rating: Rating): Promise<Card> {
    const card = await this.cards.findForUser(userId, cardId);
    if (!card) throw new AppError("NOT_FOUND");
    const now = this.clock.now();
    const next = this.scheduler.apply(card.scheduling, rating, now);
    await this.cards.recordReview(userId, cardId, rating, card.scheduling, next, now);
    return toCard({ ...card, scheduling: next });
  }
}

export class UpdateCard {
  constructor(private readonly cards: CardRepository) {}

  async execute(userId: string, cardId: string, patch: UpdateCardInput): Promise<Card> {
    const current = await this.cards.findForUser(userId, cardId);
    if (!current) throw new AppError("NOT_FOUND");
    if (current.kind === "flashcard" && (patch.options || patch.answerIndex !== undefined)) {
      throw new AppError("VALIDATION_ERROR", "Una flashcard no tiene opciones.");
    }
    const options = patch.options ?? current.options;
    const answer = patch.answerIndex ?? current.answerIndex;
    if (current.kind === "question" && options && answer !== null && answer >= options.length) {
      throw new AppError("VALIDATION_ERROR", "La respuesta correcta debe ser una de las opciones.");
    }
    const updated = await this.cards.update(userId, cardId, patch);
    if (!updated) throw new AppError("NOT_FOUND");
    return toCard(updated);
  }
}

export class DeleteCard {
  constructor(private readonly cards: CardRepository) {}

  async execute(userId: string, cardId: string): Promise<void> {
    if (!(await this.cards.deleteForUser(userId, cardId))) throw new AppError("NOT_FOUND");
  }
}

/** Simulacro: todas las preguntas tipo test de un tema, en orden aleatorio. No afecta a la planificación. */
export class GetQuiz {
  constructor(
    private readonly topics: TopicRepository,
    private readonly cards: CardRepository,
  ) {}

  async execute(userId: string, topicId: string): Promise<Card[]> {
    if (!(await this.topics.findForUser(userId, topicId))) throw new AppError("NOT_FOUND");
    const questions = (await this.cards.listByTopic(userId, topicId)).filter((c) => c.kind === "question" && !c.suspended);
    // Barajado de Fisher-Yates.
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j]!, questions[i]!];
    }
    return questions.map(toCard);
  }
}
