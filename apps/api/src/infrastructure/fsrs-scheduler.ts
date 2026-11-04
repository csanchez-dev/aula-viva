import type { CardState, Rating } from "@aula-viva/shared";
import { type Card as FsrsCard, fsrs, type FSRS, generatorParameters, Rating as FsrsRating, State } from "ts-fsrs";
import type { Scheduler, SchedulingState } from "../domain/scheduling";

/**
 * FSRS (Free Spaced Repetition Scheduler): el algoritmo de repaso espaciado moderno que usa Anki.
 * Modela cada tarjeta con dos variables: estabilidad (cuántos días aguanta el recuerdo) y
 * dificultad. Programa el siguiente repaso para cuando la probabilidad de recordar baja al 90 %.
 */
const TO_FSRS: Record<CardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const FROM_FSRS: Record<State, CardState> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};
const RATINGS: Record<Rating, FsrsRating.Again | FsrsRating.Hard | FsrsRating.Good | FsrsRating.Easy> = {
  1: FsrsRating.Again,
  2: FsrsRating.Hard,
  3: FsrsRating.Good,
  4: FsrsRating.Easy,
};

export class FsrsScheduler implements Scheduler {
  private readonly engine: FSRS;

  /** `fuzz` añade una pequeña variación a los intervalos para que las tarjetas no se agolpen el mismo día. */
  constructor(options: { fuzz?: boolean; retention?: number } = {}) {
    this.engine = fsrs(generatorParameters({ enable_fuzz: options.fuzz ?? true, request_retention: options.retention ?? 0.9 }));
  }

  apply(current: SchedulingState, rating: Rating, now: Date): SchedulingState {
    return this.fromFsrs(this.engine.next(this.toFsrs(current), now, RATINGS[rating]).card);
  }

  preview(current: SchedulingState, now: Date): Record<Rating, Date> {
    const all = this.engine.repeat(this.toFsrs(current), now);
    return {
      1: all[FsrsRating.Again].card.due,
      2: all[FsrsRating.Hard].card.due,
      3: all[FsrsRating.Good].card.due,
      4: all[FsrsRating.Easy].card.due,
    };
  }

  retrievability(current: SchedulingState, now: Date): number {
    if (current.state === "new" || !current.lastReview) return 0;
    return this.engine.get_retrievability(this.toFsrs(current), now, false);
  }

  private toFsrs(s: SchedulingState): FsrsCard {
    return {
      due: s.due,
      stability: s.stability,
      difficulty: s.difficulty,
      elapsed_days: 0,
      scheduled_days: s.scheduledDays,
      reps: s.reps,
      lapses: s.lapses,
      learning_steps: s.learningSteps,
      state: TO_FSRS[s.state],
      last_review: s.lastReview ?? undefined,
    };
  }

  private fromFsrs(c: FsrsCard): SchedulingState {
    return {
      state: FROM_FSRS[c.state],
      due: c.due,
      stability: c.stability,
      difficulty: c.difficulty,
      reps: c.reps,
      lapses: c.lapses,
      learningSteps: c.learning_steps,
      scheduledDays: c.scheduled_days,
      lastReview: c.last_review ?? null,
    };
  }
}
