import { fmt } from './decide.js';
import { sentences } from './pipeline.js';
import { toTWPhrases, isTraditional } from './zh.js';

/** Days of calendar time for the estimate, assuming 5 focused hours a day plus 2 days of slack. */
export function daysFor(est) {
  return Math.ceil(est.mid / 5) + 2;
}

/**
 * Fill the model's draft with numbers from code, then drop any sentence that carries a number
 * the model made up (a number that is in neither the post nor our filled values).
 */
export function finishDraft(text, post, decision) {
  if (!text) return { text: '', removed: [] };
  const price = fmt(decision.suggestedQuote, decision.currency);
  const days = String(daysFor(decision.est));
  const zh = /[一-鿿]/.test(post);
  let t = String(text).replace(/```/g, '').trim();
  if (isTraditional(post)) t = toTWPhrases(t);
  t = t.replace(/\{\{\s*PRICE\s*\}\}/gi, price).replace(/\{\{\s*DAYS\s*\}\}/gi, zh ? `${days} 天` : `${days} days`);
  const allowed = new Set([
    ...(String(post).match(/\d[\d,.]*/g) || []).map((x) => x.replace(/[,.]$/, '')),
    ...(price.match(/\d[\d,.]*/g) || []),
    days,
  ]);
  const removed = [];
  const kept = [];
  for (const s of sentences(t)) {
    const nums = (s.match(/\d[\d,.]*/g) || []).map((x) => x.replace(/[,.]$/, ''));
    const bad = nums.filter((n) => !allowed.has(n));
    if (bad.length) removed.push({ sentence: s, numbers: bad });
    else kept.push(s);
  }
  return { text: kept.join(zh ? '' : ' '), removed };
}
