import { COMPONENTS, BASE_HOURS, FLAGS } from './catalog.js';
import { convert } from './money.js';

/** Hours from verified components. Returns {low, high, mid, lines}. */
export function estimateHours(components) {
  let low = BASE_HOURS[0], high = BASE_HOURS[1];
  const lines = [{ type: 'base', label: 'Setup, deploy, handover', count: 1, low: BASE_HOURS[0], high: BASE_HOURS[1] }];
  const seen = new Set();
  for (const c of components) {
    const def = COMPONENTS[c.type];
    if (!def) continue;
    const key = def.perUnit ? `${c.type}:${c.quote}` : c.type;
    if (seen.has(key)) continue;
    seen.add(key);
    const count = def.perUnit ? Math.max(1, Math.min(20, Math.round(c.count || 1))) : 1;
    const l = def.hours[0] * count, h = def.hours[1] * count;
    low += l; high += h;
    lines.push({ type: c.type, label: def.label, count, low: l, high: h, quote: c.quote, outOfStack: !!def.outOfStack });
  }
  return { low, high, mid: (low + high) / 2, lines };
}

/**
 * The decision. Inputs are already verified (quotes checked, money parsed by code).
 * facts = { budget: {min,max,currency,per,hours}|null, components: [...], flags: [...] }
 * lead = { amount, currency }
 */
