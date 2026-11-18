import { weekdayOf } from '../utils/date.js';
import { money, round2, RULE_LABELS } from './rules.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function aggregateDays(trades, breaks) {
  const map = new Map();
  const get = (date) => {
    if (!map.has(date)) map.set(date, { date, pnl: 0, trades: 0, breaks: 0, disciplinedPnl: 0 });
    return map.get(date);
  };
  for (const t of trades) {
    const d = get(t.trade_date);
    d.pnl += t.net;
    d.trades += 1;
    if (!t.is_rule_break) d.disciplinedPnl += t.net;
  }
  for (const b of breaks) get(b.break_date).breaks += 1;
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Streaks over *active* days (days you traded). Days off are neutral — not trading is also discipline. */
export function computeStreaks(trades, breaks) {
  const days = aggregateDays(trades, breaks);
  let bestClean = 0;
  let run = 0;
  for (const d of days) {
    run = d.breaks === 0 ? run + 1 : 0;
    bestClean = Math.max(bestClean, run);
  }
  const tail = (pred) => {
    let n = 0;
    for (let i = days.length - 1; i >= 0 && pred(days[i]); i--) n++;
    return n;
  };
  return {
    currentClean: tail((d) => d.breaks === 0),
    bestClean,
    currentGreen: tail((d) => d.pnl > 0),
    currentRed: tail((d) => d.pnl < 0),
    activeDays: days.length,
  };
}

export const dayScore = (breaks) => Math.max(0, 100 - 34 * breaks);

export function computeTradingStats(cfg, currency, range, trades, breaks) {
  const days = aggregateDays(trades, breaks);
  const nets = trades.map((t) => t.net);
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n < 0);
  const grossProfit = wins.reduce((s, n) => s + n, 0);
  const grossLoss = Math.abs(losses.reduce((s, n) => s + n, 0));
  const netPnl = grossProfit - grossLoss;
  const tradingDays = days.filter((d) => d.trades > 0);
  const best = tradingDays.reduce((b, d) => (!b || d.pnl > b.pnl ? d : b), null);
  const worst = tradingDays.reduce((w, d) => (!w || d.pnl < w.pnl ? d : w), null);

  const breakdown = {};
  for (const b of breaks) breakdown[b.rule] = (breakdown[b.rule] ?? 0) + 1;
  const disciplinedPnl = trades.filter((t) => !t.is_rule_break).reduce((s, t) => s + t.net, 0);
  const undisciplinedPnl = netPnl - disciplinedPnl;
  const score = days.length ? Math.round(days.reduce((s, d) => s + dayScore(d.breaks), 0) / days.length) : null;

  let cum = 0;
  let cumDisc = 0;
  const daily = days.map((d) => {
    cum += d.pnl;
    cumDisc += d.disciplinedPnl;
    return {
      date: d.date,
      pnl: round2(d.pnl),
      trades: d.trades,
      breaks: d.breaks,
      score: dayScore(d.breaks),
      cumulative: round2(cum),
      disciplinedCumulative: round2(cumDisc),
    };
  });

  let peak = 0;
  let maxDrawdown = 0;
  for (const d of daily) {
    peak = Math.max(peak, d.cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - d.cumulative);
  }

  const emo = new Map();
  for (const t of trades) {
    const key = t.emotion_before ?? 'untagged';
    const e = emo.get(key) ?? { trades: 0, pnl: 0, wins: 0, breaks: 0 };
    e.trades++;
    e.pnl += t.net;
    if (t.net > 0) e.wins++;
    if (t.is_rule_break) e.breaks++;
    emo.set(key, e);
  }
  const byEmotion = [...emo.entries()]
    .map(([emotion, e]) => ({ emotion, trades: e.trades, pnl: round2(e.pnl), winRate: round2((e.wins / e.trades) * 100), breaks: e.breaks }))
    .sort((a, b) => a.pnl - b.pnl);

  const byWeekday = WEEKDAYS.map((weekday) => ({ weekday, pnl: 0, trades: 0, breaks: 0 }));
  for (const d of days) {
    const w = byWeekday[weekdayOf(d.date)];
    w.pnl = round2(w.pnl + d.pnl);
    w.trades += d.trades;
    w.breaks += d.breaks;
  }

  // Money made/lost by trades taken AFTER the day should have been over
  const afterLock = { after_target: 0, max_trades: 0, after_max_loss: 0 };
  const rulesByTrade = new Map();
  for (const b of breaks) {
    if (!b.trade_id) continue;
    if (!rulesByTrade.has(b.trade_id)) rulesByTrade.set(b.trade_id, new Set());
    rulesByTrade.get(b.trade_id).add(b.rule);
  }
  for (const t of trades) {
    const rules = rulesByTrade.get(t.id);
    if (rules) for (const k of Object.keys(afterLock)) if (rules.has(k)) afterLock[k] += t.net;
  }

  // Overconfidence: rule-break rate on days that follow a 3+ green-day streak vs. other days
  let green = 0;
  const afterStreak = { days: 0, breakDays: 0 };
  const normal = { days: 0, breakDays: 0 };
  for (const d of days) {
    const bucket = green >= 3 ? afterStreak : normal;
    bucket.days++;
    if (d.breaks > 0) bucket.breakDays++;
    green = d.pnl > 0 ? green + 1 : 0;
  }

  const summary = {
    netPnl: round2(netPnl),
    grossProfit: round2(grossProfit),
    grossLoss: round2(grossLoss),
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round2((wins.length / trades.length) * 100) : 0,
    avgWin: wins.length ? round2(grossProfit / wins.length) : 0,
    avgLoss: losses.length ? round2(grossLoss / losses.length) : 0,
    profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : grossProfit > 0 ? null : 0,
    expectancy: trades.length ? round2(netPnl / trades.length) : 0,
    daysTraded: tradingDays.length,
    greenDays: tradingDays.filter((d) => d.pnl > 0).length,
    redDays: tradingDays.filter((d) => d.pnl < 0).length,
    targetHitDays: days.filter((d) => cfg.dailyProfitTarget > 0 && d.pnl >= cfg.dailyProfitTarget).length,
    avgTradesPerDay: tradingDays.length ? round2(trades.length / tradingDays.length) : 0,
    bestDay: best ? { date: best.date, pnl: round2(best.pnl) } : null,
    worstDay: worst ? { date: worst.date, pnl: round2(worst.pnl) } : null,
    maxDrawdown: round2(maxDrawdown),
  };

  const discipline = {
    score,
    ruleBreaks: breaks.length,
    cleanDays: days.filter((d) => d.breaks === 0).length,
    activeDays: days.length,
    disciplinedPnl: round2(disciplinedPnl),
    undisciplinedPnl: round2(undisciplinedPnl),
    breakdown: Object.entries(breakdown)
      .map(([rule, count]) => ({ rule, label: RULE_LABELS[rule] ?? rule, count }))
      .sort((a, b) => b.count - a.count),
    afterLockPnl: {
      afterTarget: round2(afterLock.after_target),
      overtrading: round2(afterLock.max_trades),
      revenge: round2(afterLock.after_max_loss),
    },
    overconfidence: {
      daysAfterGreenStreak: afterStreak.days,
      breakRateAfterGreenStreak: afterStreak.days ? round2((afterStreak.breakDays / afterStreak.days) * 100) : null,
      breakRateOtherwise: normal.days ? round2((normal.breakDays / normal.days) * 100) : null,
    },
  };

  return { range, summary, discipline, daily, byEmotion, byWeekday, insights: tradingInsights(cfg, currency, summary, discipline, byEmotion, byWeekday) };
}

