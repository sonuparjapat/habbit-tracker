/**
 * Rule engine. Decides when a day is "locked" and which rules a trade / expense breaks.
 * Rule breaks are always *recomputed for the whole day* after any change, so editing or
 * deleting an entry keeps the record consistent.
 */

export const RULE_LABELS = {
  // trading
  max_trades: 'Overtrading',
  after_target: 'Traded after target',
  after_max_loss: 'Revenge trading',
  max_loss: 'Loss limit exceeded',
  no_plan: 'Trade outside plan',
  checklist: 'Skipped checklist',
  off_day: 'Traded on a day off',
  // spending
  over_daily: 'Over daily budget',
  over_monthly: 'Over monthly budget',
  no_spend_day: 'Spent on a no-spend day',
};

export const round2 = (n) => Math.round(n * 100) / 100;

export function money(amount, currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return amount.toFixed(0);
  }
}

/* -------------------------------- Trading -------------------------------- */

export function computeDayStatus(cfg, date, weekday, tradesSoFar, currency) {
  const trades = tradesSoFar.length;
  const netPnl = round2(tradesSoFar.reduce((s, t) => s + t.net, 0));
  const targetHit = cfg.dailyProfitTarget > 0 && netPnl >= cfg.dailyProfitTarget;
  const lossLimitHit = cfg.dailyMaxLoss > 0 && netPnl <= -cfg.dailyMaxLoss;
  const tradeLimitHit = trades >= cfg.maxTradesPerDay;

  const isTradingDay = cfg.tradingDays.includes(weekday);
  const lockReasons = [];
  if (!isTradingDay) lockReasons.push({ rule: 'off_day', message: 'Today is not one of your trading days. Rest is part of the plan.' });
  if (cfg.stopAfterTarget && targetHit)
    lockReasons.push({ rule: 'after_target', message: `Target of ${money(cfg.dailyProfitTarget, currency)} reached. Day closed.` });
  if (lossLimitHit)
    lockReasons.push({ rule: 'after_max_loss', message: `Daily loss limit of ${money(cfg.dailyMaxLoss, currency)} reached. No revenge trades.` });
  if (tradeLimitHit)
    lockReasons.push({ rule: 'max_trades', message: `You planned ${cfg.maxTradesPerDay} trade${cfg.maxTradesPerDay > 1 ? 's' : ''} a day — done.` });

  let progress = 0;
  if (netPnl >= 0 && cfg.dailyProfitTarget > 0) progress = Math.min(1, netPnl / cfg.dailyProfitTarget);
  if (netPnl < 0 && cfg.dailyMaxLoss > 0) progress = Math.max(-1, netPnl / cfg.dailyMaxLoss);

  return {
    date,
    trades,
    netPnl,
    maxTrades: cfg.maxTradesPerDay,
    remainingTrades: Math.max(0, cfg.maxTradesPerDay - trades),
    profitTarget: cfg.dailyProfitTarget,
    maxLoss: cfg.dailyMaxLoss,
    targetHit,
    lossLimitHit,
    tradeLimitHit,
    isTradingDay,
    locked: lockReasons.length > 0,
    lockReasons,
    progress,
  };
}

/** Which rules does `trade` break, given the state of the day *before* it was taken? */
export function evaluateTrade(cfg, before, trade, currency) {
  const found = [];
  if (!before.isTradingDay) found.push({ rule: 'off_day', description: 'Traded on a day you planned not to trade' });
  if (before.tradeLimitHit)
    found.push({ rule: 'max_trades', description: `Trade #${before.trades + 1} — your limit is ${cfg.maxTradesPerDay}/day` });
  if (cfg.stopAfterTarget && before.targetHit)
    found.push({ rule: 'after_target', description: `Traded after hitting the ${money(cfg.dailyProfitTarget, currency)} target` });
  if (before.lossLimitHit)
    found.push({ rule: 'after_max_loss', description: `Traded after the ${money(cfg.dailyMaxLoss, currency)} loss limit was hit` });
  else if (cfg.dailyMaxLoss > 0 && before.netPnl + trade.net < -cfg.dailyMaxLoss)
    found.push({
      rule: 'max_loss',
      description: `Day closed at ${money(before.netPnl + trade.net, currency)}, beyond the ${money(cfg.dailyMaxLoss, currency)} limit`,
    });
  if (!trade.followedPlan) found.push({ rule: 'no_plan', description: 'Trade taken outside the plan' });
  const skipped = cfg.checklist.filter((item) => !trade.checklistDone.includes(item)).length;
  if (cfg.checklist.length > 0 && skipped > 0)
    found.push({ rule: 'checklist', description: `Skipped ${skipped} of ${cfg.checklist.length} checklist items` });
  return found;
}

