-- Evening check-in: a push and/or email in the evening, only to members who opted in
-- and only if they missed a tracker (one that has a reminder set) that day.
ALTER TABLE members
  ADD COLUMN nudge_push    BOOLEAN NOT NULL DEFAULT false, -- wants a phone notification
  ADD COLUMN nudge_email   BOOLEAN NOT NULL DEFAULT false, -- wants an email
  ADD COLUMN push_token    TEXT,                           -- Expo push token of their phone (null = none)
  ADD COLUMN nudge_checked_on DATE;                        -- last day (their local date) we checked them

CREATE INDEX members_nudge_idx ON members (nudge_checked_on) WHERE nudge_push OR nudge_email;