function tradingInsights(cfg, currency, s, d, byEmotion, byWeekday) {
  const out = [];
  const m = (n) => money(n, currency);
  if (s.trades === 0) {
    out.push({ level: 'info', title: 'No trades yet', message: 'Log your trades and the patterns behind your wins and losses will show up here.' });
    return out;
  }

  if (d.ruleBreaks > 0) {
    out.push(
      d.undisciplinedPnl < 0
        ? { level: 'danger', title: `Breaking rules cost you ${m(Math.abs(d.undisciplinedPnl))}`, message: `Within your rules you made ${m(d.disciplinedPnl)}. The trades that broke a rule took ${m(Math.abs(d.undisciplinedPnl))} back.` }
        : { level: 'warning', title: 'Rule breaks are a time bomb', message: `Rule-breaking trades made ${m(d.undisciplinedPnl)} this time. Luck reinforces bad habits — the next one usually costs more than it ever paid.` },
    );
  } else if (d.activeDays >= 3) {
    out.push({ level: 'success', title: 'Perfect discipline', message: `${d.activeDays} trading days, zero rule breaks. This is what a professional looks like.` });
  }

  if (d.afterLockPnl.afterTarget < 0)
    out.push({ level: 'danger', title: 'Your target was enough', message: `Trades taken after hitting your ${m(cfg.dailyProfitTarget)} target lost ${m(Math.abs(d.afterLockPnl.afterTarget))}. Stopping at the target would have kept it.` });
  if (d.afterLockPnl.overtrading < 0)
    out.push({ level: 'danger', title: 'Overtrading is your leak', message: `Trades beyond your ${cfg.maxTradesPerDay}-trade limit lost ${m(Math.abs(d.afterLockPnl.overtrading))}.` });
  if (d.afterLockPnl.revenge < 0)
    out.push({ level: 'danger', title: 'Revenge trading', message: `Trading after the daily loss limit cost an extra ${m(Math.abs(d.afterLockPnl.revenge))}. The loss limit exists to protect you from yourself.` });

  const oc = d.overconfidence;
  if (oc.daysAfterGreenStreak >= 2 && oc.breakRateAfterGreenStreak !== null && oc.breakRateAfterGreenStreak > (oc.breakRateOtherwise ?? 0) + 10)
    out.push({ level: 'warning', title: 'Winning streaks make you overconfident', message: `After 3+ green days you broke rules on ${oc.breakRateAfterGreenStreak}% of days, versus ${oc.breakRateOtherwise ?? 0}% otherwise. Be most careful when you feel unbeatable.` });

  const worstEmotion = byEmotion.find((e) => e.emotion !== 'untagged' && e.pnl < 0 && e.trades >= 2);
  if (worstEmotion)
    out.push({ level: 'warning', title: `"${worstEmotion.emotion}" trades are costing you`, message: `${worstEmotion.trades} trades taken while feeling ${worstEmotion.emotion} lost ${m(Math.abs(worstEmotion.pnl))} (win rate ${worstEmotion.winRate}%). When you notice it, don't trade.` });
  const bestEmotion = [...byEmotion].reverse().find((e) => e.emotion !== 'untagged' && e.pnl > 0 && e.trades >= 2);
  if (bestEmotion)
    out.push({ level: 'success', title: `You trade best when ${bestEmotion.emotion}`, message: `${bestEmotion.trades} trades made ${m(bestEmotion.pnl)} with a ${bestEmotion.winRate}% win rate.` });

  if (s.losses > 0 && s.wins > 0 && s.avgLoss > s.avgWin * 1.2)
    out.push({ level: 'warning', title: 'Losers are bigger than winners', message: `Average loss ${m(s.avgLoss)} vs average win ${m(s.avgWin)}. Respect the stop-loss you decided before entry.` });

  const traded = byWeekday.filter((w) => w.trades > 0);
  if (traded.length >= 3) {
    const worstDay = [...traded].sort((a, b) => a.pnl - b.pnl)[0];
    if (worstDay.pnl < 0)
      out.push({ level: 'info', title: `${worstDay.weekday} is your weakest day`, message: `Net ${m(worstDay.pnl)} on ${worstDay.weekday}s. Consider sitting out or trading smaller.` });
  }

  if (s.avgTradesPerDay > cfg.maxTradesPerDay)
    out.push({ level: 'warning', title: 'Average trades above your plan', message: `You average ${s.avgTradesPerDay} trades a day against a plan of ${cfg.maxTradesPerDay}.` });
  return out;
}

