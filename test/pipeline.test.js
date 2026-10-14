import { describe, it, expect } from 'vitest';
import { triage, parseJSON } from '../src/core/pipeline.js';
import { quoteInPost } from '../src/core/verify.js';
import { ruleFlags } from '../src/core/rules.js';
import { DEFAULT_PROFILE } from '../src/core/profile.js';

const P = DEFAULT_PROFILE;
const uber = 'Looking for a developer to build an app like Uber for dog walkers. Budget: $500. Must be done in 2 weeks. You must come to our office in Austin twice a week. We will pay after the app reaches 1000 users.';

describe('verifier', () => {
  it('accepts exact and whitespace-different quotes, rejects changed numbers', () => {
    expect(quoteInPost('Budget:  $500', uber)).toBe(true);
    expect(quoteInPost('budget: $5000', uber)).toBe(false);
  });
  it('drops invented quotes', () => {
    const raw = { budget: { quote: 'Budget: $5,000', per: 'project' }, components: [], flags: [{ type: 'unlimited_revisions', quote: 'unlimited revisions included' }] };
    const r = triage(raw, uber, { amount: 2.4, currency: 'USD' }, P);
    expect(r.dropped.length).toBe(2);
    // the rule backstop still reads the real budget
    expect(r.facts.budget).toMatchObject({ max: 500, source: 'rule' });
  });
});

describe('rules', () => {
  it('finds the Uber post problems', () => {
    const t = ruleFlags(uber).map((f) => f.type);
    expect(t).toEqual(expect.arrayContaining(['onsite', 'pay_on_success', 'clone_big_app']));
  });
  it('does not flag video calls as onsite', () => {
    expect(ruleFlags('We do a weekly Zoom call on Mondays.').length).toBe(0);
  });
  it('does not flag Uber as a customer reference', () => {
    expect(ruleFlags('Our clients include Uber and two local banks.').length).toBe(0);
  });
});

describe('decision', () => {
  it('skips on verified hard no even with a big budget', () => {
    const post = 'Need a booking site. Budget $9,000. You must work on-site at our clinic three days a week.';
    const raw = { budget: { quote: 'Budget $9,000', per: 'project' }, components: [{ type: 'booking', count: 1, quote: 'Need a booking site' }], flags: [] };
    const r = triage(raw, post, { amount: 3, currency: 'USD' }, P);
    expect(r.decision.verdict).toBe('SKIP');
    expect(r.facts.flags.map((f) => f.type)).toContain('onsite');
  });
  it('pays on a clean, well-priced lead', () => {
    const post = 'We need a 5 page site for our bakery with a contact form. Budget is $1,500. Weekly Zoom call is fine.';
    const raw = { budget: { quote: 'Budget is $1,500', per: 'project' }, components: [{ type: 'page', count: 5, quote: 'a 5 page site for our bakery' }], flags: [] };
    const r = triage(raw, post, { amount: 2.4, currency: 'USD' }, P);
    expect(r.decision.verdict).toBe('PAY');
  });
  it('close when no budget', () => {
    const post = 'Need a website for my yoga studio with class booking.';
    const raw = { budget: null, components: [{ type: 'booking', count: 1, quote: 'with class booking' }], flags: [] };
    expect(triage(raw, post, { amount: 2, currency: 'USD' }, P).decision.verdict).toBe('CLOSE');
  });
  it('reads TWD budgets from Chinese', () => {
    const post = '台中潭子，想做一個點數回饋平台。會員註冊登入、消費累積點數、點數兌換，還要一個後台給店家看報表。預算 10–15 萬。';
    const raw = {
      budget: { quote: '預算 10–15 萬', per: 'project' },
      components: [
        { type: 'points', count: 1, quote: '消費累積點數' },
        { type: 'login', count: 1, quote: '會員註冊登入' },
        { type: 'admin_dashboard', count: 1, quote: '還要一個後台給店家看報表' },
      ],
      flags: [],
    };
    const r = triage(raw, post, { amount: 945, currency: 'TWD' }, P);
    expect(r.facts.budget).toMatchObject({ min: 100000, max: 150000, currency: 'TWD' });
    expect(r.decision.verdict).toBe('PAY');
  });
  it('parses fenced json', () => expect(parseJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
});

describe('negation', () => {
  it('no need to come to the shop is not onsite', () => {
    expect(ruleFlags('全程線上討論就可以，不用到店裡。').length).toBe(0);
    expect(ruleFlags('No need to come to our office, everything is remote.').length).toBe(0);
  });
  it('drops a model onsite flag whose quote says the opposite', () => {
    const post = '全程線上討論就可以，不用到店裡。預算 4 萬。';
    const r = triage({ budget: null, components: [], flags: [{ type: 'onsite', quote: '不用到店裡' }] }, post, { amount: 200, currency: 'TWD' }, P);
    expect(r.facts.flags.length).toBe(0);
    expect(r.dropped[0].why).toBe('quote says the opposite');
  });
});

describe('sentences', () => {
  it('does not split decimals', async () => {
    const { sentences } = await import('../src/core/pipeline.js');
    expect(sentences('我們預算 2.5 萬，先做一間。時間一週。')).toEqual(['我們預算 2.5 萬,先做一間。', '時間一週。']);
  });
});

describe('simplified quotes', () => {
  it('converts a Simplified copy of a Traditional quote back and keeps the flag', () => {
    const post = '高雄民宿官網加線上訂房。預算 7 萬。需要工程師每週到民宿現場測試跟安裝設備，大概要去 4 次。';
    const raw = { budget: null, components: [], flags: [{ type: 'onsite', quote: '需要工程师每周到民宿现场测试跟安装设备' }] };
    const r = triage(raw, post, { amount: 200, currency: 'TWD' }, P);
    expect(r.facts.flags.map((f) => f.type)).toContain('onsite');
    expect(r.facts.flags[0].quote).toBe('需要工程師每週到民宿現場測試跟安裝設備');
    expect(r.decision.verdict).toBe('SKIP');
  });
});

describe('round 1 review fixes', () => {
  it('on-site negations are not flagged', () => {
    for (const t of ['This is not an on-site job.', 'Remote only, never on site.', 'Fully remote, no on-site visits required.', 'On-site not required.']) expect(ruleFlags(t).length).toBe(0);
  });
  it('suggested price sits inside the client range', async () => {
    const post = 'We need a 5-page site for our firm. Budget is $1,800.';
    const raw = { budget: { quote: 'Budget is $1,800', per: 'project' }, components: [{ type: 'page', count: 5, quote: 'a 5-page site for our firm' }], flags: [] };
    const d = triage(raw, post, { amount: 2, currency: 'USD' }, P).decision;
    expect(d.suggestedQuote).toBe(1800);
  });
  it('drafts lose invented attachments and keep full-width punctuation', async () => {
    const { finishDraft } = await import('../src/core/draft.js');
    const post = '想做一個預約網站。預算 3 萬。';
    const raw = { budget: { quote: '預算 3 萬', per: 'project' }, components: [{ type: 'booking', count: 1, quote: '想做一個預約網站' }], flags: [] };
    const d = triage(raw, post, { amount: 200, currency: 'TWD' }, P).decision;
    const f = finishDraft('您好，我看到您想做预约网站。我附上了作品连结。报价 {{PRICE}}。', post, d);
    expect(f.text).toContain('您好，');
    expect(f.text).not.toContain('附上');
    expect(f.removed.length).toBe(1);
  });
});
