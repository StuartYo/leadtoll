// Runs the same Gemma 4 E2B on every eval post twice: once as the reader (LeadToll) and
// once as a lone judge (baseline). Raw replies are returned untouched; scoring happens in Node.
import { loadModel, ask, MODEL_ID } from './llm.js';
import { extractPrompt, baselinePrompt, EXTRACT_GRAMMAR, BASELINE_SCHEMA } from './core/prompts.js';
import { DEFAULT_PROFILE } from './core/profile.js';

const log = (s) => { document.getElementById('log').textContent += '\n' + s; console.log(s); };

window.runEval = async (items) => {
  await loadModel((p) => { if (p.progress === 1 || Math.random() < 0.02) log(p.text); }, { worker: false });
  const out = [];
  for (const it of items) {
    const ex = await ask(extractPrompt(it.post), { grammar: EXTRACT_GRAMMAR });
    const lead = it.lead_cost || { amount: 0, currency: 'USD' };
    const bl = await ask(baselinePrompt(it.post, DEFAULT_PROFILE, lead), { maxTokens: 500, schema: BASELINE_SCHEMA });
    out.push({ id: it.id, extract: ex, baseline: bl });
    log(`${it.id} extract ${ex.ms}ms baseline ${bl.ms}ms`);
  }
  return { model: MODEL_ID, at: new Date().toISOString(), ua: navigator.userAgent, results: out };
};
window.__ready = true;

// Recorded runs for the site: the reader output plus a draft, for a handful of examples.
import { draftPrompt } from './core/prompts.js';
import { triage, parseJSON } from './core/pipeline.js';
window.runRecord = async (items) => {
  await loadModel(() => {}, { worker: false });
  const out = [];
  for (const it of items) {
    const ex = await ask(extractPrompt(it.post), { grammar: EXTRACT_GRAMMAR });
    const raw = parseJSON(ex.text) || {};
    const v = triage(raw, it.post, it.lead_cost, DEFAULT_PROFILE).decision.verdict;
    const dr = v === 'SKIP' ? null : await ask(draftPrompt(it.post, v), { maxTokens: 300 });
    out.push({ id: it.id, extract: ex.text, extract_ms: ex.ms, draft: dr?.text || '', draft_ms: dr?.ms || 0 });
    log(`${it.id} recorded ${ex.ms}ms`);
  }
  return { model: MODEL_ID, at: new Date().toISOString(), results: out };
};
