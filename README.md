# LeadToll

Should you pay for this freelance lead?

Upwork (Connects), Thumbtack, Bark and PRO360 charge freelancers before the first conversation with a client. LeadToll reads the job post and tells you whether the fee is worth it: **Pay**, **Skip** or **Close call**, with the quote from the post behind every reason.

Live: https://leadtoll.vercel.app

- **Gemma 4 E2B runs in your browser** through [WebLLM](https://github.com/mlc-ai/web-llm) and WebGPU. The post, your rates and your win rate never leave the page. The model is about 2.8 GB, downloads once from Hugging Face and then works offline.
- **The model only reads.** It copies the budget, the pieces of work and any warning signs out of the post, each with an exact quote. Output is held to a small hand-written grammar through WebLLM's constrained decoding, so it is always valid JSON with known labels.
- **Code checks and decides.** A quote that is not in the post is thrown out. A real quote under the wrong label is thrown out too ("mobile responsive design" is not a Shopify theme). Amounts are parsed from the quote by code. Hard no's end the lead. Everything else goes through one formula:

```
cost per bid       = lead fee + proposal hours x your floor rate
above your floor   = what the job pays - estimated hours x your floor rate
break-even win rate = cost per bid / above your floor
```

If you win more of these leads than the break-even rate, pay. The hours come from a rate card in `src/core/catalog.js`, which you should edit to match your own speed.

## No WebGPU?

The **Recorded runs** tab shows real outputs saved from the same model, and the checker and the math still run live on them. Live mode needs Chrome or Edge with WebGPU and a GPU with 16-bit float support.

## Evaluation

`eval/` holds the posts, the labeling guide (written before any system output) and every saved model run.

- `dev_synthetic.jsonl` (22, made up) and `dev_history.jsonl` (10, rewritten from my own lead notes from summer 2026; not the clients' words) were used while building.
- `holdout.jsonl` (12) and `holdout2.jsonl` (16) were written by separate agents that saw only the labeling guide. Holdout 1 was run once on the frozen v1 code, then used to find bugs, so it is no longer clean. Holdout 2 was run once on the final code.

```
npm install
npm test                                   # unit tests
node scripts/score.mjs eval/runs/<run>.json eval/<set>.jsonl --rows
```

To re-run the model: `npx vite build --outDir <dir>`, `npx vite preview --outDir <dir> --port 5179`, then `node scripts/run-eval.mjs <name> eval/<set>.jsonl` (drives your installed Chrome with Playwright).

The numbers are in `eval/runs/*.score.json`; CI re-scores every saved run and fails if they drift.

| Verdict matches the label | Dev (32) | Holdout 1 (12) | Holdout 2 (16, run once) |
|---|---|---|---|
| Same Gemma, one prompt with the same rules | 20 | 6 | 11 |
| Text rules only, no model | 29 (tuned on this set) | 9 | 10 |
| Gemma read, nothing checked | 27 | 9 | 12 |
| LeadToll | 30 | 9 | 14 (15 after one fix) |

Holdout 1 scored 6/12 on the frozen v1 code before I used it to find bugs. On holdout 2, LeadToll paid for one lead it should have skipped; the cause and the fix are in the write-up.

All example posts are made up or rewritten; no client text, names or contact details are included.

## License

MIT
