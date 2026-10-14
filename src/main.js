import { triage, parseJSON } from './core/pipeline.js';
import { DEFAULT_PROFILE } from './core/profile.js';
import { FLAGS } from './core/catalog.js';
import { fmt, pct } from './core/decide.js';
import { locate } from './core/verify.js';
import { extractPrompt, draftPrompt, EXTRACT_GRAMMAR } from './core/prompts.js';
import { finishDraft } from './core/draft.js';
import RECORDED from './recorded.json';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ICON = {
  hard: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="var(--skip)" stroke-width="2"/><path d="M8 8l8 8M16 8l-8 8" stroke="var(--skip)" stroke-width="2" stroke-linecap="round"/></svg>',
  stack: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="var(--skip)" stroke-width="2"/><path d="M8 12h8" stroke="var(--skip)" stroke-width="2" stroke-linecap="round"/></svg>',
  money: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="var(--ink-2)" stroke-width="2"/><path d="M12 7v10M15 9.5c0-1.2-1.3-2-3-2s-3 .8-3 2 1.3 1.8 3 2.2 3 1 3 2.3-1.3 2-3 2-3-.8-3-2" fill="none" stroke="var(--ink-2)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  soft: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4l9 16H3z" fill="none" stroke="var(--close)" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17v.5" stroke="var(--close)" stroke-width="2" stroke-linecap="round"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

const state = {
  mode: 'recorded',
  exampleId: RECORDED.examples[0]?.id,
  raw: null,          // model reply object for the current post
  draftText: '',      // model draft for the current post
  post: '',
  lead: { amount: 0, currency: 'USD' },
  profile: loadProfile(),
  activeQuote: null,
  modelReady: false,
  busy: false,
};

function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('leadtoll.profile') || 'null');
    if (p && typeof p === 'object') return { ...DEFAULT_PROFILE, ...p };
  } catch {}
  return { ...DEFAULT_PROFILE };
}
function saveProfile() {
  try { localStorage.setItem('leadtoll.profile', JSON.stringify(state.profile)); } catch {}
}

// ---------- examples ----------
function renderExamples() {
  $('examples').innerHTML = RECORDED.examples
    .map((e) => `<button class="ex ${e.id === state.exampleId && state.mode === 'recorded' ? 'on' : ''}" data-id="${e.id}" type="button"><b class="${e.recordedVerdict}">${e.platform}</b>${esc(e.title)}</button>`)
    .join('');
  for (const b of $('examples').querySelectorAll('.ex')) b.onclick = () => pickExample(b.dataset.id);
}

function pickExample(id) {
  const e = RECORDED.examples.find((x) => x.id === id);
  if (!e) return;
  state.exampleId = id;
  state.post = e.post;
  state.lead = { ...e.lead_cost };
  state.raw = state.mode === 'recorded' ? parseJSON(e.extract) : null;
  state.draftText = state.mode === 'recorded' ? e.draft || '' : '';
  state.activeQuote = null;
  $('post').value = e.post;
  $('fee').value = e.lead_cost.amount;
  $('feeCur').value = e.lead_cost.currency;
  $('tag').textContent = e.label;
  renderExamples();
  render();
}

// ---------- mode ----------
function setMode(m) {
  state.mode = m;
  $('tab-recorded').classList.toggle('on', m === 'recorded');
  $('tab-live').classList.toggle('on', m === 'live');
  $('tab-recorded').setAttribute('aria-selected', String(m === 'recorded'));
  $('tab-live').setAttribute('aria-selected', String(m === 'live'));
  if (m === 'recorded') pickExample(state.exampleId);
  else {
    state.raw = null;
    state.draftText = '';
    render();
    checkGpu();
  }
}

function status(html) { $('status').innerHTML = html; }

async function checkGpu() {
  if (state.modelReady) return status('<span class="dot ok"></span>Gemma 4 E2B is loaded on this device.');
  const { webgpuStatus, MODEL_LABEL } = await import('./llm.js');
  const s = await webgpuStatus();
  if (!s.ok) {
    status(`<span class="dot bad"></span>${esc(s.why)} Use Chrome or Edge on a laptop or desktop, or stay on Recorded runs.`);
    $('run').disabled = true;
    return;
  }
  $('run').disabled = false;
  status(`<span class="dot"></span>WebGPU found. The first check downloads ${esc(MODEL_LABEL)} once.`);
}

