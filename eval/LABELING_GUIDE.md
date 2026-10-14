# Labeling guide (frozen 2026-10-14, before any system output was seen)

Every post in `eval/*.jsonl` is labeled by a person or agent reading the post with THIS guide only.
The system's code was not visible to the labeler.

## The freelancer (the default profile in the app)

- Solo web developer in Taiwan. Works remotely only. English and Traditional Chinese.
- Builds: marketing sites, multi-page sites with a CMS, web apps with login, admin dashboards,
  booking/reservation flows, LINE/Telegram bots, small business internal tools, API integrations.
- Does not build: native mobile games, Shopify Liquid themes, hardware or on-site installs,
  work on a no-code platform he has never used (e.g. Ragic), large ERP migrations.
- Floor rate: US$25/hour (about NT$800). Minimum project: US$550 (NT$18,000).
- Typical win rate on paid bids: 10%.
- A proposal takes him 0.5 hour to write.

## Hard no (any one => SKIP, no matter the budget)

1. `onsite` - must be physically present (office visits, on-site install, "come to our shop").
   Online meetings are fine.
2. `tos_grey` - account farming, phone farms, multi-account management to dodge platform rules,
   fake reviews, bot followers, scraping behind a login, ban evasion.
3. `pay_on_success` - payment only after launch/users/revenue, or equity-only, or "we pay when funded".
4. `unpaid_work` - free sample / test work longer than about 1 hour before any payment.

## Soft flags (lower the value, do not force SKIP)

`off_platform` (asks to move to WhatsApp/Telegram/LINE before hire), `clone_big_app` ("like Uber/Airbnb"),
`rush` (unrealistic deadline for the scope), `vague_scope`, `unlimited_revisions`, `out_of_stack`
(needs something in the "does not build" list).

## Verdict

- `SKIP` - any hard no, OR the budget clearly cannot pay the work at the floor rate,
  OR it is out of stack.
- `PAY` - no hard no, budget is stated and covers the work at the floor rate with room,
  and the lead cost is small compared with the job.
- `CLOSE` - everything else: budget missing or borderline, scope unclear, lead cost large
  relative to the job.

## Fields to record per post (gold)

- `budget_min`, `budget_max` (numbers in the post's currency, null if not stated), `currency`
- `onsite` true/false
- `hard_no` list (subset of: onsite, tos_grey, pay_on_success, unpaid_work)
- `verdict` PAY / SKIP / CLOSE
- `why` one sentence
