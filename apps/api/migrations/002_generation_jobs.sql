-- Trabajos de generación con IA. La petición HTTP crea el trabajo y responde al momento;
-- la IA trabaja en segundo plano y el cliente consulta el estado hasta que termina.

CREATE TYPE job_status AS ENUM ('pending', 'done', 'failed');

CREATE TABLE generation_jobs (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind           content_kind NOT NULL,
  topic          text         NOT NULL CHECK (char_length(topic) BETWEEN 2 AND 140),
  level          study_level  NOT NULL,
  status         job_status   NOT NULL DEFAULT 'pending',
  result         jsonb,
  error_code     text,
  -- Unidad de cuota reservada: se devuelve si el trabajo falla.
  usage_event_id bigint       REFERENCES usage_events (id) ON DELETE SET NULL,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  CONSTRAINT result_only_when_done CHECK ((status = 'done') = (result IS NOT NULL)),
  CONSTRAINT error_only_when_failed CHECK ((status = 'failed') = (error_code IS NOT NULL))
);
CREATE INDEX generation_jobs_user_created_idx ON generation_jobs (user_id, created_at DESC);
