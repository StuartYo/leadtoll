// Records real Gemma outputs for the site's "Recorded runs" tab.
// Usage: node scripts/record.mjs   (needs the built eval page served on :5182)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { triage, parseJSON } from '../src/core/pipeline.js';
import { DEFAULT_PROFILE } from '../src/core/profile.js';

const PICK = JSON.parse(fs.readFileSync('eval/showcase.json', 'utf8'));
const all = ['eval/dev_synthetic.jsonl', 'eval/dev_history.jsonl', 'eval/holdout.jsonl']
  .filter((f) => fs.existsSync(f))
  .flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const items = PICK.map((p) => ({ ...all.find((x) => x.id === p.id), ...p }));
const ctx = await chromium.launchPersistentContext('E:/_tmp_claude/hf26w2/profile', {
  channel: 'chrome', headless: false, args: ['--force_high_performance_gpu', '--enable-unsafe-webgpu', '--window-size=700,500'],
});
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.text(); if (/recorded|rror/.test(t)) console.log('>', t.slice(0, 200)); });
await page.goto('http://localhost:5179/eval.html');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const res = await page.evaluate(async (items) => await window.runRecord(items), items.map(({ id, post, lead_cost }) => ({ id, post, lead_cost })));
await ctx.close();
const examples = res.results.map((r) => {
  const it = items.find((x) => x.id === r.id);
  const v = triage(parseJSON(r.extract) || {}, it.post, it.lead_cost, DEFAULT_PROFILE).decision.verdict;
  return {
    id: it.id, title: it.title, platform: it.platform, label: it.synthetic ? 'made-up post' : 'rewritten from my notes',
    post: it.post, lead_cost: it.lead_cost, extract: r.extract, draft: r.draft, recordedVerdict: v,
  };
});
fs.writeFileSync('src/recorded.json', JSON.stringify({ model: res.model, recordedOn: res.at.slice(0, 10), examples }, null, 1));
fs.writeFileSync(`eval/runs/${res.at.slice(0, 10)}_recorded.json`, JSON.stringify(res, null, 1));
console.log('recorded', examples.length);
