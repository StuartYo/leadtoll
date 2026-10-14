import { quoteInPost } from './verify.js';
import { parseMoney } from './money.js';
import { ruleFlags, ruleNoGo, LABEL_WORDS, NEGATED_ONSITE } from './rules.js';
import { COMPONENTS, FLAGS } from './catalog.js';
import { decide } from './decide.js';

/** Pull the first JSON object out of a model reply (it sometimes wraps it in fences). */
export function parseJSON(text) {
  if (!text) return null;
  const t = String(text).replace(/```(?:json)?/gi, '');
  const s = t.indexOf('{');
  if (s < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = s; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(t.slice(s, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export function sentences(post) {
  return String(post ?? '').normalize('NFKC').split(/(?<=[.!?。！？\n])(?!\d)\s*/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Check every claim the model made against the post.
 * Returns { facts, kept, dropped } where dropped lists claims whose quote is not in the post.
 */
export function verifyExtraction(raw, post, { useRules = true, useModel = true } = {}) {
  const kept = [], dropped = [];
  const facts = { budget: null, components: [], flags: [] };
  const m = useModel && raw && typeof raw === 'object' ? raw : {};

  const check = (kind, item) => {
    const ok = item && typeof item.quote === 'string' && quoteInPost(item.quote, post);
    (ok ? kept : dropped).push({ kind, ...item, ...(ok ? {} : { why: item && typeof item.quote === 'string' ? 'quote is not in the post' : 'no quote given' }) });
    return ok;
  };
  // The quote is real, but does it say what the label says? Only checked for labels that end a lead.
  const fits = (kind, item) => {
    const re = LABEL_WORDS[item.type];
    const q = String(item.quote).normalize('NFKC');
    const negated = item.type === 'onsite' && NEGATED_ONSITE.test(q);
    if (!negated && (!re || re.test(q))) return true;
    const i = kept.lastIndexOf(kept.find((k) => k.quote === item.quote && k.type === item.type));
    if (i >= 0) kept.splice(i, 1);
    dropped.push({ kind, ...item, why: negated ? 'quote says the opposite' : 'quote is real but does not say that' });
    return false;
  };

  let budget = m.budget;
  if (typeof budget === 'string') budget = { quote: budget, per: 'project' };
  if (budget && typeof budget === 'object') {
    if (check('budget', budget)) {
      const money = parseMoney(budget.quote);
      if (money) {
        if (budget.per === 'hour') money.per = 'hour';
        const hrs = String(post).match(/(\d{1,4})\s*(?:hours|hrs|小時)/i);
        if (money.per === 'hour' && hrs) money.hours = parseInt(hrs[1], 10);
        facts.budget = { ...money, quote: budget.quote, source: 'model' };
      } else {
        const k = kept.pop();
        dropped.push({ ...k, why: 'no amount that code can read' });
      }
    }
  }
  const asList = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.entries(x).map(([type, v]) => (v && typeof v === 'object' ? { type, ...v } : { type })) : []);
  for (const c of asList(m.components ?? m.component)) {
    if (!COMPONENTS[c?.type]) { dropped.push({ kind: 'component', ...c, why: 'not a known kind of work' }); continue; }
    if (check('component', c) && fits('component', c)) facts.components.push(c);
  }
  for (const f of asList(m.flags ?? m.flag)) {
    if (!FLAGS[f?.type]) { dropped.push({ kind: 'flag', ...f, why: 'not a known warning' }); continue; }
    if (check('flag', f) && fits('flag', f)) facts.flags.push({ ...f, source: 'model' });
  }
  if (useRules) {
    for (const r of ruleFlags(post)) {
      if (!facts.flags.some((f) => f.type === r.type)) facts.flags.push(r);
    }
    for (const r of ruleNoGo(post)) {
      if (!facts.components.some((c) => c.type === r.type)) facts.components.push(r);
    }
    // Budget backstop: if the model gave none, code looks for an amount next to a money word.
    if (!facts.budget) {
      for (const s of sentences(post)) {
        const money = parseMoney(s);
        if (money) {
          if (money.per === 'hour') {
            const hrs = String(post).match(/(\d{1,4})\s*(?:hours|hrs|小時)/i);
            if (hrs) money.hours = parseInt(hrs[1], 10);
          }
          facts.budget = { ...money, quote: s, source: 'rule' };
          break;
        }
      }
    }
  }
  return { facts, kept, dropped };
}

export function triage(raw, post, lead, profile, opts) {
  const v = verifyExtraction(raw, post, opts);
  const d = decide(v.facts, lead, profile);
  return { ...v, decision: d };
}
