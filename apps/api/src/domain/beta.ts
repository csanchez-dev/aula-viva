import { timingSafeEqual } from "node:crypto";
import type { BetaDay, BetaStatus } from "@aula-viva/shared";

/** Bogotá está siempre en UTC-5: Colombia no cambia de hora. */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const bogotaDay = (at: Date): string => new Date(at.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);

/** Instante en que empieza en Bogotá el día de `at`. */
export const bogotaDayStart = (at: Date): Date => new Date(Date.parse(`${bogotaDay(at)}T00:00:00Z`) + BOGOTA_OFFSET_MS);

/** Convierte "correo:código,correo:código" en un mapa. Los correos se comparan siempre en minúsculas. */
export function parseInvites(raw: string | undefined): Map<string, string> {
  const invites = new Map<string, string>();
  for (const entry of (raw ?? "").split(",")) {
    const at = entry.lastIndexOf(":");
    if (at <= 0) continue;
    const email = entry.slice(0, at).trim().toLowerCase();
    const code = entry.slice(at + 1).trim();
    if (email && code) invites.set(email, code);
  }
  return invites;
}

export const parseEmails = (raw: string | undefined): Set<string> =>
  new Set((raw ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));

function sameCode(expected: string, received: string): boolean {
  const a = Buffer.from(expected.toUpperCase());
  const b = Buffer.from(received.trim().toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface BetaOptions {
  invites: Map<string, string>;
  admins: Set<string>;
  /** Primer y último día del reto, con formato YYYY-MM-DD. */
  start: string;
  end: string;
  goal: number;
}

/** Reglas del programa beta. Sin invitaciones configuradas el registro queda abierto (desarrollo local). */
export class BetaProgram {
  constructor(private readonly options: BetaOptions) {}

  get enabled(): boolean {
    return this.options.invites.size > 0;
  }
  get goal(): number {
    return this.options.goal;
  }
  get testers(): string[] {
    return [...this.options.invites.keys()];
  }
  get startsAt(): Date {
    return new Date(Date.parse(`${this.options.start}T00:00:00Z`) + BOGOTA_OFFSET_MS);
  }

  acceptsInvite(email: string, code: string | undefined): boolean {
    const expected = this.options.invites.get(email.toLowerCase());
    return !!expected && !!code && sameCode(expected, code);
  }
  isTester(email: string): boolean {
    return this.options.invites.has(email.toLowerCase());
  }
  isAdmin(email: string): boolean {
    return this.options.admins.has(email.toLowerCase());
  }

  dates(): string[] {
    const out: string[] = [];
    const last = Date.parse(`${this.options.end}T00:00:00Z`);
    for (let t = Date.parse(`${this.options.start}T00:00:00Z`); t <= last; t += DAY_MS) {
      out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
  }

  /** Resume el reto a partir de los repasos por día. */
  status(counts: { day: string; count: number }[], now: Date): BetaStatus {
    const today = bogotaDay(now);
    const byDay = new Map(counts.map((c) => [c.day, c.count]));
    const dates = this.dates();
    const days: BetaDay[] = dates.map((date) => {
      const reviewed = byDay.get(date) ?? 0;
      return { date, reviewed, done: reviewed >= this.goal };
    });
    const index = dates.indexOf(today);
    const current = index >= 0 ? index : today < dates[0]! ? 0 : dates.length - 1;
    // Hoy aún no cumplido no rompe la racha: todavía hay tiempo.
    let cursor = days[current]?.done ? current : current - 1;
    let streak = 0;
    while (cursor >= 0 && days[cursor]?.done) {
      streak += 1;
      cursor -= 1;
    }
    return { day: current + 1, totalDays: days.length, goal: this.goal, reviewedToday: byDay.get(today) ?? 0, days, streak };
  }
}