export async function reevaluateTradingDay(db, { trackerId, userId, date, weekday, cfg, currency, newReasons }) {
  const { rows: trades } = await db.query(
    `SELECT id, (pnl - fees)::float8 AS net, followed_plan, checklist_done
       FROM trades WHERE tracker_id = $1 AND trade_date = $2 ORDER BY traded_at, created_at`,
    [trackerId, date],
  );
  const reasons = await clearBreaks(db, trackerId, date, 'trade_id');
  Object.assign(reasons, newReasons ?? {});

  const soFar = [];
  for (const t of trades) {
    const before = computeDayStatus(cfg, date, weekday, soFar, currency);
    const findings = evaluateTrade(cfg, before, { net: t.net, followedPlan: t.followed_plan, checklistDone: t.checklist_done ?? [] }, currency);
    await insertBreaks(db, { trackerId, userId, date, findings, column: 'trade_id', entryId: t.id, reason: reasons[t.id] });
    await db.query('UPDATE trades SET is_rule_break = $2 WHERE id = $1', [t.id, findings.length > 0]);
    soFar.push({ net: t.net });
  }
}

/* -------------------------------- Spending -------------------------------- */

export function computeSpendStatus(cfg, date, weekday, spentToday, spentMonth, currency) {
  const noSpendDay = cfg.noSpendDays.includes(weekday);
  const overDaily = cfg.dailyLimit > 0 && spentToday > cfg.dailyLimit;
  const overMonthly = cfg.monthlyLimit > 0 && spentMonth > cfg.monthlyLimit;
  const messages = [];
  if (noSpendDay) messages.push('Today is a no-spend day.');
  if (overDaily) messages.push(`Over your daily budget of ${money(cfg.dailyLimit, currency)}.`);
  if (overMonthly) messages.push(`Over your monthly budget of ${money(cfg.monthlyLimit, currency)}.`);
  return {
    date,
    spentToday: round2(spentToday),
    spentMonth: round2(spentMonth),
    dailyLimit: cfg.dailyLimit,
    monthlyLimit: cfg.monthlyLimit,
    leftToday: cfg.dailyLimit > 0 ? round2(cfg.dailyLimit - spentToday) : null,
    leftMonth: cfg.monthlyLimit > 0 ? round2(cfg.monthlyLimit - spentMonth) : null,
    noSpendDay,
    overDaily,
    overMonthly,
    messages,
  };
}

/** Re-evaluate every expense in one month, in order (monthly limit depends on the whole month). */
export async function reevaluateSpendingMonth(db, { trackerId, userId, month, cfg, currency, weekdayOf, newReasons }) {
  const from = `${month}-01`;
  const { rows: expenses } = await db.query(
    `SELECT id, spent_on, amount::float8 AS amount FROM expenses
      WHERE tracker_id = $1 AND to_char(spent_on, 'YYYY-MM') = $2 ORDER BY spent_on, created_at`,
    [trackerId, month],
  );
  const { rows: old } = await db.query(
    `DELETE FROM rule_breaks WHERE tracker_id = $1 AND expense_id IS NOT NULL AND break_date >= $2::date
       AND break_date < ($2::date + interval '1 month') RETURNING expense_id, reason`,
    [trackerId, from],
  );
  const reasons = Object.fromEntries(old.filter((b) => b.reason).map((b) => [b.expense_id, b.reason]));
  Object.assign(reasons, newReasons ?? {});

  let monthTotal = 0;
  const dayTotals = {};
  for (const e of expenses) {
    const dayBefore = dayTotals[e.spent_on] ?? 0;
    const findings = [];
    if (cfg.noSpendDays.includes(weekdayOf(e.spent_on)))
      findings.push({ rule: 'no_spend_day', description: `Spent ${money(e.amount, currency)} on a no-spend day` });
    if (cfg.dailyLimit > 0 && dayBefore + e.amount > cfg.dailyLimit)
      findings.push({ rule: 'over_daily', description: `Day total reached ${money(dayBefore + e.amount, currency)} (limit ${money(cfg.dailyLimit, currency)})` });
    if (cfg.monthlyLimit > 0 && monthTotal + e.amount > cfg.monthlyLimit)
      findings.push({ rule: 'over_monthly', description: `Month total reached ${money(monthTotal + e.amount, currency)} (limit ${money(cfg.monthlyLimit, currency)})` });

    await insertBreaks(db, { trackerId, userId, date: e.spent_on, findings, column: 'expense_id', entryId: e.id, reason: reasons[e.id] });
    await db.query('UPDATE expenses SET is_rule_break = $2 WHERE id = $1', [e.id, findings.length > 0]);
    dayTotals[e.spent_on] = dayBefore + e.amount;
    monthTotal += e.amount;
  }
}

/* -------------------------------- Helpers -------------------------------- */

async function clearBreaks(db, trackerId, date, column) {
  const { rows } = await db.query(
    `DELETE FROM rule_breaks WHERE tracker_id = $1 AND break_date = $2 AND ${column} IS NOT NULL RETURNING ${column} AS id, reason`,
    [trackerId, date],
  );
  return Object.fromEntries(rows.filter((r) => r.reason).map((r) => [r.id, r.reason]));
}

async function insertBreaks(db, { trackerId, userId, date, findings, column, entryId, reason }) {
  for (const f of findings) {
    await db.query(
      `INSERT INTO rule_breaks (tracker_id, user_id, ${column}, break_date, rule, description, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [trackerId, userId, entryId, date, f.rule, f.description, reason ?? null],
    );
  }
}
