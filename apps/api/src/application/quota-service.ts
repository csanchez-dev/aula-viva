import type { Plan, Usage } from "@aula-viva/shared";
import { AppError } from "../domain/errors";
import { dailyLimit, type QuotaPolicy, startOfDayUtc, startOfNextDayUtc } from "../domain/quota";
import type { Clock, UsageKind, UsageRepository } from "./ports";

/** Aplica la cuota diaria del plan freemium alrededor de cualquier operación con IA. */
export class QuotaService {
  constructor(
    private readonly usage: UsageRepository,
    private readonly policy: QuotaPolicy,
    private readonly clock: Clock,
  ) {}

  async status(userId: string, plan: Plan): Promise<Usage> {
    const now = this.clock.now();
    return {
      used: await this.usage.countSince(userId, startOfDayUtc(now)),
      limit: dailyLimit(this.policy, plan),
      resetsAt: startOfNextDayUtc(now).toISOString(),
    };
  }

  /** Reserva una unidad de cuota o lanza QUOTA_EXCEEDED. Devuelve el id para poder liberarla. */
  async reserve(userId: string, plan: Plan, kind: UsageKind): Promise<string> {
    const now = this.clock.now();
    const eventId = await this.usage.tryReserve(userId, kind, startOfDayUtc(now), dailyLimit(this.policy, plan));
    if (!eventId) throw new AppError("QUOTA_EXCEEDED");
    return eventId;
  }

  release(eventId: string): Promise<void> {
    return this.usage.release(eventId);
  }

  /**
   * Reserva cuota, ejecuta la operación y, si falla, devuelve la unidad reservada.
   * Así el estudiante no pierde una generación cuando la IA falla.
   */
  async consume<T>(userId: string, plan: Plan, kind: UsageKind, operation: () => Promise<T>): Promise<T> {
    const eventId = await this.reserve(userId, plan, kind);
    try {
      return await operation();
    } catch (error) {
      await this.usage.release(eventId);
      throw error;
    }
  }
}
