import type { SourceChunk } from "@aula-viva/shared";
import type { StoredTopic, TopicRepository } from "../../application/ports";
import { type Db, withTransaction } from "../db/pool";

interface TopicRow {
  id: string;
  title: string;
  subject: string;
  created_at: Date;
}

const toTopic = (r: TopicRow): StoredTopic => ({ id: r.id, title: r.title, subject: r.subject, createdAt: r.created_at });

export class PgTopicRepository implements TopicRepository {
  constructor(private readonly db: Db) {}

  create(userId: string, topic: { title: string; subject: string; chunks: string[] }): Promise<StoredTopic> {
    return withTransaction(this.db, async (client) => {
      const { rows } = await client.query<TopicRow>(
        `INSERT INTO topics (user_id, title, subject) VALUES ($1, $2, $3) RETURNING id, title, subject, created_at`,
        [userId, topic.title, topic.subject],
      );
      const created = rows[0]!;
      // Inserción en bloque: un único INSERT con todos los fragmentos.
      await client.query(
        `INSERT INTO source_chunks (topic_id, position, text)
         SELECT $1, t.position, t.text FROM unnest($2::int[], $3::text[]) AS t(position, text)`,
        [created.id, topic.chunks.map((_, i) => i + 1), topic.chunks],
      );
      return toTopic(created);
    });
  }

  async listByUser(userId: string): Promise<StoredTopic[]> {
    const { rows } = await this.db.query<TopicRow>(
      `SELECT id, title, subject, created_at FROM topics WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(toTopic);
  }

  async findForUser(userId: string, topicId: string): Promise<StoredTopic | null> {
    const { rows } = await this.db.query<TopicRow>(
      `SELECT id, title, subject, created_at FROM topics WHERE id = $1 AND user_id = $2`,
      [topicId, userId],
    );
    return rows[0] ? toTopic(rows[0]) : null;
  }

  async chunks(topicId: string): Promise<SourceChunk[]> {
    const { rows } = await this.db.query<SourceChunk>(
      `SELECT id, position, text FROM source_chunks WHERE topic_id = $1 ORDER BY position`,
      [topicId],
    );
    return rows;
  }

  async deleteForUser(userId: string, topicId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM topics WHERE id = $1 AND user_id = $2`, [topicId, userId]);
    return (result.rowCount ?? 0) > 0;
  }
}