// ---------- live run ----------
async function runLive() {
  if (state.busy) return;
  const post = $('post').value.trim();
  if (post.length < 20) { status('<span class="dot bad"></span>Paste a job post first.'); return; }
  state.busy = true;
  $('run').disabled = true;
  try {
    const llm = await import('./llm.js');
    if (!state.modelReady) {
      status('<span class="dot busy"></span>Downloading Gemma 4 E2B <span class="bar"><i id="pbar" style="width:0%"></i></span> <span id="ptext"></span>');
      await llm.loadModel((p) => {
        const w = Math.round((p.progress || 0) * 100);
        const bar = document.getElementById('pbar');
        if (bar) bar.style.width = w + '%';
        const t = document.getElementById('ptext');
        if (t) t.textContent = w + '%';
      });
      state.modelReady = true;
    }
    state.post = post;
    state.lead = { amount: Number($('fee').value) || 0, currency: $('feeCur').value };
    status('<span class="dot busy"></span>Gemma is reading the post...');
    const ex = await llm.ask(extractPrompt(post), { grammar: EXTRACT_GRAMMAR });
    state.raw = parseJSON(ex.text) || {};
    state.draftText = '';
    render();
    const v = triage(state.raw, post, state.lead, state.profile).decision.verdict;
    if (v !== 'SKIP') {
      status('<span class="dot busy"></span>Writing a draft opener...');
      const d = await llm.ask(draftPrompt(post, v), { maxTokens: 300 });
      state.draftText = d.text;
    }
    status(`<span class="dot ok"></span>Done on this device. Reading took ${(ex.ms / 1000).toFixed(1)} s.`);
  } catch (e) {
    status(`<span class="dot bad"></span>${esc(e?.message || e)}`);
  } finally {
    state.busy = false;
    $('run').disabled = false;
    render();
  }
}

// ---------- render ----------
function render() {
  const p = state.profile;
  const hasRun = state.raw !== null;
  const recorded = state.mode === 'recorded';
  $('post').classList.toggle('hidden', recorded || hasRun);
  $('postView').classList.toggle('hidden', !(recorded || hasRun));
  $('run').classList.toggle('hidden', recorded);
  $('edit').classList.toggle('hidden', recorded || !hasRun);
  $('fee').disabled = recorded;
  $('feeCur').disabled = recorded;
  $('examples').classList.toggle('hidden', !recorded);
  if (!recorded && !hasRun) $('tag').textContent = 'your post';

  if (!hasRun) {
    $('verdict').innerHTML = `<p class="empty">${recorded ? 'Pick an example.' : 'Paste a post and press Check this lead. Nothing is sent anywhere.'}</p>`;
    for (const id of ['meter', 'nums', 'reasons', 'dropped', 'estimate', 'draft']) $(id).innerHTML = '';
    return;
  }

  const t = triage(state.raw, state.post, state.lead, p);
  const d = t.decision;
  const word = { PAY: 'Pay', SKIP: 'Skip', CLOSE: 'Close call' }[d.verdict];
  $('verdict').innerHTML = `<span class="word ${d.verdict}">${word}</span><span class="head">${esc(d.reasons[0]?.text || '')}</span>`;

  // break-even meter
  if (d.breakEven != null) {
    const max = Math.max(0.5, Math.min(1, Math.max(d.breakEven, p.winRate) * 1.3));
    const pos = (x) => Math.min(100, (x / max) * 100);
    const ok = d.breakEven <= p.winRate;
    $('meter').innerHTML = `
      <div class="track" role="img" aria-label="Break-even win rate ${pct(d.breakEven)}, your win rate ${pct(p.winRate)}">
        <span class="fill" style="width:${pos(p.winRate)}%"></span>
        <span class="pin you" style="left:${pos(p.winRate)}%"></span>
        <span class="pin need ${ok ? 'ok' : ''}" style="left:${pos(d.breakEven)}%"></span>
      </div>
      <div class="legend"><span><i style="background:var(--ink)"></i>You win ${pct(p.winRate)} of paid bids</span><span><i style="background:var(--${ok ? 'pay' : 'skip'})"></i>Need ${pct(d.breakEven)} to break even</span></div>`;
  } else $('meter').innerHTML = '';

  const cur = d.currency;
  const cells = [
    ['Job pays', d.value == null ? 'not stated' : fmt(d.value, cur)],
    ['Work at your floor', `${fmt(d.workCost, cur)}`],
    ['Above your floor', d.surplus == null ? 'n/a' : fmt(d.surplus, cur)],
    ['Lead fee', fmt(d.leadCost, cur)],
    ['Cost per bid', fmt(d.bidCost, cur)],
    ['Hours (est.)', `${d.est.low}-${d.est.high}`],
  ];
  $('nums').innerHTML = cells.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  // reasons with quotes
  const rs = d.reasons.slice(d.reasons[0]?.kind === 'money' ? 0 : 0);
  const quotes = [];
  $('reasons').innerHTML = `<h3>Why</h3>` + rs.map((r) => {
    let q = '';
    if (r.quote) {
      quotes.push(r.quote);
      const flag = t.facts.flags.find((f) => f.quote === r.quote);
      const src = flag ? (flag.source === 'rule' ? 'found by a text rule' : 'Gemma, quote checked') : 'Gemma, quote checked';
      q = `<q data-q="${esc(r.quote)}">${esc(r.quote)}</q><span class="src">${src}</span>`;
    }
    return `<div class="reason">${ICON[r.kind] || ICON.money}<div>${esc(r.text)}${q}</div></div>`;
  }).join('') + (t.facts.budget ? `<div class="reason">${ICON.money}<div>Budget read by code: ${budgetText(t.facts.budget)}<q data-q="${esc(t.facts.budget.quote)}">${esc(t.facts.budget.quote)}</q><span class="src">${t.facts.budget.source === 'rule' ? 'found by a text rule' : 'Gemma quote, number parsed by code'}</span></div></div>` : '');
  if (t.facts.budget) quotes.push(t.facts.budget.quote);

  // dropped
  const drops = t.dropped.filter((x) => x.quote);
  $('dropped').innerHTML = drops.length
    ? `<h3>Thrown out by the checker (${drops.length})</h3>` + drops.map((x) => `<div class="drop"><s>${esc(labelFor(x))}: "${esc(x.quote)}"</s><em>${esc(x.why || 'quote is not in the post')}</em></div>`).join('')
    : `<h3>Thrown out by the checker</h3><p class="fine" style="margin:0">Nothing. Every quote Gemma gave is in the post.</p>`;

  // estimate
  $('estimate').innerHTML = `<h3>Work Gemma found, hours from my rate card</h3><table class="est"><tbody>` +
    d.est.lines.map((l) => { if (l.quote) quotes.push(l.quote); return `<tr class="${l.outOfStack ? 'oos' : ''}"><td>${esc(l.label)}${l.count > 1 ? ' x' + l.count : ''}${l.outOfStack ? ' (not my stack)' : ''}</td><td class="h">${l.low}-${l.high} h</td></tr>`; }).join('') +
    `</tbody></table>`;

  // draft
  if (state.draftText && d.verdict !== 'SKIP') {
    const f = finishDraft(state.draftText, state.post, d);
    $('draft').innerHTML = `<div class="draft-h"><h3 style="margin:0">Draft opener</h3><button class="btn ghost" id="copy" type="button">${ICON.copy}<span>Copy</span></button></div><div class="draftbox">${esc(f.text)}</div>` +
      `<p class="fine">Written by Gemma. Price and days were filled in by code${f.removed.length ? `; ${f.removed.length} sentence with a number the model made up was removed` : ''}.</p>`;
    $('copy').onclick = () => navigator.clipboard?.writeText(f.text).then(() => { $('copy').lastChild.textContent = 'Copied'; });
  } else $('draft').innerHTML = '';

  renderPost(quotes);
  for (const q of document.querySelectorAll('q[data-q]')) q.onclick = () => { state.activeQuote = q.dataset.q; renderPost(quotes); scrollToMark(); };
}

