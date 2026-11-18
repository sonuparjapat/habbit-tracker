-- Anchor schema v1. Applied automatically on server start (see src/db/migrate.js).
-- gen_random_uuid() is built into Postgres 13+.

-- ============================== Accounts ==============================

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  name              TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  email_verified_at TIMESTAMPTZ,
  timezone          TEXT NOT NULL DEFAULT 'UTC',
  currency          TEXT NOT NULL DEFAULT 'USD',
  -- Bumped to invalidate every issued token (logout everywhere, password reset, suspension)
  token_version     INT NOT NULL DEFAULT 0,
  terms_version     TEXT,
  marketing_opt_in  BOOLEAN NOT NULL DEFAULT false,
  interests         TEXT[] NOT NULL DEFAULT '{}',
  last_active_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_created_idx ON users (created_at);
CREATE INDEX users_last_active_idx ON users (last_active_at);

-- Every consent a user gives or withdraws (terms, privacy, marketing). Append-only audit trail.
CREATE TABLE consents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('terms', 'privacy', 'marketing')),
  version     TEXT,
  granted     BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX consents_user_idx ON consents (user_id);

-- One-time codes for email verification and password reset (stored hashed).
CREATE TABLE email_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  code_hash   TEXT NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_codes_user_purpose_idx ON email_codes (user_id, purpose, created_at DESC);

-- ============================== Tracking ==============================

-- A tracker is one thing a user is working on.
--   habit    : build (do it), quit (avoid it), or limit (stay under N a day)
--   trading  : rule-based trading discipline for any market
--   spending : daily / monthly spending limits
-- Type-specific settings live in config (JSONB, validated by the API).
CREATE TABLE trackers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('habit', 'trading', 'spending')),
  category    TEXT NOT NULL DEFAULT 'other',
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'target',
  color       TEXT NOT NULL DEFAULT '#7C5CFF',
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_slug TEXT,
  archived    BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trackers_user_idx ON trackers (user_id) WHERE NOT archived;

-- One row per tracker per day: habit check-ins and daily journals.
CREATE TABLE daily_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id  UUID NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date  DATE NOT NULL,
  value       NUMERIC NOT NULL DEFAULT 0,
  completed   BOOLEAN NOT NULL DEFAULT false,
  mood        SMALLINT CHECK (mood BETWEEN 1 AND 5),
  note        TEXT,
  reflection  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tracker_id, entry_date)
);
CREATE INDEX daily_entries_user_date_idx ON daily_entries (user_id, entry_date);

CREATE TABLE trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id      UUID NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_date      DATE NOT NULL,
  traded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  instrument      TEXT,
  direction       TEXT CHECK (direction IN ('long', 'short')),
  quantity        NUMERIC,
  entry_price     NUMERIC,
  exit_price      NUMERIC,
  pnl             NUMERIC(16, 2) NOT NULL,           -- gross P&L
  fees            NUMERIC(16, 2) NOT NULL DEFAULT 0, -- brokerage, taxes, commissions
  emotion_before  TEXT,
  emotion_after   TEXT,
  setup           TEXT,
  followed_plan   BOOLEAN NOT NULL DEFAULT true,
  checklist_done  JSONB NOT NULL DEFAULT '[]'::jsonb,
  note            TEXT,
  is_rule_break   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trades_tracker_date_idx ON trades (tracker_id, trade_date);

CREATE TABLE expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id    UUID NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spent_on      DATE NOT NULL,
  amount        NUMERIC(16, 2) NOT NULL CHECK (amount > 0),
  category      TEXT NOT NULL DEFAULT 'Other',
  note          TEXT,
  is_rule_break BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_tracker_date_idx ON expenses (tracker_id, spent_on);

-- Every broken rule, with the justification the user typed at the time.
CREATE TABLE rule_breaks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id  UUID NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id    UUID REFERENCES trades(id) ON DELETE CASCADE,
  expense_id  UUID REFERENCES expenses(id) ON DELETE CASCADE,
  break_date  DATE NOT NULL,
  rule        TEXT NOT NULL,
  description TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rule_breaks_tracker_date_idx ON rule_breaks (tracker_id, break_date);

-- ============================== Admin-managed content ==============================

-- Templates shown in the app's "New tracker" screen. Seeded on first start, editable from the admin panel.
CREATE TABLE templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('habit', 'trading', 'spending')),
  name        TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'target',
  color       TEXT NOT NULL DEFAULT '#7C5CFF',
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order  INT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every admin action, for accountability.
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
