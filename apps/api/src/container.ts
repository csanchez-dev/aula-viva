import { AnthropicLlmClient, ContentGenerator, type LlmClient, MockLlmClient } from "@aula-viva/ai";
import type { SignOptions } from "jsonwebtoken";
import type { Clock } from "./application/ports";
import { QuotaService } from "./application/quota-service";
import { ChangeUserPlan } from "./application/use-cases/admin";
import { GetMe, LoginUser, RegisterUser } from "./application/use-cases/auth";
import {
  DeleteCard,
  GetDashboard,
  GetQuiz,
  GetReviewQueue,
  GetTopic,
  ReviewCard,
  UpdateCard,
} from "./application/use-cases/study";
import { CreateTheme, GetActiveTheme, ListThemes, SetActiveTheme } from "./application/use-cases/themes";
import {
  CardGeneration,
  CreateTopic,
  DeleteTopic,
  ExtractDocxText,
  ExtractPdfText,
  GenerateMoreCards,
  GetGenerationJob,
} from "./application/use-cases/topics";
import { InProcessBackgroundTasks } from "./infrastructure/background";
import type { Config } from "./infrastructure/config";
import { createPool, type Db } from "./infrastructure/db/pool";
import { FsrsScheduler } from "./infrastructure/fsrs-scheduler";
import { MammothDocxExtractor } from "./infrastructure/docx-extractor";
import { UnpdfExtractor } from "./infrastructure/pdf-extractor";
import { PgCardRepository } from "./infrastructure/repositories/pg-card-repository";
import { PgJobRepository } from "./infrastructure/repositories/pg-job-repository";
import { PgThemeRepository } from "./infrastructure/repositories/pg-theme-repository";
import { PgTopicRepository } from "./infrastructure/repositories/pg-topic-repository";
import { PgUsageRepository } from "./infrastructure/repositories/pg-usage-repository";
import { PgUserRepository } from "./infrastructure/repositories/pg-user-repository";
import { BcryptHasher } from "./infrastructure/security/bcrypt-hasher";
import { JwtTokenService } from "./infrastructure/security/jwt-token-service";
import type { HttpDeps } from "./interfaces/http/use-cases";

/**
 * Composition root: el único lugar donde se eligen las implementaciones concretas
 * y se conectan entre sí (inyección de dependencias manual, sin framework).
 */
export function buildContainer(config: Config): { deps: HttpDeps; db: Db; background: InProcessBackgroundTasks } {
  const db = createPool(config.DATABASE_URL);
  const clock: Clock = { now: () => new Date() };

  const users = new PgUserRepository(db);
  const topics = new PgTopicRepository(db);
  const cards = new PgCardRepository(db);
  const jobs = new PgJobRepository(db);
  const themes = new PgThemeRepository(db);
  const usage = new PgUsageRepository(db);
  const background = new InProcessBackgroundTasks();
  const scheduler = new FsrsScheduler();
  const hasher = new BcryptHasher();
  const tokens = new JwtTokenService(config.JWT_SECRET, config.JWT_EXPIRES_IN as SignOptions["expiresIn"]);

  const llm: LlmClient =
    config.AI_PROVIDER === "anthropic"
      ? new AnthropicLlmClient({
          apiKey: config.ANTHROPIC_API_KEY!,
          models: { smart: config.AI_MODEL_SMART, fast: config.AI_MODEL_FAST },
        })
      : new MockLlmClient();
  const ai = new ContentGenerator(llm);

  const quota = new QuotaService(
    usage,
    { perDay: { free: config.QUOTA_FREE_PER_DAY, pro: config.QUOTA_PRO_PER_DAY } },
    clock,
  );
  const generation = new CardGeneration(topics, cards, jobs, ai, quota, background, clock);

  const deps: HttpDeps = {
    tokens,
    webOrigin: config.WEB_ORIGIN,
    trustProxy: config.TRUST_PROXY,
    secureCookies: config.NODE_ENV === "production",
    useCases: {
      register: new RegisterUser(users, hasher, tokens),
      login: new LoginUser(users, hasher, tokens),
      getMe: new GetMe(users, quota),
      extractPdf: new ExtractPdfText(new UnpdfExtractor()),
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
  return { deps, db, background };
}
