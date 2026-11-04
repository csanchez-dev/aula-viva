import type { Theme } from "@aula-viva/shared";
import type { StoredTheme, ThemeRepository } from "../../application/ports";
import type { Db } from "../db/pool";

interface ThemeRow {
  id: string;
  prompt: string;
  tokens: Theme;
  created_at: Date;
}

const toTheme = (r: ThemeRow): StoredTheme => ({
  id: r.id,
  prompt: r.prompt,
  theme: r.tokens,
  createdAt: r.created_at.toISOString(),
});

export class PgThemeRepository implements ThemeRepository {
  constructor(private readonly db: Db) {}

  async create(userId: string, prompt: string, theme: Theme): Promise<StoredTheme> {
    const { rows } = await this.db.query<ThemeRow>(
      `INSERT INTO themes (user_id, prompt, tokens) VALUES ($1, $2, $3) RETURNING id, prompt, tokens, created_at`,
      [userId, prompt, JSON.stringify(theme)],
    );
    return toTheme(rows[0]!);
  }

  async listByUser(userId: string, limit: number): Promise<StoredTheme[]> {
    const { rows } = await this.db.query<ThemeRow>(
      `SELECT id, prompt, tokens, created_at FROM themes WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map(toTheme);
  }

  async findForUser(userId: string, themeId: string): Promise<StoredTheme | null> {
    const { rows } = await this.db.query<ThemeRow>(
      `SELECT id, prompt, tokens, created_at FROM themes WHERE id = $1 AND user_id = $2`,
      [themeId, userId],
    );
    return rows[0] ? toTheme(rows[0]) : null;
  }
}