/** Live nudges for today. */
export function tradingAlerts(cfg, currency, status, streaks, breaksLast7Days) {
  const out = [];
  const m = (n) => money(n, currency);
  if (!status.isTradingDay && status.trades === 0)
    out.push({ level: 'info', title: 'Day off', message: 'Not one of your trading days. Rest is part of the plan — the market will be there tomorrow.' });
  if (status.lossLimitHit) out.push({ level: 'danger', title: 'Loss limit hit — stop now', message: 'Close the terminal. Losing days are part of the game; revenge days end accounts.' });
  else if (status.targetHit && cfg.stopAfterTarget) out.push({ level: 'success', title: 'Target hit — day closed', message: `${m(status.netPnl)} today. Your job is done. Walk away and protect it.` });
  else if (status.tradeLimitHit) out.push({ level: 'info', title: 'Trade limit reached', message: 'The market will be there tomorrow. Nothing more to do today.' });
  else if (cfg.dailyMaxLoss > 0 && status.netPnl <= -0.7 * cfg.dailyMaxLoss)
    out.push({ level: 'danger', title: 'Close to your loss limit', message: `You are at ${m(status.netPnl)}. One more bad trade ends the day.` });

  if (streaks.currentGreen >= 3)
    out.push({ level: 'warning', title: `Overconfidence zone: ${streaks.currentGreen} green days`, message: 'This is exactly when traders increase size and take extra trades. Same plan, same size.' });
  if (streaks.currentRed >= 2) out.push({ level: 'warning', title: `${streaks.currentRed} red days in a row`, message: 'Cut size or take a day off. Do not try to win it all back.' });
  if (breaksLast7Days >= 2) out.push({ level: 'danger', title: `${breaksLast7Days} rule breaks this week`, message: 'Your discipline is slipping. Re-read why you made these rules.' });
  if (streaks.currentClean >= 5) out.push({ level: 'success', title: `${streaks.currentClean} clean trading days`, message: 'No rule broken. Keep the chain alive.' });
  return out;
}
