import { randomUUID } from "node:crypto";
import { ContentGenerator, type LlmClient, MockLlmClient } from "@aula-viva/ai";
import type { ErrorCode, GenerationJob, Plan, SourceChunk, Theme } from "@aula-viva/shared";
import type {
  BackgroundTasks,
  CardPatch,
  CardRepository,
  CardSchedulingRow,
  Clock,
  JobRepository,
  NewCard,
  NewUser,
  PasswordHasher,
  PdfTextExtractor,
  StoredCard,
  StoredTheme,
  StoredTopic,
  ThemeRepository,
  TopicRepository,
  UsageKind,
  UsageRepository,
  UserRepository,
} from "../src/application/ports";
import { QuotaService } from "../src/application/quota-service";
import { ChangeUserPlan } from "../src/application/use-cases/admin";
import { GetMe, LoginUser, RegisterUser } from "../src/application/use-cases/auth";
import { DeleteCard, GetDashboard, GetQuiz, GetReviewQueue, GetTopic, ReviewCard, UpdateCard } from "../src/application/use-cases/study";
import { CreateTheme, GetActiveTheme, ListThemes, SetActiveTheme } from "../src/application/use-cases/themes";
import {
  CardGeneration,
  CreateTopic,
  DeleteTopic,
  ExtractDocxText,
  ExtractPdfText,
  GenerateMoreCards,
  GetGenerationJob,
} from "../src/application/use-cases/topics";
import { NEW_SCHEDULING, type SchedulingState } from "../src/domain/scheduling";
import type { User } from "../src/domain/user";
import { MammothDocxExtractor } from "../src/infrastructure/docx-extractor";
import { FsrsScheduler } from "../src/infrastructure/fsrs-scheduler";
import { JwtTokenService } from "../src/infrastructure/security/jwt-token-service";
import type { HttpDeps } from "../src/interfaces/http/use-cases";

/** Reloj que el test puede adelantar para simular el paso de los días. */
export class FakeClock implements Clock {
  constructor(public current = new Date("2026-11-02T09:00:00Z")) {}
  now() {
    return new Date(this.current);
  }
  advanceDays(days: number) {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }
}

export class MemoryUsers implements UserRepository {
  readonly rows = new Map<string, User>();
  async create(u: NewUser) {
    const user: User = { id: randomUUID(), name: u.name, email: u.email, passwordHash: u.passwordHash, role: u.role ?? "student", plan: "free", activeThemeId: null, createdAt: new Date() };
    this.rows.set(user.id, user);
    return user;
  }
  async findByEmail(email: string) {
    return [...this.rows.values()].find((u) => u.email === email) ?? null;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async setPlan(id: string, plan: Plan) {
    const u = this.rows.get(id);
    if (!u) return null;
    u.plan = plan;
    return u;
  }
  async setActiveTheme(userId: string, themeId: string | null) {
    const u = this.rows.get(userId);
    if (u) u.activeThemeId = themeId;
  }
}

export class MemoryTopics implements TopicRepository {
  readonly topics: (StoredTopic & { userId: string })[] = [];
  readonly chunkRows: (SourceChunk & { topicId: string })[] = [];
  constructor(private readonly clock: Clock) {}
  async create(userId: string, t: { title: string; subject: string; chunks: string[] }) {
    const topic = { id: randomUUID(), userId, title: t.title, subject: t.subject, createdAt: this.clock.now() };
    this.topics.push(topic);
    t.chunks.forEach((text, i) => this.chunkRows.push({ id: randomUUID(), topicId: topic.id, position: i + 1, text }));
    return topic;
  }
  async listByUser(userId: string) {
    return this.topics.filter((t) => t.userId === userId);
  }
  async findForUser(userId: string, id: string) {
    return this.topics.find((t) => t.id === id && t.userId === userId) ?? null;
  }
  async chunks(topicId: string) {
    return this.chunkRows.filter((c) => c.topicId === topicId).map(({ topicId: _, ...c }) => c);
  }
  async deleteForUser(userId: string, id: string) {
    const i = this.topics.findIndex((t) => t.id === id && t.userId === userId);
    if (i < 0) return false;
    this.topics.splice(i, 1);
    return true;
  }
}

type CardRow = StoredCard & { userId: string; chunkId: string | null; createdAt: number };

export class MemoryCards implements CardRepository {
  readonly rows: CardRow[] = [];
  readonly reviews: { userId: string; cardId: string; rating: number; stateBefore: string; at: Date }[] = [];
  constructor(private readonly topics: MemoryTopics) {}

