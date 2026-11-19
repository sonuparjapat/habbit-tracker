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
  cool_off: 'Traded during cool-off',
  after_weekly_loss: 'Weekly loss limit',
  after_monthly_loss: 'Monthly loss limit',
  tilt: 'Tilt — no pause after losses',
  big_loss: 'Oversized loss on one trade',
  // spending
  over_daily: 'Over daily budget',
  over_monthly: 'Over monthly budget',
  no_spend_day: 'Spent on a no-spend day',
};

import { addDays, weekdayOf } from '../utils/date.js';

/** Human-readable name of a rule, e.g. "max_trades" -> "Overtrading". */
export const ruleLabel = (rule) => RULE_LABELS[rule] ?? rule;

/** Adds a readable `label` to each rule break: [{ rule: 'max_trades' }] -> [{ rule: 'max_trades', label: 'Overtrading' }] */
export const withLabels = (breaks) => breaks.map((b) => ({ ...b, label: ruleLabel(b.rule) }));

export const round2 = (n) => Math.round(n * 100) / 100;

export function money(amount, currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return amount.toFixed(0);
  }
}

/* -------------------------------- Trading -------------------------------- */

const EMPTY_CONTEXT = { weekPnlBefore: 0, monthPnlBefore: 0, coolOffFrom: null, coolOffUntil: null };

/**
 * What earlier days mean for `date`: week and month P&L before that day, and whether a
 * cool-off (triggered by a big losing day) is still running.
 */
export async function loadTradingContext(db, trackerId, date, cfg) {
  const weekStart = addDays(date, -((weekdayOf(date) + 6) % 7)); // Monday
  const monthStart = `${date.slice(0, 7)}-01`;
  const coolStart = addDays(date, -Math.max(1, cfg.coolOffDays));
  const from = [weekStart, monthStart, coolStart].sort()[0];
  const { rows } = await db.query(
    `SELECT trade_date AS date, sum(pnl - fees)::float8 AS net FROM trades
      WHERE tracker_id = $1 AND trade_date >= $2 AND trade_date < $3 GROUP BY trade_date ORDER BY trade_date`,
    [trackerId, from, date],
  );
  const ctx = { ...EMPTY_CONTEXT };
  for (const r of rows) {
    if (r.date >= weekStart) ctx.weekPnlBefore += r.net;
    if (r.date >= monthStart) ctx.monthPnlBefore += r.net;
    // The latest big losing day within the cool-off window locks the days after it
    if (cfg.coolOffLoss > 0 && r.net <= -cfg.coolOffLoss && r.date >= coolStart) {
      const until = addDays(r.date, cfg.coolOffDays);
      if (until >= date) {
        ctx.coolOffFrom = r.date;
        ctx.coolOffUntil = until;
      }
    }
  }
  ctx.weekPnlBefore = round2(ctx.weekPnlBefore);
  ctx.monthPnlBefore = round2(ctx.monthPnlBefore);
  return ctx;
}

const hhmm = (ms, tz) => {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(11, 16);
  }
};

/**
 * State of a trading day.
 *   tradesSoFar: [{ net, count?, at? (ms) }] in the order taken
 *   ctx:         from loadTradingContext()
 *   at:          the moment being judged (now, or when a trade was taken)
 */
