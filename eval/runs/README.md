# Saved runs

Every file here is raw Gemma 4 E2B output captured in Chrome (WebGPU, RTX 4050 laptop GPU) by `scripts/run-eval.mjs`.
`*.score.json` is produced by `scripts/score.mjs` from the current code; CI checks that it still matches.

| Run | Posts | Notes |
|---|---|---|
| `dev.json` | 32 | 22 made up + 10 rewritten from my own lead notes. Used while building. |
| `holdout.json` | 12 | Written by a separate agent from the labeling guide only. First run on frozen v1 code (`v1/holdout.score.json`, commit 4f78421) scored 6/12; I then used it to find bugs, so it is no longer clean. |
| `holdout2.json` | 16 | Written by another agent from the guide only, run once on commit 1d97c7b. Frozen score is in `v1/holdout2.frozen-1d97c7b.score.json` (14/16). The current score includes one fix made after seeing it (Simplified Chinese quotes, see the write-up). |
| `*_recorded.json` | 10 | The outputs shown on the site's Recorded runs tab. |
| `v1/`, `v2-schema/` | | Older runs: free-form JSON (v1) and JSON-schema decoding (v2), kept for the record. |
