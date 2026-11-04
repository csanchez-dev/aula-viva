import type { Plan } from "@aula-viva/shared";

export interface QuotaPolicy {
  perDay: Record<Plan, number>;
}

/** Inicio del día actual en UTC: la cuota se reinicia cada medianoche UTC. */
export function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfNextDayUtc(now: Date): Date {
  const start = startOfDayUtc(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function dailyLimit(policy: QuotaPolicy, plan: Plan): number {
  return policy.perDay[plan];
}