export function computeDayStatus(cfg, date, weekday, tradesSoFar, currency, ctx = EMPTY_CONTEXT, at = Date.now(), timeZone = 'UTC') {
  const trades = tradesSoFar.reduce((s, t) => s + (t.count ?? 1), 0);
  const netPnl = round2(tradesSoFar.reduce((s, t) => s + t.net, 0));
  const weekPnl = round2(ctx.weekPnlBefore + netPnl);
  const monthPnl = round2(ctx.monthPnlBefore + netPnl);

  const targetHit = cfg.dailyProfitTarget > 0 && netPnl >= cfg.dailyProfitTarget;
  const lossLimitHit = cfg.dailyMaxLoss > 0 && netPnl <= -cfg.dailyMaxLoss;
  const tradeLimitHit = trades >= cfg.maxTradesPerDay;
  const weeklyLimitHit = cfg.weeklyMaxLoss > 0 && weekPnl <= -cfg.weeklyMaxLoss;
  const monthlyLimitHit = cfg.monthlyMaxLoss > 0 && monthPnl <= -cfg.monthlyMaxLoss;
  const coolOff = Boolean(ctx.coolOffUntil && date > ctx.coolOffFrom && date <= ctx.coolOffUntil);

  // Tilt: N losing trades in a row → forced pause after the last one
  let tiltUntil = null;
  const last = tradesSoFar.slice(-cfg.tiltLosses);
  if (cfg.tiltLosses > 0 && last.length === cfg.tiltLosses && last.every((t) => t.net < 0) && last.at(-1)?.at) {
    const until = last.at(-1).at + cfg.tiltPauseMinutes * 60_000;
    if (until > at) tiltUntil = until;
  }

  const isTradingDay = cfg.tradingDays.includes(weekday);
  const lockReasons = [];
  if (!isTradingDay) lockReasons.push({ rule: 'off_day', message: 'Today is not one of your trading days. Rest is part of the plan.' });
  if (coolOff)
    lockReasons.push({ rule: 'cool_off', message: `Cool-off after a big loss — no trading until ${ctx.coolOffUntil} is over. Protect your capital and your head.` });
  if (monthlyLimitHit)
    lockReasons.push({ rule: 'after_monthly_loss', message: `Monthly loss limit of ${money(cfg.monthlyMaxLoss, currency)} reached. Trading is closed for the month.` });
  else if (weeklyLimitHit)
    lockReasons.push({ rule: 'after_weekly_loss', message: `Weekly loss limit of ${money(cfg.weeklyMaxLoss, currency)} reached. Trading is closed until Monday.` });
  if (cfg.stopAfterTarget && targetHit)
    lockReasons.push({ rule: 'after_target', message: `Target of ${money(cfg.dailyProfitTarget, currency)} reached. Day closed.` });
  if (lossLimitHit)
    lockReasons.push({ rule: 'after_max_loss', message: `Daily loss limit of ${money(cfg.dailyMaxLoss, currency)} reached. No revenge trades.` });
  if (tradeLimitHit)
    lockReasons.push({ rule: 'max_trades', message: `You planned ${cfg.maxTradesPerDay} trade${cfg.maxTradesPerDay > 1 ? 's' : ''} a day — done.` });
  if (tiltUntil)
    lockReasons.push({ rule: 'tilt', message: `${cfg.tiltLosses} losses in a row. Step away until ${hhmm(tiltUntil, timeZone)} — your next trade would be emotional.` });

  let progress = 0;
  if (netPnl >= 0 && cfg.dailyProfitTarget > 0) progress = Math.min(1, netPnl / cfg.dailyProfitTarget);
  if (netPnl < 0 && cfg.dailyMaxLoss > 0) progress = Math.max(-1, netPnl / cfg.dailyMaxLoss);

  return {
    date,
    trades,
    netPnl,
    weekPnl,
    monthPnl,
    maxTrades: cfg.maxTradesPerDay,
    remainingTrades: Math.max(0, cfg.maxTradesPerDay - trades),
    profitTarget: cfg.dailyProfitTarget,
    maxLoss: cfg.dailyMaxLoss,
    weeklyMaxLoss: cfg.weeklyMaxLoss,
    monthlyMaxLoss: cfg.monthlyMaxLoss,
    targetHit,
    lossLimitHit,
    tradeLimitHit,
    weeklyLimitHit,
    monthlyLimitHit,
    coolOff,
    coolOffUntil: coolOff ? ctx.coolOffUntil : null,
    // Today's result starts a cool-off for the next day(s)
    coolOffNext: cfg.coolOffLoss > 0 && netPnl <= -cfg.coolOffLoss ? addDays(date, cfg.coolOffDays) : null,
    tiltUntil: tiltUntil ? new Date(tiltUntil).toISOString() : null,
    isTradingDay,
    locked: lockReasons.length > 0,
    lockReasons,
    progress,
  };
}

