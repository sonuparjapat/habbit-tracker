-- Show habit templates first and interleave life areas, so newcomers see an app for everyone
-- (trading is one area among many). Only the built-in templates are reordered.
UPDATE templates t SET sort_order = v.ord, updated_at = now()
  FROM (VALUES
    ('workout', 0),
    ('meditate', 1),
    ('read', 2),
    ('no-smoking', 3),
    ('daily-budget', 4),
    ('water', 5),
    ('journal', 6),
    ('deep-work', 7),
    ('steps', 8),
    ('social-media-limit', 9),
    ('save-daily', 10),
    ('wake-early', 11),
    ('gratitude', 12),
    ('study', 13),
    ('sleep', 14),
    ('fewer-cigarettes', 15),
    ('no-alcohol', 16),
    ('no-impulse-buys', 17),
    ('no-gambling', 18),
    ('one-trade-a-day', 19),
    ('disciplined-intraday', 20),
    ('crypto-no-revenge', 21),
    ('options-scalper', 22)
  ) AS v(slug, ord)
 WHERE t.slug = v.slug;
