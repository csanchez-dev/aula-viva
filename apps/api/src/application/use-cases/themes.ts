import { AppError } from "../../domain/errors";
import type { AiGenerator, StoredTheme, ThemeRepository, UserRepository } from "../ports";
import type { QuotaService } from "../quota-service";

/** La IA diseña un tema a partir de una descripción, se guarda y queda activo. */
export class CreateTheme {
  constructor(
    private readonly users: UserRepository,
    private readonly themes: ThemeRepository,
    private readonly ai: AiGenerator,
    private readonly quota: QuotaService,
  ) {}

  async execute(userId: string, prompt: string): Promise<StoredTheme> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError("UNAUTHENTICATED");
    const theme = await this.quota.consume(user.id, user.plan, "theme", () => this.ai.generateTheme(prompt));
    const saved = await this.themes.create(user.id, prompt, theme);
    await this.users.setActiveTheme(user.id, saved.id);
    return saved;
  }
}

export class ListThemes {
  constructor(private readonly themes: ThemeRepository) {}

  execute(userId: string): Promise<StoredTheme[]> {
    return this.themes.listByUser(userId, 20);
  }
}

export class GetActiveTheme {
  constructor(
    private readonly users: UserRepository,
    private readonly themes: ThemeRepository,
  ) {}

  async execute(userId: string): Promise<StoredTheme | null> {
    const user = await this.users.findById(userId);
    if (!user?.activeThemeId) return null;
    return this.themes.findForUser(userId, user.activeThemeId);
  }
}

/** Activa un tema guardado, o vuelve al estilo original con `themeId = null`. */
export class SetActiveTheme {
  constructor(
    private readonly users: UserRepository,
    private readonly themes: ThemeRepository,
  ) {}

  async execute(userId: string, themeId: string | null): Promise<void> {
    if (themeId && !(await this.themes.findForUser(userId, themeId))) throw new AppError("NOT_FOUND");
    await this.users.setActiveTheme(userId, themeId);
  }
}
