-- Growth & retention: starter packs, invite codes, weekly reviews.

-- Starter packs: one tap creates several trackers from templates (managed in Admin → Starter packs)
CREATE TABLE starter_packs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  emoji           TEXT NOT NULL DEFAULT '✨',
  description     TEXT NOT NULL DEFAULT '',
  template_slugs  TEXT[] NOT NULL DEFAULT '{}',
  sort_order      INT NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invite a friend: every member has a code; a new member may sign up with someone's code
ALTER TABLE members
  ADD COLUMN referral_code TEXT,
  ADD COLUMN referred_by   UUID REFERENCES members(id) ON DELETE SET NULL;
-- Existing members get a code derived from their id (unique, no collisions)
UPDATE members SET referral_code = upper(substr(md5(id::text), 1, 8)) WHERE referral_code IS NULL;
CREATE UNIQUE INDEX members_referral_code_idx ON members (referral_code);
CREATE INDEX members_referred_by_idx ON members (referred_by);

-- Sunday weekly review: the member's answers for a week (Monday = week_start)
CREATE TABLE weekly_reviews (
  user_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  week_start  DATE NOT NULL,
  answers     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);
