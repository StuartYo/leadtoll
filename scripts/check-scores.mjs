// CI guard: re-score every saved run and fail if the result differs from the committed .score.json.
// The README and the write-up quote those files, so this keeps the published numbers honest.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = 'eval/runs';
const sets = {
  dev: ['eval/dev_synthetic.jsonl', 'eval/dev_history.jsonl'],
  holdout: ['eval/holdout.jsonl'],
  holdout2: ['eval/holdout2.jsonl'],
};
let bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.score.json'))) {
  const run = `${dir}/${f.replace('.score.json', '.json')}`;
  const before = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).summary;
  const data = sets[f.replace('.score.json', '')] || sets.dev;
  execFileSync('node', ['scripts/score.mjs', run, ...data], { stdio: 'ignore' });
  const after = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).summary;
  const same = JSON.stringify(before.arms) === JSON.stringify(after.arms) && JSON.stringify(before.reader) === JSON.stringify(after.reader);
  console.log(`${same ? 'ok  ' : 'DIFF'} ${f}`);
  if (!same) bad++;
}
process.exit(bad ? 1 : 0);
