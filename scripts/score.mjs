// Score a saved eval run. Every number in the README and the article comes from this script.
// Usage: node scripts/score.mjs eval/runs/<run>.json eval/dev_synthetic.jsonl eval/dev_history.jsonl
import fs from 'node:fs';
import { triage, parseJSON } from '../src/core/pipeline.js';
import { quoteInPost } from '../src/core/verify.js';
import { DEFAULT_PROFILE } from '../src/core/profile.js';
import { convert, parseMoney } from '../src/core/money.js';
import { decide } from '../src/core/decide.js';

const [runFile, ...dataFiles] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
const items = Object.fromEntries(
  dataFiles.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).map((x) => [x.id, x])
);
const HARD = ['onsite', 'tos_grey', 'pay_on_success', 'unpaid_work'];

const arms = {
  baseline: { n: 0, correct: 0, hardHit: 0, hardTotal: 0, falseHard: 0, quotes: 0, fakeQuotes: 0, budgetOk: 0, budgetTotal: 0, parseFail: 0, payOnHard: 0 },
  rules_only: { n: 0, correct: 0, hardHit: 0, hardTotal: 0, budgetOk: 0, budgetTotal: 0, payOnHard: 0 },
  model_unverified: { n: 0, correct: 0, hardHit: 0, hardTotal: 0, budgetOk: 0, budgetTotal: 0, payOnHard: 0 },
  leadtoll: { n: 0, correct: 0, hardHit: 0, hardTotal: 0, budgetOk: 0, budgetTotal: 0, payOnHard: 0 },
};
const extractStats = { claims: 0, dropped: 0, parseFail: 0, ms: [], why: {} };
const rows = [];

const sameBudget = (gold, got) => {
  if (gold.budget_max == null && gold.budget_min == null) return got == null;
  if (!got) return false;
  const gmax = gold.budget_max ?? gold.budget_min;
  const vmax = got.max ?? got.min;
  if (vmax == null) return false;
  const c = convert(vmax, got.currency, gold.currency || got.currency);
  return Math.abs(c - gmax) / gmax < 0.02;
};

for (const r of run.results) {
  const it = items[r.id];
  if (!it) continue;
  const g = it.gold;
  const goldHard = g.hard_no || [];
  const lead = it.lead_cost;
  const raw = parseJSON(r.extract.text);
  if (!raw) extractStats.parseFail++;
  extractStats.ms.push(r.extract.ms);

  // Baseline: model alone.
  const b = parseJSON(r.baseline.text);
  const A = arms.baseline;
  A.n++;
  if (!b) A.parseFail++;
  const bv = (b?.verdict || '').toUpperCase();
  if (bv === g.verdict) A.correct++;
  if (goldHard.length) { A.hardTotal++; if (bv === 'SKIP') A.hardHit++; if (bv === 'PAY') A.payOnHard++; }
  for (const q of Array.isArray(b?.reasons) ? b.reasons : []) {
    if (typeof q?.quote !== 'string' || !q.quote.trim()) continue;
    A.quotes++;
    if (!quoteInPost(q.quote, it.post)) A.fakeQuotes++;
  }
  A.budgetTotal++;
  const bb = b && (b.budget_max != null || b.budget_min != null) ? { min: b.budget_min, max: b.budget_max, currency: b.currency || g.currency } : null;
  if (sameBudget(g, bb)) A.budgetOk++;

  const runArm = (name, opts) => {
    const t = triage(raw, it.post, lead, DEFAULT_PROFILE, opts);
    const X = arms[name];
    X.n++;
    if (t.decision.verdict === g.verdict) X.correct++;
    if (goldHard.length) { X.hardTotal++; if (t.decision.verdict === 'SKIP') X.hardHit++; if (t.decision.verdict === 'PAY') X.payOnHard++; }
    X.budgetTotal++;
    if (sameBudget(g, t.facts.budget)) X.budgetOk++;
    return t;
  };
  const tr = runArm('rules_only', { useModel: false, useRules: true });
  // "model_unverified": trust every model claim as if it were true (no quote check, no rules).
  const fakeRaw = raw ? JSON.parse(JSON.stringify(raw)) : null;
  const unv = (() => {
    const X = arms.model_unverified;
    X.n++;
    const facts = { budget: null, components: [], flags: [] };
    if (fakeRaw?.budget?.quote) {
      const m = parseMoney(fakeRaw.budget.quote);
      if (m) facts.budget = { ...m, per: fakeRaw.budget.per === 'hour' ? 'hour' : m.per };
    }
    facts.components = (Array.isArray(fakeRaw?.components) ? fakeRaw.components : []).filter((c) => c && c.type);
    facts.flags = (Array.isArray(fakeRaw?.flags) ? fakeRaw.flags : []).filter((f) => f && f.type);
    return facts;
  })();
  {
    const X = arms.model_unverified;

    const d = decide(unv, lead, DEFAULT_PROFILE);
    if (d.verdict === g.verdict) X.correct++;
    if (goldHard.length) { X.hardTotal++; if (d.verdict === 'SKIP') X.hardHit++; if (d.verdict === 'PAY') X.payOnHard++; }
    X.budgetTotal++;
    if (sameBudget(g, unv.budget)) X.budgetOk++;
  }
  const full = runArm('leadtoll', {});
  const claims = full.kept.length + full.dropped.length;
  extractStats.claims += claims;
  extractStats.dropped += full.dropped.length;
  for (const d of full.dropped) extractStats.why[d.why] = (extractStats.why[d.why] || 0) + 1;
  rows.push({
    id: r.id, gold: g.verdict, baseline: bv || 'parse-fail', rules_only: tr.decision.verdict, leadtoll: full.decision.verdict,
    dropped: full.dropped.map((d) => `${d.kind}:${d.type || ''}:${(d.quote || '').slice(0, 50)}`),
    flags: full.facts.flags.map((f) => `${f.type}(${f.source})`), budget: full.facts.budget ? `${full.facts.budget.min}-${full.facts.budget.max} ${full.facts.budget.currency}` : null,
  });
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : 'n/a');
const summary = {
  run: runFile, model: run.model, n: rows.length,
  arms: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, {
    verdict_accuracy: `${v.correct}/${v.n} (${pct(v.correct, v.n)})`,
    hard_no_caught: `${v.hardHit}/${v.hardTotal}`,
    paid_on_hard_no: v.payOnHard,
    budget_read_correctly: `${v.budgetOk}/${v.budgetTotal}`,
    ...(k === 'baseline' ? { quotes_not_in_post: `${v.fakeQuotes}/${v.quotes} (${pct(v.fakeQuotes, v.quotes)})`, json_parse_fail: v.parseFail } : {}),
  }])),
  reader: {
    claims: extractStats.claims,
    dropped_by_verifier: `${extractStats.dropped}/${extractStats.claims} (${pct(extractStats.dropped, extractStats.claims)})`,
    dropped_why: extractStats.why,
    json_parse_fail: extractStats.parseFail,
    median_extract_ms: extractStats.ms.sort((a, b) => a - b)[Math.floor(extractStats.ms.length / 2)],
  },
};
console.log(JSON.stringify(summary, null, 1));
const outFile = runFile.replace(/\.json$/, '.score.json');
fs.writeFileSync(outFile, JSON.stringify({ summary, rows }, null, 1));
if (process.argv.includes('--rows')) for (const r of rows) console.log(JSON.stringify(r));