  private live(userId: string, topicId?: string) {
    const topicIds = new Set(this.topics.topics.map((t) => t.id));
    return this.rows.filter((c) => c.userId === userId && topicIds.has(c.topicId) && (!topicId || c.topicId === topicId));
  }
  private strip(c: CardRow): StoredCard {
    const { userId: _u, chunkId, createdAt: _c, ...card } = c;
    const chunk = this.topics.chunkRows.find((r) => r.id === chunkId);
    return { ...card, source: chunk ? { position: chunk.position, text: chunk.text } : null };
  }
  async insertMany(userId: string, topicId: string, cards: NewCard[], due: Date) {
    for (const c of cards) {
      this.rows.push({
        id: randomUUID(), userId, topicId, chunkId: c.chunkId, createdAt: this.rows.length, kind: c.kind, front: c.front, back: c.back,
        options: c.options, answerIndex: c.answerIndex, suspended: false, source: null,
        scheduling: { ...NEW_SCHEDULING, due },
      });
    }
    return cards.length;
  }
  async listByTopic(userId: string, topicId: string) {
    return this.live(userId, topicId).map((c) => this.strip(c));
  }
  async findForUser(userId: string, id: string) {
    const c = this.live(userId).find((r) => r.id === id);
    return c ? this.strip(c) : null;
  }
  async update(userId: string, id: string, patch: CardPatch) {
    const c = this.live(userId).find((r) => r.id === id);
    if (!c) return null;
    Object.assign(c, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    return this.strip(c);
  }
  async deleteForUser(userId: string, id: string) {
    const i = this.rows.findIndex((r) => r.id === id && r.userId === userId);
    if (i < 0) return false;
    this.rows.splice(i, 1);
    return true;
  }
  async schedulingForUser(userId: string): Promise<CardSchedulingRow[]> {
    return this.live(userId).map((c) => ({ ...c.scheduling, topicId: c.topicId, suspended: c.suspended }));
  }
  async due(userId: string, now: Date, limit: number, topicId?: string) {
    return this.live(userId, topicId)
      .filter((c) => !c.suspended && c.scheduling.state !== "new" && c.scheduling.due <= now)
      .sort((a, b) => a.scheduling.due.getTime() - b.scheduling.due.getTime())
      .slice(0, limit)
      .map((c) => this.strip(c));
  }
  async fresh(userId: string, limit: number, topicId?: string) {
    return this.live(userId, topicId)
      .filter((c) => !c.suspended && c.scheduling.state === "new")
      .slice(0, limit)
      .map((c) => this.strip(c));
  }
  async countDue(userId: string, now: Date, topicId?: string) {
    return (await this.due(userId, now, 1e9, topicId)).length;
  }
  async countFresh(userId: string, topicId?: string) {
    return (await this.fresh(userId, 1e9, topicId)).length;
  }
  async recordReview(userId: string, cardId: string, rating: number, before: SchedulingState, after: SchedulingState, at: Date) {
    const c = this.rows.find((r) => r.id === cardId && r.userId === userId);
    if (c) c.scheduling = after;
    this.reviews.push({ userId, cardId, rating, stateBefore: before.state, at });
  }
  async reviewsSince(userId: string, since: Date) {
    return this.reviews.filter((r) => r.userId === userId && r.at >= since).length;
  }
  async introducedSince(userId: string, since: Date) {
    return this.reviews.filter((r) => r.userId === userId && r.at >= since && r.stateBefore === "new").length;
  }
  async frontsByTopic(topicId: string) {
    return this.rows.filter((r) => r.topicId === topicId).map((r) => r.front);
  }
}

export class MemoryJobs implements JobRepository {
  readonly rows = new Map<string, GenerationJob & { userId: string; usageEventId: string | null }>();
  constructor(private readonly clock: Clock) {}
  private strip({ userId: _u, usageEventId: _e, ...job }: GenerationJob & { userId: string; usageEventId: string | null }): GenerationJob {
    return { ...job };
  }
  async create(userId: string, topicId: string, usageEventId: string) {
    const job = { id: randomUUID(), userId, topicId, usageEventId, status: "pending" as const, cardsCreated: 0, errorCode: null, createdAt: this.clock.now().toISOString() };
    this.rows.set(job.id, job);
    return this.strip(job);
  }
  async complete(id: string, cardsCreated: number) {
    const j = this.rows.get(id);
    if (j?.status === "pending") Object.assign(j, { status: "done", cardsCreated });
  }
  async fail(id: string, code: ErrorCode) {
    const j = this.rows.get(id);
    if (j?.status !== "pending") return null;
    Object.assign(j, { status: "failed", errorCode: code });
    return j.usageEventId;
  }
  async findForUser(userId: string, id: string) {
    const j = this.rows.get(id);
    return j && j.userId === userId ? this.strip(j) : null;
  }
  async latestForTopic(userId: string, topicId: string) {
    const all = [...this.rows.values()].filter((j) => j.userId === userId && j.topicId === topicId);
    return all.length ? this.strip(all.at(-1)!) : null;
  }
}

export class MemoryThemes implements ThemeRepository {
  readonly rows: (StoredTheme & { userId: string })[] = [];
  async create(userId: string, prompt: string, theme: Theme) {
    const t = { id: randomUUID(), userId, prompt, theme, createdAt: new Date().toISOString() };
    this.rows.unshift(t);
    const { userId: _, ...stored } = t;
    return stored;
  }
  async listByUser(userId: string) {
    return this.rows.filter((r) => r.userId === userId).map(({ userId: _, ...t }) => t);
  }
  async findForUser(userId: string, id: string) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId);
    if (!r) return null;
    const { userId: _, ...stored } = r;
    return stored;
  }
}

