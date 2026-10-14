import { COMPONENTS, FLAGS } from './catalog.js';

const compList = Object.keys(COMPONENTS).join(', ');
const flagList = Object.keys(FLAGS).join(', ');

/** The reader prompt: the model copies facts out of the post, with an exact quote for each. No judgement. */
export function extractPrompt(post) {
  return `You read freelance job posts and copy facts out of them. Do not judge the job.
Every item needs "quote": text copied EXACTLY from the post, 3 to 25 words, same language as the post. If you cannot copy a quote for something, leave it out.

Return one JSON object and nothing else:
{
 "budget": {"quote": "...", "per": "project" or "hour"} or null,
 "components": [{"type": one of [${compList}], "count": number, "quote": "..."}],
 "flags": [{"type": one of [${flagList}], "quote": "..."}]
}

Component meanings: page = one content page (count them); cms = client edits content; login = user accounts; admin_dashboard = back office or reports; integration = connect to another service; no_code_platform = must be built on a no-code tool such as Ragic, Bubble, Airtable; erp_suite = ERP or CRM covering several departments; hardware = machines, devices, installation.

Flag meanings:
onsite = must be physically present at an office, shop or site (video calls are NOT onsite)
tos_grey = many accounts, phone farms, fake reviews, dodging a platform's detection or bans
pay_on_success = paid only after launch, users, revenue or funding; equity only
unpaid_work = free test or sample work before being hired
off_platform = asks to move to WhatsApp, Telegram, LINE before hiring
clone_big_app = wants a copy of a big app like Uber or Airbnb
rush = deadline far too short for the work
vague_scope = the post does not say what to build
unlimited_revisions = unlimited changes
Only add a flag when the post really says it. Most posts have zero or one flag.

Job post:
"""
${post}
"""`;
}

/** The baseline prompt: the same model, the same rules in plain words, asked to decide on its own. */
export function baselinePrompt(post, profile, lead) {
  return `I am a freelancer deciding whether to pay to bid on a job.
About me: ${profile.name}. I build: ${profile.skills}. I do not build: ${profile.noGo}.
My floor rate is ${profile.floorRate} ${profile.currency}/hour, my minimum project is ${profile.minProject} ${profile.currency}, I win about ${Math.round(profile.winRate * 100)}% of the bids I pay for, and a proposal takes me ${profile.proposalHours} hour.
Hard no, always SKIP: must be on site; anything that breaks a platform's rules (multi-account, phone farms, fake reviews, dodging bans); paid only after launch/users/funding or equity only; unpaid test work.
Bidding on this job costs me ${lead.amount} ${lead.currency}.
Exchange rate: 1 USD = 31.5 TWD.

Answer with one JSON object and nothing else:
{"verdict": "PAY" or "SKIP" or "CLOSE", "budget_min": number or null, "budget_max": number or null, "currency": "USD" or "TWD" or null, "reasons": [{"reason": "...", "quote": "text copied exactly from the post"}]}
PAY = worth paying for. SKIP = not worth it. CLOSE = cannot tell, borderline.

Job post:
"""
${post}
"""`;
}

/** Reply draft. Numbers are placeholders that code fills in, so the model cannot change them. */
export function draftPrompt(post, verdict) {
  const lang = /[一-鿿]/.test(post) ? 'Traditional Chinese (Taiwan)' : 'English';
  const ask = verdict === 'CLOSE'
    ? 'Ask the two questions that matter most before pricing it (budget and scope).'
    : 'Say the price and timeline using exactly these placeholders: {{PRICE}} and {{DAYS}}.';
  return `Write the opening message of a freelance proposal for this job, in ${lang}, 4 to 6 sentences, plain and friendly, no emoji, no exclamation marks.
Mention one specific detail from the post. ${ask}
Do not write any other numbers or prices. Do not promise anything not in the post.

Job post:
"""
${post}
"""`;
}

/** JSON schema for the reader. WebLLM turns it into a grammar, so the model cannot drift off it. */
export const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    budget: {
      anyOf: [
        { type: 'null' },
        { type: 'object', properties: { quote: { type: 'string' }, per: { type: 'string', enum: ['project', 'hour'] } }, required: ['quote', 'per'] },
      ],
    },
    components: {
      type: 'array',
      items: { type: 'object', properties: { type: { type: 'string', enum: Object.keys(COMPONENTS) }, count: { type: 'integer' }, quote: { type: 'string' } }, required: ['type', 'count', 'quote'] },
    },
    flags: {
      type: 'array',
      items: { type: 'object', properties: { type: { type: 'string', enum: Object.keys(FLAGS) }, quote: { type: 'string' } }, required: ['type', 'quote'] },
    },
  },
  required: ['budget', 'components', 'flags'],
};

export const BASELINE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PAY', 'SKIP', 'CLOSE'] },
    budget_min: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    budget_max: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    currency: { anyOf: [{ type: 'string', enum: ['USD', 'TWD'] }, { type: 'null' }] },
    reasons: { type: 'array', items: { type: 'object', properties: { reason: { type: 'string' }, quote: { type: 'string' } }, required: ['reason', 'quote'] } },
  },
  required: ['verdict', 'budget_min', 'budget_max', 'currency', 'reasons'],
};

// A hand-written grammar for the reader. The JSON-schema route lets a 2B model fill the
// output with blank lines until it runs out of tokens (5 of 32 dev posts), so whitespace is fixed here.
const alt = (xs) => xs.map((x) => `"\\"${x}\\""`).join(' | ');
export const EXTRACT_GRAMMAR = String.raw`root ::= "{\n  \"budget\": " budget ",\n  \"components\": " comps ",\n  \"flags\": " flags "\n}"
budget ::= "null" | "{\"quote\": " str ", \"per\": " per "}"
per ::= "\"project\"" | "\"hour\""
comps ::= "[]" | "[\n    " comp (",\n    " comp)* "\n  ]"
comp ::= "{\"type\": " ctype ", \"count\": " int ", \"quote\": " str "}"
flags ::= "[]" | "[\n    " flag (",\n    " flag)* "\n  ]"
flag ::= "{\"type\": " ftype ", \"quote\": " str "}"
int ::= [1-9] [0-9]?
str ::= "\"" chr+ "\""
chr ::= [^"\\\n] | "\\" ["\\/nt]
ctype ::= ` + alt(Object.keys(COMPONENTS)) + String.raw`
ftype ::= ` + alt(Object.keys(FLAGS)) + '\n';