export function decide(facts, lead, profileIn) {
  // Work in the currency of the lead (the platform's currency); the profile is kept in its own.
  const cur = lead?.currency || profileIn.currency;
  const profile = {
    ...profileIn,
    floorRate: convert(profileIn.floorRate, profileIn.currency, cur),
    minProject: convert(profileIn.minProject, profileIn.currency, cur),
  };
  const est = estimateHours(facts.components);
  const reasons = [];
  const hard = facts.flags.filter((f) => FLAGS[f.type]?.hard);
  const oos = est.lines.filter((l) => l.outOfStack);

  const leadCost = convert(lead?.amount ?? 0, lead?.currency || cur, cur) ?? 0;
  const bidCost = leadCost + profile.proposalHours * profile.floorRate;

  // Value of the job in the profile currency.
  let value = null, valueNote = '';
  let workHours = est.mid;
  const b = facts.budget;
  if (b && b.per === 'month') {
    valueNote = 'monthly';
  } else if (b) {
    if (b.per === 'hour') {
      const rate = b.max ?? b.min;
      const hours = b.hours ?? est.mid;
      workHours = hours;
      value = convert(rate * hours, b.currency, cur);
      valueNote = b.hours ? `${rate}/h x ${b.hours} h stated` : `${rate}/h x ${Math.round(est.mid)} h estimated`;
      if (convert(rate, b.currency, cur) < profile.floorRate) reasons.push({ kind: 'money', text: `Hourly rate is below your floor of ${fmt(profile.floorRate, cur)}/h.` });
    } else {
      const top = b.max ?? b.min;
      value = convert(top, b.currency, cur);
      valueNote = b.max != null ? 'top of the stated budget' : 'stated minimum';
    }
  }
  const workCost = workHours * profile.floorRate;
  const surplus = value == null ? null : value - workCost;
  const breakEven = surplus != null && surplus > 0 ? bidCost / surplus : null;

  let verdict;
  if (hard.length) {
    verdict = 'SKIP';
    for (const f of hard) reasons.push({ kind: 'hard', text: FLAGS[f.type].label, quote: f.quote });
  } else if (oos.length) {
    verdict = 'SKIP';
    for (const l of oos) reasons.push({ kind: 'stack', text: `Outside what you build: ${l.label}`, quote: l.quote });
  } else if (b && b.per !== 'hour' && b.min > 0 && b.max / b.min >= 3) {
    verdict = 'CLOSE';
    reasons.push({ kind: 'money', text: `The budget runs from ${fmt(convert(b.min, b.currency, cur), cur)} to ${fmt(convert(b.max, b.currency, cur), cur)}. The client has not decided, so the lead cannot be priced yet.` });
  } else if (b && b.per === 'month') {
    verdict = 'CLOSE';
    reasons.push({ kind: 'money', text: `This is a monthly retainer (${fmt(convert(b.min ?? b.max, b.currency, cur), cur)}${b.max != null && b.max !== b.min ? ' to ' + fmt(convert(b.max, b.currency, cur), cur) : ''} a month). LeadToll prices one-off projects, so check the hours per month yourself.` });
  } else if (value == null) {
    verdict = 'CLOSE';
    reasons.push({ kind: 'money', text: 'No budget in the post, so the lead cannot be priced. Pay only if the platform lets you ask first or the fee is tiny.' });
  } else if (surplus <= 0) {
    verdict = 'SKIP';
    reasons.push({ kind: 'money', text: Math.round(surplus) === 0
      ? `The budget (${fmt(value, cur)}) only just covers your floor for about ${Math.round(workHours)} hours of work, with nothing left to pay for the bid.`
      : `The budget (${fmt(value, cur)}) is ${fmt(-surplus, cur)} short of your floor for about ${Math.round(workHours)} hours of work.` });
  } else if (value < profile.minProject) {
    verdict = 'SKIP';
    reasons.push({ kind: 'money', text: `Below your minimum project of ${fmt(profile.minProject, cur)}.` });
  } else if (breakEven <= profile.winRate) {
    verdict = 'PAY';
    reasons.push({ kind: 'money', text: `You need to win ${pct(breakEven)} of leads like this to break even. You win about ${pct(profile.winRate)}.` });
  } else if (breakEven <= profile.winRate * 2) {
    verdict = 'CLOSE';
    reasons.push({ kind: 'money', text: `Break-even win rate is ${pct(breakEven)}, above your ${pct(profile.winRate)}.` });
  } else {
    verdict = 'SKIP';
    reasons.push({ kind: 'money', text: `You would need to win ${pct(breakEven)} of leads like this. You win about ${pct(profile.winRate)}.` });
  }
  const fuzzy = facts.flags.find((f) => f.type === 'clone_big_app' || f.type === 'vague_scope');
  const nothingCounted = est.lines.length === 1;
  if (verdict === 'PAY' && (fuzzy || nothingCounted)) {
    verdict = 'CLOSE';
    reasons.unshift({ kind: 'money', text: nothingCounted
      ? 'The budget looks fine, but no piece of work in the post could be counted, so the hours estimate means nothing yet.'
      : 'The numbers work, but the scope cannot be counted from the post, so the hours estimate is weak.' });
  }
  for (const f of facts.flags.filter((f) => !FLAGS[f.type]?.hard)) {
    reasons.push({ kind: 'soft', text: FLAGS[f.type]?.label || f.type, quote: f.quote });
  }
  // Suggested price: what the work costs at 1.25x your floor, raised to the middle of the client's
  // stated range when that is higher, and never above the top of the range.
  const step = cur === 'TWD' ? 1000 : 10;
  let quote = Math.max(profile.minProject, est.mid * profile.floorRate * 1.25);
  if (b && b.per !== 'hour') {
    const lo = convert(b.min ?? b.max, b.currency, cur), hi = convert(b.max ?? b.min, b.currency, cur);
    if (lo != null && hi != null) quote = Math.min(hi, Math.max(quote, (lo + hi) / 2));
  }
  quote = Math.ceil(quote / step) * step;
  return { verdict, reasons, est, workHours, value, valueNote, workCost, surplus, bidCost, leadCost, breakEven, suggestedQuote: quote, currency: cur };
}

export function fmt(v, cur) {
  if (v == null || !isFinite(v)) return 'n/a';
  const r = Math.round(v);
  return (r < 0 ? '-' : '') + (cur === 'TWD' ? 'NT$' : '$') + Math.abs(r).toLocaleString('en-US');
}
export function pct(x) {
  if (x == null || !isFinite(x)) return 'n/a';
  return x < 0.1 ? (x * 100).toFixed(1).replace(/\.0$/, '') + '%' : Math.round(x * 100) + '%';
}
