-- Esquema inicial de Aula Viva (PostgreSQL 13+).
-- Normalizado hasta 3FN: cada tabla describe una sola entidad y no hay datos derivados guardados.
-- El contenido generado por la IA se guarda como JSONB validado por la aplicación:
-- su forma cambia por tipo (flashcards, quiz, anatomía) y siempre se lee entero.

CREATE TYPE user_role    AS ENUM ('student', 'admin');
CREATE TYPE user_plan    AS ENUM ('free', 'pro');
CREATE TYPE content_kind AS ENUM ('flashcards', 'quiz', 'anatomy');
CREATE TYPE study_level  AS ENUM ('principiante', 'intermedio', 'avanzado');
CREATE TYPE usage_kind   AS ENUM ('content', 'theme');

CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  email         text        NOT NULL CHECK (email = lower(email)),
  password_hash text        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'student',
  plan          user_plan   NOT NULL DEFAULT 'free',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);

-- Temas visuales generados por IA. Un usuario puede tener muchos y activar uno.
CREATE TABLE themes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  prompt     text        NOT NULL CHECK (char_length(prompt) BETWEEN 3 AND 160),
  tokens     jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX themes_user_created_idx ON themes (user_id, created_at DESC);

-- Tema activo: referencia opcional. Si se borra el tema, el usuario vuelve al estilo original.
ALTER TABLE users
  ADD COLUMN active_theme_id uuid REFERENCES themes (id) ON DELETE SET NULL;

-- Biblioteca: contenidos que el estudiante decidió guardar.
CREATE TABLE decks (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       content_kind NOT NULL,
  topic      text         NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 140),
  level      study_level  NOT NULL,
  content    jsonb        NOT NULL CHECK (content ->> 'kind' = kind::text),
  created_at timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX decks_user_created_idx ON decks (user_id, created_at DESC);

-- Registro de cada generación con IA: alimenta la cuota diaria del plan freemium y las métricas.
CREATE TABLE usage_events (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       usage_kind  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_events_user_created_idx ON usage_events (user_id, created_at);
