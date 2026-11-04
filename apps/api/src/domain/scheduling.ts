import type { CardState, Rating, TopicProgress } from "@aula-viva/shared";

/** Estado de memoria de una tarjeta, tal como lo guarda la base de datos. */
export interface SchedulingState {
  state: CardState;
  due: Date;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  scheduledDays: number;
  lastReview: Date | null;
}

export const NEW_SCHEDULING: Omit<SchedulingState, "due"> = {
  state: "new",
  stability: 0,
  difficulty: 0,
  reps: 0,
  lapses: 0,
  learningSteps: 0,
  scheduledDays: 0,
  lastReview: null,
};

/**
 * Algoritmo de repaso espaciado. La aplicación solo conoce esta interfaz;
 * la implementación (FSRS con ts-fsrs) vive en infraestructura.
 */
export interface Scheduler {
  /** Nuevo estado tras valorar la tarjeta. */
  apply(current: SchedulingState, rating: Rating, now: Date): SchedulingState;
  /** Cuándo volvería a tocar con cada valoración (para los botones). */
  preview(current: SchedulingState, now: Date): Record<Rating, Date>;
  /** Probabilidad (0 a 1) de recordar la tarjeta ahora mismo. */
  retrievability(current: SchedulingState, now: Date): number;
}

/** Estabilidad (en días) a partir de la cual una tarjeta se considera dominada. */
export const MATURE_STABILITY_DAYS = 21;
/** Por debajo de esta probabilidad de recuerdo, la tarjeta "se está olvidando". */
export const FADING_THRESHOLD = 0.8;

/** Resume el estado de un conjunto de tarjetas: es la barra de progreso de cada tema. */
export function summarizeProgress(
  cards: (SchedulingState & { suspended: boolean })[],
  scheduler: Scheduler,
  now: Date,
): TopicProgress {
  const progress: TopicProgress = { total: 0, fresh: 0, learning: 0, young: 0, mature: 0, due: 0, fading: 0 };
  for (const card of cards) {
    if (card.suspended) continue;
    progress.total++;
    if (card.state === "new") {
      progress.fresh++;
      continue;
    }
    if (card.state === "learning" || card.state === "relearning") progress.learning++;
    else if (card.stability >= MATURE_STABILITY_DAYS) progress.mature++;
    else progress.young++;
    if (card.due <= now) progress.due++;
    if (scheduler.retrievability(card, now) < FADING_THRESHOLD) progress.fading++;
  }
  return progress;
}
