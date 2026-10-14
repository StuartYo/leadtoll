import { fmt } from './decide.js';
import { toTWPhrases, isTraditional } from './zh.js';

// The model sometimes claims to have attached a portfolio or a link. There is no attachment.
const PROMISE = /attach|enclos|included (a|the|my) (link|portfolio|sample)|link to (a|my|some)|see my portfolio|here is (a|my) (link|portfolio)|附上|附件|作品連結|作品集連結/i;

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
  // Split without NFKC so Chinese punctuation stays full width.
  const parts = t.split(/(?<=[.!?。！？\n])(?!\d)\s*/).map((x) => x.trim()).filter(Boolean);
  for (const s of parts) {
    const nums = (s.match(/\d[\d,.]*/g) || []).map((x) => x.replace(/[,.]$/, ''));
    const bad = nums.filter((n) => !allowed.has(n));
    if (bad.length) removed.push({ sentence: s, why: 'a number the model made up', numbers: bad });
    else if (PROMISE.test(s)) removed.push({ sentence: s, why: 'mentions an attachment or link that does not exist' });
    else kept.push(s);
  }
  return { text: kept.join(zh ? '' : ' '), removed };
}
