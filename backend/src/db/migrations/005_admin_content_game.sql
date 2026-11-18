-- Admin-managed configuration, announcements, user feedback, and gamification.

-- Key/value settings edited from the admin panel. Only overridden keys are stored;
-- defaults live in code (src/services/settings.js), so new settings need no migration.
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Banners shown in the app (Today screen) and on the website.
CREATE TABLE announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  level       TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'success', 'warning', 'danger')),
  cta_label   TEXT,
  cta_url     TEXT,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX announcements_live_idx ON announcements (active, starts_at, ends_at);

-- Feedback, bug reports and questions sent from the app.
CREATE TABLE feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES members(id) ON DELETE SET NULL,
  email        TEXT,
  kind         TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('bug', 'idea', 'question', 'other')),
  message      TEXT NOT NULL,
  app_version  TEXT,
  platform     TEXT,
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  admin_note   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX feedback_status_idx ON feedback (status, created_at DESC);
CREATE INDEX feedback_user_idx ON feedback (user_id);

-- Achievements a member has unlocked (definitions live in src/services/gamification.js).
CREATE TABLE member_achievements (
  user_id      UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  achievement  TEXT NOT NULL,
  unlocked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen         BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, achievement)
);
