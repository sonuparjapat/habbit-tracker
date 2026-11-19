-- Security: account locks (owner unlocks by email code), IP blocking, and a security event log.

ALTER TABLE members
  ADD COLUMN failed_logins  INT NOT NULL DEFAULT 0,  -- wrong passwords in a row (reset on success)
  ADD COLUMN locked_at      TIMESTAMPTZ,             -- set = locked; the owner unlocks with an emailed code
  ADD COLUMN lock_reason    TEXT,                    -- 'too_many_attempts' | 'admin'
  ADD COLUMN suspend_reason TEXT;                    -- shown to the member when an admin suspends them

-- One-time codes can now also unlock an account
ALTER TABLE email_codes DROP CONSTRAINT IF EXISTS email_codes_purpose_check;
ALTER TABLE email_codes ADD CONSTRAINT email_codes_purpose_check CHECK (purpose IN ('verify', 'reset', 'unlock'));

-- Blocked IP addresses or ranges ("1.2.3.4", "1.2.3.0/24", "2001:db8::/32")
CREATE TABLE blocked_ips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target      TEXT NOT NULL UNIQUE,
  reason      TEXT,
  auto        BOOLEAN NOT NULL DEFAULT false,  -- blocked automatically for abuse
  expires_at  TIMESTAMPTZ,                     -- NULL = until removed
  created_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What happened, for the admin Security page (failed sign-ins, locks, blocks…)
CREATE TABLE security_events (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,
  ip          TEXT,
  user_id     UUID REFERENCES members(id) ON DELETE SET NULL,
  email       TEXT,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX security_events_created_idx ON security_events (created_at DESC);
CREATE INDEX security_events_ip_idx ON security_events (ip, kind, created_at DESC);
