-- MVP anti-olvido: temas con apuntes, fragmentos, tarjetas con repaso espaciado (FSRS) e historial de repasos.
-- Sustituye al prototipo de mazos generados por tema (decks) y a sus trabajos de generación.
-- El prototipo queda en el historial de git (etiqueta v0.1-prototipo).

DROP TABLE IF EXISTS generation_jobs;
DROP TABLE IF EXISTS decks;
DROP TYPE IF EXISTS job_status;
DROP TYPE IF EXISTS content_kind;
DROP TYPE IF EXISTS study_level;

-- Un tema = un bloque de apuntes que el estudiante sube (por ejemplo, "Manejo de la HPB").
CREATE TABLE topics (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      text        NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  subject    text        NOT NULL CHECK (char_length(subject) BETWEEN 2 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX topics_user_created_idx ON topics (user_id, created_at DESC);

-- Los apuntes divididos en fragmentos numerados. Cada tarjeta apunta al fragmento del que sale.
CREATE TABLE source_chunks (
  id       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid    NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 1),
  text     text    NOT NULL,
  UNIQUE (topic_id, position)
);

CREATE TYPE card_kind  AS ENUM ('flashcard', 'question');
CREATE TYPE card_state AS ENUM ('new', 'learning', 'review', 'relearning');

-- Tarjetas. Las columnas de planificación son el estado del algoritmo FSRS para esa tarjeta.
CREATE TABLE cards (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  topic_id       uuid        NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  chunk_id       uuid        REFERENCES source_chunks (id) ON DELETE SET NULL,
  kind           card_kind   NOT NULL,
  front          text        NOT NULL CHECK (char_length(front) BETWEEN 1 AND 500),
  back           text        NOT NULL CHECK (char_length(back) BETWEEN 1 AND 1200),
  options        jsonb,
  answer_index   smallint,
  suspended      boolean     NOT NULL DEFAULT false,
  -- Estado FSRS
  state          card_state  NOT NULL DEFAULT 'new',
  due_at         timestamptz NOT NULL DEFAULT now(),
  stability      double precision NOT NULL DEFAULT 0,
  difficulty     double precision NOT NULL DEFAULT 0,
  reps           integer     NOT NULL DEFAULT 0,
  lapses         integer     NOT NULL DEFAULT 0,
  learning_steps integer     NOT NULL DEFAULT 0,
  scheduled_days integer     NOT NULL DEFAULT 0,
  last_review_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_has_options CHECK (
    (kind = 'question') = (options IS NOT NULL AND answer_index IS NOT NULL)
  )
);
CREATE INDEX cards_topic_idx ON cards (topic_id, created_at);
-- La consulta más frecuente: "qué le toca repasar hoy a este usuario".
CREATE INDEX cards_due_idx ON cards (user_id, due_at) WHERE NOT suspended;

-- Historial de repasos: alimenta "repasadas hoy", el límite de tarjetas nuevas al día y futuras métricas.
CREATE TABLE reviews (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_id        uuid        NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating         smallint    NOT NULL CHECK (rating BETWEEN 1 AND 4),
  state_before   card_state  NOT NULL,
  scheduled_days integer     NOT NULL,
  reviewed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_user_time_idx ON reviews (user_id, reviewed_at);

-- Trabajos de generación de tarjetas (asíncronos: el proxy de Netlify corta a los 26 s).
CREATE TYPE job_status AS ENUM ('pending', 'done', 'failed');
CREATE TABLE generation_jobs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  topic_id       uuid        NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  status         job_status  NOT NULL DEFAULT 'pending',
  cards_created  integer     NOT NULL DEFAULT 0,
  error_code     text,
  usage_event_id bigint      REFERENCES usage_events (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  CONSTRAINT error_only_when_failed CHECK ((status = 'failed') = (error_code IS NOT NULL))
);
CREATE INDEX generation_jobs_topic_idx ON generation_jobs (topic_id, created_at DESC);
