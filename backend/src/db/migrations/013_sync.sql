-- Offline sync: changes made in the app while the server was asleep / unreachable.
-- Every change is stored here FIRST, then applied. If applying fails for a temporary reason,
-- a background job retries it; admins can see, retry or discard anything stuck (Admin → Sync).
CREATE TABLE sync_ops (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  client_op_id      TEXT NOT NULL,                 -- made by the phone; the same change sent twice is stored once
  method            TEXT NOT NULL,
  path              TEXT NOT NULL,
  body              JSONB,
  resource_key      TEXT NOT NULL,                 -- what it changes (e.g. one day of one tracker): newer wins
  client_created_at TIMESTAMPTZ NOT NULL,          -- when the member actually made the change
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'applied', 'failed', 'rejected', 'superseded', 'dead', 'discarded')),
  attempts          INT NOT NULL DEFAULT 0,
  last_error        TEXT,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_op_id)
);
CREATE INDEX sync_ops_retry_idx ON sync_ops (status, next_attempt_at);
CREATE INDEX sync_ops_resource_idx ON sync_ops (user_id, resource_key, client_created_at DESC);
CREATE INDEX sync_ops_created_idx ON sync_ops (created_at DESC);
