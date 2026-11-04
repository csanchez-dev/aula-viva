import type { CardKind, CardState } from "@aula-viva/shared";
import type { CardPatch, CardRepository, CardSchedulingRow, NewCard, StoredCard } from "../../application/ports";
import type { SchedulingState } from "../../domain/scheduling";
import { type Db, withTransaction } from "../db/pool";

interface CardRow {
  id: string;
  topic_id: string;
  kind: CardKind;
  front: string;
  back: string;
  options: string[] | null;
  answer_index: number | null;
  suspended: boolean;
  state: CardState;
  due_at: Date;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  scheduled_days: number;
  last_review_at: Date | null;
  source_position: number | null;
  source_text: string | null;
}

/** Columnas de la tarjeta + el fragmento de apuntes del que sale. */
const SELECT = `
  SELECT c.id, c.topic_id, c.kind, c.front, c.back, c.options, c.answer_index, c.suspended,
         c.state, c.due_at, c.stability, c.difficulty, c.reps, c.lapses, c.learning_steps,
         c.scheduled_days, c.last_review_at, s.position AS source_position, s.text AS source_text
  FROM cards c LEFT JOIN source_chunks s ON s.id = c.chunk_id`;

const scheduling = (r: CardRow): SchedulingState => ({
  state: r.state,
  due: r.due_at,
  stability: r.stability,
  difficulty: r.difficulty,
  reps: r.reps,
  lapses: r.lapses,
  learningSteps: r.learning_steps,
  scheduledDays: r.scheduled_days,
  lastReview: r.last_review_at,
});

const toCard = (r: CardRow): StoredCard => ({
  id: r.id,
  topicId: r.topic_id,
  kind: r.kind,
  front: r.front,
  back: r.back,
  options: r.options,
  answerIndex: r.answer_index,
  suspended: r.suspended,
  source: r.source_position === null ? null : { position: r.source_position, text: r.source_text ?? "" },
  scheduling: scheduling(r),
});

/** Filtro opcional por tema: añade "AND c.topic_id = $n" solo si hace falta. */
const topicFilter = (topicId: string | undefined, index: number) => (topicId ? ` AND c.topic_id = $${index}` : "");
const withTopic = (params: unknown[], topicId?: string) => (topicId ? [...params, topicId] : params);

export class PgCardRepository implements CardRepository {
  constructor(private readonly db: Db) {}

  async insertMany(userId: string, topicId: string, cards: NewCard[], due: Date): Promise<number> {
    if (cards.length === 0) return 0;
    const result = await this.db.query(
      `INSERT INTO cards (user_id, topic_id, chunk_id, kind, front, back, options, answer_index, due_at)
       SELECT $1, $2, t.chunk_id, t.kind, t.front, t.back, t.options, t.answer_index, $3
       FROM jsonb_to_recordset($4::jsonb)
         AS t(chunk_id uuid, kind card_kind, front text, back text, options jsonb, answer_index smallint)`,
      [
        userId,
        topicId,
        due,
        JSON.stringify(
          cards.map((c) => ({
            chunk_id: c.chunkId,
            kind: c.kind,
            front: c.front,
            back: c.back,
            options: c.options,
            answer_index: c.answerIndex,
          })),
        ),
      ],
    );
    return result.rowCount ?? 0;
  }

  async listByTopic(userId: string, topicId: string): Promise<StoredCard[]> {
    const { rows } = await this.db.query<CardRow>(
      `${SELECT} WHERE c.user_id = $1 AND c.topic_id = $2 ORDER BY s.position NULLS LAST, c.kind, c.created_at`,
      [userId, topicId],
    );
    return rows.map(toCard);
  }

  async findForUser(userId: string, cardId: string): Promise<StoredCard | null> {
    const { rows } = await this.db.query<CardRow>(`${SELECT} WHERE c.id = $1 AND c.user_id = $2`, [cardId, userId]);
    return rows[0] ? toCard(rows[0]) : null;
  }

