/** Contratos del programa beta privado: invitaciones, reto diario y actividad. */

export interface BetaDay {
  /** Día en Bogotá, con formato YYYY-MM-DD. */
  date: string;
  reviewed: number;
  done: boolean;
}

export interface BetaStatus {
  /** Día del reto (1 = primero). */
  day: number;
  totalDays: number;
  /** Tarjetas que hay que repasar para cumplir el día. */
  goal: number;
  reviewedToday: number;
  days: BetaDay[];
  /** Días seguidos cumplidos, contando hasta hoy o ayer. */
  streak: number;
}

export interface BetaTesterActivity {
  email: string;
  name: string | null;
  registered: boolean;
  /** Días cumplidos dentro del reto. */
  daysDone: number;
  reviewedToday: number;
  reviewsTotal: number;
  generations: number;
  streak: number;
  /** Último día con algún repaso, en Bogotá. */
  lastActiveDay: string | null;
  days: BetaDay[];
}

export interface BetaActivityReport {
  today: string;
  totalDays: number;
  goal: number;
  testers: BetaTesterActivity[];
}
