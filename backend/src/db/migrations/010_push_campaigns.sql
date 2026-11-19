-- Notifications sent by admins to members' phones (like shopping apps do), plus a member switch for them.
ALTER TABLE members ADD COLUMN push_news BOOLEAN NOT NULL DEFAULT true; -- "News & tips" notifications (only if the phone allowed notifications)

CREATE TABLE push_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        TEXT,                          -- app screen opened on tap, e.g. '/games'
  audience    JSONB NOT NULL DEFAULT '{}',   -- { kind: 'all' | 'interest' | 'inactive', interest?, days? }
  recipients  INT NOT NULL DEFAULT 0,
  delivered   INT NOT NULL DEFAULT 0,
  failed      INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_campaigns_created_idx ON push_campaigns (created_at DESC);
