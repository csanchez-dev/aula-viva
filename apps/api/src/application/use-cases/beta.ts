import type { BetaActivityReport, BetaStatus, BetaTesterActivity } from "@aula-viva/shared";
import { type BetaProgram, bogotaDay } from "../../domain/beta";
import { AppError } from "../../domain/errors";
import type { CardRepository, Clock, UsageRepository, UserRepository } from "../ports";

/** El reto diario de la persona. Devuelve null si no participa en la beta. */
export class GetBetaStatus {
  constructor(
    private readonly users: UserRepository,
    private readonly cards: CardRepository,
    private readonly program: BetaProgram,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<BetaStatus | null> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError("UNAUTHENTICATED");
    if (!this.program.isTester(user.email) && !this.program.isAdmin(user.email)) return null;
    return this.program.status(await this.cards.reviewsByDay(user.id, this.program.startsAt), this.clock.now());
  }
}

/** Panel para quien dirige la beta: quién se registró y quién repasa cada día. */
export class GetBetaActivity {
  constructor(
    private readonly users: UserRepository,
    private readonly cards: CardRepository,
    private readonly usage: UsageRepository,
    private readonly program: BetaProgram,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<BetaActivityReport> {
    const requester = await this.users.findById(userId);
    if (!requester) throw new AppError("UNAUTHENTICATED");
    if (!this.program.isAdmin(requester.email)) throw new AppError("FORBIDDEN");
    const now = this.clock.now();
    const testers = await Promise.all(this.program.testers.map((email) => this.row(email, now)));
    return { today: bogotaDay(now), totalDays: this.program.dates().length, goal: this.program.goal, testers };
  }

  private async row(email: string, now: Date): Promise<BetaTesterActivity> {
    const user = await this.users.findByEmail(email);
    const counts = user ? await this.cards.reviewsByDay(user.id, this.program.startsAt) : [];
    const status = this.program.status(counts, now);
    return {
      email,
      name: user?.name ?? null,
      registered: !!user,
      daysDone: status.days.filter((d) => d.done).length,
      reviewedToday: status.reviewedToday,
      reviewsTotal: counts.reduce((sum, c) => sum + c.count, 0),
      generations: user ? await this.usage.countSince(user.id, this.program.startsAt) : 0,
      streak: status.streak,
      lastActiveDay: counts.map((c) => c.day).sort().at(-1) ?? null,
      days: status.days,
    };
  }
}