/** Which rules does `trade` break, given the state of the day *before* it was taken? */
export function evaluateTrade(cfg, before, trade, currency) {
  const found = [];
  const count = trade.count ?? 1;
  if (!before.isTradingDay) found.push({ rule: 'off_day', description: 'Traded on a day you planned not to trade' });
  if (before.coolOff) found.push({ rule: 'cool_off', description: `Traded during the cool-off after a big losing day (until ${before.coolOffUntil})` });
  if (before.monthlyLimitHit)
    found.push({ rule: 'after_monthly_loss', description: `Traded after the ${money(cfg.monthlyMaxLoss, currency)} monthly loss limit was hit` });
  else if (before.weeklyLimitHit)
    found.push({ rule: 'after_weekly_loss', description: `Traded after the ${money(cfg.weeklyMaxLoss, currency)} weekly loss limit was hit` });
  if (before.tiltUntil) found.push({ rule: 'tilt', description: `Traded without the ${cfg.tiltPauseMinutes}-minute pause after ${cfg.tiltLosses} losses in a row` });
  if (before.trades + count > cfg.maxTradesPerDay)
    found.push({ rule: 'max_trades', description: `${before.trades + count} trades — your limit is ${cfg.maxTradesPerDay}/day` });
  if (cfg.stopAfterTarget && before.targetHit)
    found.push({ rule: 'after_target', description: `Traded after hitting the ${money(cfg.dailyProfitTarget, currency)} target` });
  if (before.lossLimitHit)
    found.push({ rule: 'after_max_loss', description: `Traded after the ${money(cfg.dailyMaxLoss, currency)} loss limit was hit` });
  else if (cfg.dailyMaxLoss > 0 && before.netPnl + trade.net < -cfg.dailyMaxLoss)
    found.push({
      rule: 'max_loss',
      description: `Day closed at ${money(before.netPnl + trade.net, currency)}, beyond the ${money(cfg.dailyMaxLoss, currency)} limit`,
    });
  if (cfg.maxLossPerTrade > 0 && count === 1 && trade.net < -cfg.maxLossPerTrade)
    found.push({ rule: 'big_loss', description: `One trade lost ${money(-trade.net, currency)} — your per-trade limit is ${money(cfg.maxLossPerTrade, currency)}` });
  if (!trade.followedPlan) found.push({ rule: 'no_plan', description: 'Trade taken outside the plan' });
  if (!trade.quick) {
    const skipped = cfg.checklist.filter((item) => !trade.checklistDone.includes(item)).length;
    if (cfg.checklist.length > 0 && skipped > 0)
      found.push({ rule: 'checklist', description: `Skipped ${skipped} of ${cfg.checklist.length} checklist items` });
  }
  return found;
}

/**
 * Recompute rule breaks for one day, then for the following days whose context it affects
 * (weekly/monthly totals, cool-off), so edits and back-filled days keep everything consistent.
 */
export async function reevaluateTradingDay(db, opts, cascade = true) {
  const { trackerId, userId, date, cfg, currency, newReasons, timeZone } = opts;
  const ctx = await loadTradingContext(db, trackerId, date, cfg);
  const { rows: trades } = await db.query(
    `SELECT id, (pnl - fees)::float8 AS net, followed_plan, checklist_done, trade_count, quick, traded_at
       FROM trades WHERE tracker_id = $1 AND trade_date = $2 ORDER BY traded_at, created_at`,
    [trackerId, date],
  );
  const reasons = await clearBreaks(db, trackerId, date, 'trade_id');
  Object.assign(reasons, newReasons ?? {});

  const soFar = [];
  for (const t of trades) {
    const at = new Date(t.traded_at).getTime();
    const before = computeDayStatus(cfg, date, weekdayOf(date), soFar, currency, ctx, at, timeZone);
    const findings = evaluateTrade(
      cfg,
      before,
      { net: t.net, count: t.trade_count, quick: t.quick, followedPlan: t.followed_plan, checklistDone: t.checklist_done ?? [] },
      currency,
    );
    await insertBreaks(db, { trackerId, userId, date, findings, column: 'trade_id', entryId: t.id, reason: reasons[t.id] });
    await db.query('UPDATE trades SET is_rule_break = $2 WHERE id = $1', [t.id, findings.length > 0]);
    soFar.push({ net: t.net, count: t.trade_count, at });
  }

  if (cascade) {
    const { rows: later } = await db.query(
      `SELECT DISTINCT trade_date AS d FROM trades WHERE tracker_id = $1 AND trade_date > $2 AND trade_date <= $3 ORDER BY d`,
      [trackerId, date, addDays(date, 35)],
    );
    for (const { d } of later) await reevaluateTradingDay(db, { ...opts, date: d, newReasons: undefined }, false);
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