export class MemoryUsage implements UsageRepository {
  readonly events: { id: string; userId: string; kind: UsageKind; at: Date }[] = [];
  constructor(private readonly clock: Clock) {}
  async countSince(userId: string, since: Date) {
    return this.events.filter((e) => e.userId === userId && e.at >= since).length;
  }
  async tryReserve(userId: string, kind: UsageKind, since: Date, limit: number) {
    if ((await this.countSince(userId, since)) >= limit) return null;
    const id = randomUUID();
    this.events.push({ id, userId, kind, at: this.clock.now() });
    return id;
  }
  async release(id: string) {
    const i = this.events.findIndex((e) => e.id === id);
    if (i >= 0) this.events.splice(i, 1);
  }
}

/** Tareas en segundo plano bajo control del test: no se ejecutan hasta llamar a `flush()`. */
export class AwaitableBackground implements BackgroundTasks {
  private readonly queued: (() => Promise<void>)[] = [];
  run(task: () => Promise<void>) {
    this.queued.push(task);
  }
  async flush() {
    await Promise.all(this.queued.splice(0).map((task) => task()));
  }
}

export const fakeHasher: PasswordHasher = {
  hash: async (p) => `hashed:${p}`,
  verify: async (p, h) => h === `hashed:${p}`,
};

/** Extractor de PDF falso: devuelve el texto que haya después de la cabecera %PDF-. */
export const fakePdf: PdfTextExtractor = {
  extract: async (data) => ({ text: Buffer.from(data).toString("utf8").replace(/^%PDF-\S*\s*/, ""), pages: 1 }),
};

export function buildTestDeps(options: { freePerDay?: number; llm?: LlmClient } = {}) {
  const clock = new FakeClock();
  const users = new MemoryUsers();
  const topics = new MemoryTopics(clock);
  const cards = new MemoryCards(topics);
  const jobs = new MemoryJobs(clock);
  const themes = new MemoryThemes();
  const usage = new MemoryUsage(clock);
  const background = new AwaitableBackground();
  const scheduler = new FsrsScheduler({ fuzz: false });
  const tokens = new JwtTokenService("test-secret-test-secret-test-secret-123", "1h");
  const ai = new ContentGenerator(options.llm ?? new MockLlmClient(0));
  const quota = new QuotaService(usage, { perDay: { free: options.freePerDay ?? 5, pro: 100 } }, clock);
  const generation = new CardGeneration(topics, cards, jobs, ai, quota, background, clock);

  const deps: HttpDeps = {
    tokens,
    webOrigin: "http://localhost:5173",
    trustProxy: 0,
    secureCookies: false,
    useCases: {
      register: new RegisterUser(users, fakeHasher, tokens),
      login: new LoginUser(users, fakeHasher, tokens),
      getMe: new GetMe(users, quota),
      extractPdf: new ExtractPdfText(fakePdf),
      extractDocx: new ExtractDocxText(new MammothDocxExtractor()),
      createTopic: new CreateTopic(users, topics, generation),
      getTopic: new GetTopic(topics, cards, jobs, scheduler, clock),
      deleteTopic: new DeleteTopic(topics),
      generateMore: new GenerateMoreCards(users, topics, generation),
      getJob: new GetGenerationJob(jobs, quota, clock),
      dashboard: new GetDashboard(topics, cards, scheduler, clock),
      reviewQueue: new GetReviewQueue(cards, scheduler, clock),
      reviewCard: new ReviewCard(cards, scheduler, clock),
      updateCard: new UpdateCard(cards),
      deleteCard: new DeleteCard(cards),
      quiz: new GetQuiz(topics, cards),
      createTheme: new CreateTheme(users, themes, ai, quota),
      listThemes: new ListThemes(themes),
      getActiveTheme: new GetActiveTheme(users, themes),
      setActiveTheme: new SetActiveTheme(users, themes),
      changeUserPlan: new ChangeUserPlan(users),
    },
  };
  return { deps, clock, users, topics, cards, jobs, usage, background };
}