  async update(userId: string, cardId: string, patch: CardPatch): Promise<StoredCard | null> {
    // COALESCE: solo cambia lo que viene en el parche.
    const result = await this.db.query(
      `UPDATE cards SET
         front = COALESCE($3, front),
         back = COALESCE($4, back),
         options = COALESCE($5::jsonb, options),
         answer_index = COALESCE($6, answer_index),
         suspended = COALESCE($7, suspended)
       WHERE id = $1 AND user_id = $2`,
      [
        cardId,
        userId,
        patch.front ?? null,
        patch.back ?? null,
        patch.options ? JSON.stringify(patch.options) : null,
        patch.answerIndex ?? null,
        patch.suspended ?? null,
      ],
    );
    if (!result.rowCount) return null;
    return this.findForUser(userId, cardId);
  }

  async deleteForUser(userId: string, cardId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM cards WHERE id = $1 AND user_id = $2`, [cardId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async schedulingForUser(userId: string): Promise<CardSchedulingRow[]> {
    const { rows } = await this.db.query<CardRow>(
      `SELECT topic_id, suspended, state, due_at, stability, difficulty, reps, lapses, learning_steps,
              scheduled_days, last_review_at
       FROM cards WHERE user_id = $1`,
      [userId],
    );
    return rows.map((r) => ({ ...scheduling(r), topicId: r.topic_id, suspended: r.suspended }));
  }

  async due(userId: string, now: Date, limit: number, topicId?: string): Promise<StoredCard[]> {
    const { rows } = await this.db.query<CardRow>(
      `${SELECT} WHERE c.user_id = $1 AND NOT c.suspended AND c.state <> 'new' AND c.due_at <= $2${topicFilter(topicId, 4)}
       ORDER BY c.due_at LIMIT $3`,
      withTopic([userId, now, limit], topicId),
    );
    return rows.map(toCard);
  }

  async fresh(userId: string, limit: number, topicId?: string): Promise<StoredCard[]> {
    // Primero los temas más antiguos; dentro de cada tema, en el orden de los apuntes.
    const { rows } = await this.db.query<CardRow>(
      `${SELECT} JOIN topics t ON t.id = c.topic_id
       WHERE c.user_id = $1 AND NOT c.suspended AND c.state = 'new'${topicFilter(topicId, 3)}
       ORDER BY t.created_at, s.position NULLS LAST, c.kind, c.created_at LIMIT $2`,
      withTopic([userId, limit], topicId),
    );
    return rows.map(toCard);
  }

  async countDue(userId: string, now: Date, topicId?: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM cards c
       WHERE c.user_id = $1 AND NOT c.suspended AND c.state <> 'new' AND c.due_at <= $2${topicFilter(topicId, 3)}`,
      withTopic([userId, now], topicId),
    );
    return rows[0]?.n ?? 0;
  }

  async countFresh(userId: string, topicId?: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM cards c WHERE c.user_id = $1 AND NOT c.suspended AND c.state = 'new'${topicFilter(topicId, 2)}`,
      withTopic([userId], topicId),
    );
    return rows[0]?.n ?? 0;
  }

  recordReview(userId: string, cardId: string, rating: number, before: SchedulingState, after: SchedulingState, at: Date) {
    return withTransaction(this.db, async (client) => {
      await client.query(
        `UPDATE cards SET state = $3, due_at = $4, stability = $5, difficulty = $6, reps = $7, lapses = $8,
                learning_steps = $9, scheduled_days = $10, last_review_at = $11
         WHERE id = $1 AND user_id = $2`,
        [cardId, userId, after.state, after.due, after.stability, after.difficulty, after.reps, after.lapses,
          after.learningSteps, after.scheduledDays, after.lastReview],
      );
      await client.query(
        `INSERT INTO reviews (card_id, user_id, rating, state_before, scheduled_days, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [cardId, userId, rating, before.state, after.scheduledDays, at],
      );
    });
  }

  async reviewsSince(userId: string, since: Date): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reviews WHERE user_id = $1 AND reviewed_at >= $2`,
      [userId, since],
    );
    return rows[0]?.n ?? 0;
  }

  async introducedSince(userId: string, since: Date): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reviews WHERE user_id = $1 AND reviewed_at >= $2 AND state_before = 'new'`,
      [userId, since],
    );
    return rows[0]?.n ?? 0;
  }

  async frontsByTopic(topicId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ front: string }>(`SELECT front FROM cards WHERE topic_id = $1`, [topicId]);
    return rows.map((r) => r.front);
  }
}
