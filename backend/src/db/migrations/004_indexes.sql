-- Indexes on foreign keys that were missing. Without them, deleting a trade/expense scans all
-- rule_breaks, and deleting an account (or loading the admin user page) scans whole tables.

CREATE INDEX IF NOT EXISTS trackers_user_all_idx      ON trackers (user_id);           -- existing index only covers non-archived
CREATE INDEX IF NOT EXISTS trades_user_idx            ON trades (user_id);
CREATE INDEX IF NOT EXISTS expenses_user_idx          ON expenses (user_id);
CREATE INDEX IF NOT EXISTS rule_breaks_user_idx       ON rule_breaks (user_id);
CREATE INDEX IF NOT EXISTS rule_breaks_trade_idx      ON rule_breaks (trade_id)   WHERE trade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rule_breaks_expense_idx    ON rule_breaks (expense_id) WHERE expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS daily_entries_tracker_idx  ON daily_entries (tracker_id, completed);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx       ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS email_codes_expires_idx    ON email_codes (expires_at);
