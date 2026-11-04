import type { Plan, Role } from "@aula-viva/shared";
import type { NewUser, UserRepository } from "../../application/ports";
import type { User } from "../../domain/user";
import type { Db } from "../db/pool";

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  plan: Plan;
  active_theme_id: string | null;
  created_at: Date;
}

const COLUMNS = "id, name, email, password_hash, role, plan, active_theme_id, created_at";

const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  passwordHash: r.password_hash,
  role: r.role,
  plan: r.plan,
  activeThemeId: r.active_theme_id,
  createdAt: r.created_at,
});

export class PgUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async create(user: NewUser): Promise<User> {
    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
      [user.name, user.email, user.passwordHash, user.role ?? "student"],
    );
    return toUser(rows[0]!);
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email.toLowerCase()]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async setPlan(id: string, plan: Plan): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(`UPDATE users SET plan = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, plan]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async setActiveTheme(userId: string, themeId: string | null): Promise<void> {
    // El WHERE con user_id impide activar un tema de otra persona.
    await this.db.query(
      `UPDATE users SET active_theme_id = $2
       WHERE id = $1 AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM themes WHERE id = $2 AND user_id = $1))`,
      [userId, themeId],
    );
  }
}
