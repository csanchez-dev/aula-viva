import type { UsageKind, UsageRepository } from "../../application/ports";
import { type Db, withTransaction } from "../db/pool";

export class PgUsageRepository implements UsageRepository {
  constructor(private readonly db: Db) {}

  async countSince(userId: string, since: Date): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_events WHERE user_id = $1 AND created_at >= $2`,
      [userId, since],
    );
    return rows[0]?.n ?? 0;
  }

  /**
   * Bloquea la fila del usuario (SELECT ... FOR UPDATE) mientras cuenta e inserta.
   * Así dos peticiones simultáneas no pueden saltarse el límite: la segunda espera
   * a que termine la primera y ve su evento ya contado.
   */
  tryReserve(userId: string, kind: UsageKind, since: Date, limit: number): Promise<string | null> {
    return withTransaction(this.db, async (client) => {
      await client.query(`SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      const { rows } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM usage_events WHERE user_id = $1 AND created_at >= $2`,
        [userId, since],
      );
      if ((rows[0]?.n ?? 0) >= limit) return null;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO usage_events (user_id, kind) VALUES ($1, $2) RETURNING id::text`,
        [userId, kind],
      );
      return inserted.rows[0]!.id;
    });
  }

  async release(eventId: string): Promise<void> {
    await this.db.query(`DELETE FROM usage_events WHERE id = $1::bigint`, [eventId]);
  }
}
