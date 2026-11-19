-- The app reports its own crashes to the feedback inbox (kind = 'crash'); guests have no email.
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_kind_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_kind_check CHECK (kind IN ('bug', 'idea', 'question', 'other', 'crash'));
