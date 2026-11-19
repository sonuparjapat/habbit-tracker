-- Quick day log: one row can stand for several trades ("today: 6 trades, -22,000"),
-- and quick entries are not penalised for skipping the pre-trade checklist.
ALTER TABLE trades
  ADD COLUMN trade_count INT NOT NULL DEFAULT 1 CHECK (trade_count BETWEEN 1 AND 500),
  ADD COLUMN quick BOOLEAN NOT NULL DEFAULT false;
