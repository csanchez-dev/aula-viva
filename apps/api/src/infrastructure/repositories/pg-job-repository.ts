import type { ErrorCode, GenerationJob } from "@aula-viva/shared";
import type { JobRepository } from "../../application/ports";
import type { Db } from "../db/pool";

interface JobRow {
  id: string;
  topic_id: string;
  status: GenerationJob["status"];
  cards_created: number;
  error_code: ErrorCode | null;
  created_at: Date;
}

const COLUMNS = "id, topic_id, status, cards_created, error_code, created_at";

const toJob = (r: JobRow): GenerationJob => ({
  id: r.id,
  topicId: r.topic_id,
  status: r.status,
  cardsCreated: r.cards_created,
  errorCode: r.error_code,
  createdAt: r.created_at.toISOString(),
});

export class PgJobRepository implements JobRepository {
  constructor(private readonly db: Db) {}

  async create(userId: string, topicId: string, usageEventId: string): Promise<GenerationJob> {
    const { rows } = await this.db.query<JobRow>(
      `INSERT INTO generation_jobs (user_id, topic_id, usage_event_id) VALUES ($1, $2, $3::bigint) RETURNING ${COLUMNS}`,
      [userId, topicId, usageEventId],
    );
    return toJob(rows[0]!);
  }

  // Las dos transiciones solo actúan sobre trabajos "pending": un trabajo terminado no cambia nunca.
  async complete(jobId: string, cardsCreated: number): Promise<void> {
    await this.db.query(
      `UPDATE generation_jobs SET status = 'done', cards_created = $2, finished_at = now() WHERE id = $1 AND status = 'pending'`,
      [jobId, cardsCreated],
    );
  }

  async fail(jobId: string, code: ErrorCode): Promise<string | null> {
    const { rows } = await this.db.query<{ usage_event_id: string | null }>(
      `UPDATE generation_jobs SET status = 'failed', error_code = $2, finished_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING usage_event_id::text`,
      [jobId, code],
    );
    return rows[0]?.usage_event_id ?? null;
  }

  async findForUser(userId: string, jobId: string): Promise<GenerationJob | null> {
    const { rows } = await this.db.query<JobRow>(`SELECT ${COLUMNS} FROM generation_jobs WHERE id = $1 AND user_id = $2`, [
      jobId,
      userId,
    ]);
    return rows[0] ? toJob(rows[0]) : null;
  }

  async latestForTopic(userId: string, topicId: string): Promise<GenerationJob | null> {
    const { rows } = await this.db.query<JobRow>(
      `SELECT ${COLUMNS} FROM generation_jobs WHERE topic_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [topicId, userId],
    );
    return rows[0] ? toJob(rows[0]) : null;
  }
}