function budgetText(b) {
  const c = b.currency;
  const r = b.min != null && b.max != null && b.min !== b.max ? `${fmt(b.min, c)} to ${fmt(b.max, c)}` : fmt(b.max ?? b.min, c);
  return b.per === 'hour' ? `${r} an hour${b.hours ? `, ${b.hours} hours` : ''}` : r;
}
function labelFor(x) {
  if (x.kind === 'flag') return FLAGS[x.type]?.label || x.type || 'flag';
  if (x.kind === 'component') return 'work item';
  return x.kind;
}

function renderPost(quotes) {
  const post = state.post;
  const spans = [];
  for (const q of new Set(quotes)) {
    const at = locate(q, post);
    if (at && !spans.some(([s, e]) => at[0] < e && at[1] > s)) spans.push([...at, q]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let html = '', i = 0;
  const P = post.normalize('NFKC');
  for (const [s, e, q] of spans) {
    html += esc(P.slice(i, s)) + `<mark data-q="${esc(q)}" class="${q === state.activeQuote ? 'on' : ''}">${esc(P.slice(s, e))}</mark>`;
    i = e;
  }
  html += esc(P.slice(i));
  $('postView').innerHTML = html;
}
function scrollToMark() {
  const m = $('postView').querySelector('mark.on');
  if (m) m.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------- profile inputs ----------
function bindProfile() {
  const p = state.profile;
  $('floor').value = p.floorRate;
  $('minp').value = p.minProject;
  $('win').value = Math.round(p.winRate * 100);
  $('ph').value = p.proposalHours;
  const upd = () => {
    state.profile = {
      ...state.profile,
      floorRate: Math.max(1, Number($('floor').value) || DEFAULT_PROFILE.floorRate),
      minProject: Math.max(0, Number($('minp').value) || 0),
      winRate: Math.min(1, Math.max(0.01, (Number($('win').value) || 10) / 100)),
      proposalHours: Math.max(0, Number($('ph').value) || 0),
    };
    saveProfile();
    render();
  };
  for (const id of ['floor', 'minp', 'win', 'ph']) $(id).addEventListener('input', upd);
  for (const id of ['fee', 'feeCur']) $(id).addEventListener('input', () => {
    state.lead = { amount: Number($('fee').value) || 0, currency: $('feeCur').value };
    if (state.raw) render();
  });
  $('post').addEventListener('input', () => { state.raw = null; });
  $('edit').addEventListener('click', () => { state.raw = null; render(); $('post').focus(); });
}

$('tab-recorded').onclick = () => setMode('recorded');
$('tab-live').onclick = () => setMode('live');
$('run').onclick = runLive;
bindProfile();
status(`<span class="dot ok"></span>Showing real outputs saved from Gemma 4 E2B on ${esc(RECORDED.recordedOn)}. The checks and math run live in your browser.`);
pickExample(state.exampleId);
