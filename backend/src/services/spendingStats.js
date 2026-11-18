import { daysInMonth, eachDay, weekdayOf } from '../utils/date.js';
import { money, round2, RULE_LABELS } from './rules.js';

export function computeSpendingStats(cfg, currency, range, today, expenses, breaks) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byDay = new Map();
  for (const e of expenses) byDay.set(e.spent_on, (byDay.get(e.spent_on) ?? 0) + e.amount);

  const to = range.to > today ? today : range.to;
  const daily = [];
  let underDays = 0;
  let overDays = 0;
  let noSpendDaysKept = 0;
  let noSpendDaysTotal = 0;
  if (range.from <= to && range.from >= '2000-01-02') {
    for (const d of eachDay(range.from, to)) {
      const amount = round2(byDay.get(d) ?? 0);
      const over = cfg.dailyLimit > 0 && amount > cfg.dailyLimit;
      daily.push({ date: d, amount, over });
      if (cfg.dailyLimit > 0 && d !== today) over ? overDays++ : underDays++;
      if (cfg.noSpendDays.includes(weekdayOf(d)) && d !== today) {
        noSpendDaysTotal++;
        if (amount === 0) noSpendDaysKept++;
      }
    }
  }

  const cats = new Map();
  for (const e of expenses) {
    const c = cats.get(e.category) ?? { category: e.category, amount: 0, count: 0 };
    c.amount += e.amount;
    c.count++;
    cats.set(e.category, c);
  }
  const byCategory = [...cats.values()]
    .map((c) => ({ ...c, amount: round2(c.amount), share: total ? Math.round((c.amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const daysCount = daily.length || 1;
  const avgPerDay = round2(total / daysCount);
  // Month projection only makes sense for the current month
  const isCurrentMonth = range.from === `${today.slice(0, 7)}-01`;
  const projectedMonth = isCurrentMonth ? round2(avgPerDay * daysInMonth(today)) : null;

  const breakdown = {};
  for (const b of breaks) breakdown[b.rule] = (breakdown[b.rule] ?? 0) + 1;

  const insights = [];
  const m = (n) => money(n, currency);
  if (!expenses.length) insights.push({ level: 'info', title: 'Nothing logged yet', message: 'Log every expense, even small ones. Awareness is the first step to control.' });
  if (projectedMonth && cfg.monthlyLimit > 0 && projectedMonth > cfg.monthlyLimit)
    insights.push({ level: 'danger', title: 'On track to overspend', message: `At ${m(avgPerDay)}/day you'll spend about ${m(projectedMonth)} this month — ${m(projectedMonth - cfg.monthlyLimit)} over your budget.` });
  else if (projectedMonth && cfg.monthlyLimit > 0 && expenses.length)
    insights.push({ level: 'success', title: 'Within budget', message: `At this pace you'll finish the month around ${m(projectedMonth)}, under your ${m(cfg.monthlyLimit)} budget.` });
  if (byCategory[0] && byCategory[0].share >= 40 && expenses.length >= 5)
    insights.push({ level: 'warning', title: `${byCategory[0].category} is ${byCategory[0].share}% of your spending`, message: 'This is the biggest lever. Cutting it a little matters more than cutting everything else.' });
  if (overDays > 0) insights.push({ level: 'warning', title: `Over budget on ${overDays} day${overDays > 1 ? 's' : ''}`, message: `You stayed under your ${m(cfg.dailyLimit)} daily budget on ${underDays} days.` });
  if (noSpendDaysTotal > 0)
    insights.push({ level: noSpendDaysKept === noSpendDaysTotal ? 'success' : 'info', title: `No-spend days: ${noSpendDaysKept}/${noSpendDaysTotal} kept`, message: 'Each no-spend day kept is a vote for the person you want to be.' });

  return {
    range: { from: range.from, to },
    summary: {
      total: round2(total),
      count: expenses.length,
      avgPerDay,
      projectedMonth,
      underDays,
      overDays,
      noSpendDaysKept,
      noSpendDaysTotal,
      biggest: expenses.length ? expenses.reduce((b, e) => (e.amount > b.amount ? e : b)) : null,
    },
    discipline: {
      ruleBreaks: breaks.length,
      breakdown: Object.entries(breakdown).map(([rule, count]) => ({ rule, label: RULE_LABELS[rule] ?? rule, count })),
    },
    daily,
    byCategory,
    insights,
  };
}
