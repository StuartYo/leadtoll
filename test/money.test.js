import { describe, it, expect } from 'vitest';
import { parseMoney, convert } from '../src/core/money.js';

describe('parseMoney', () => {
  const cases = [
    ['Budget: $500.', { min: 500, max: 500, currency: 'USD', per: 'project' }],
    ['budget is $1,200 fixed', { min: 1200, max: 1200, currency: 'USD', per: 'project' }],
    ["we've set aside around 2k for this", { min: 2000, max: 2000, currency: 'USD', per: 'project' }],
    ['$15-20/hr, about 40 hours', { min: 15, max: 20, currency: 'USD', per: 'hour' }],
    ['預算 3–5 萬', { min: 30000, max: 50000, currency: 'TWD', per: 'project' }],
    ['預算 10–15 萬，希望一個多月內上線', { min: 100000, max: 150000, currency: 'TWD', per: 'project' }],
    ['預算 3 萬以下', { min: null, max: 30000, currency: 'TWD', per: 'project' }],
    ['預算 2 萬', { min: 20000, max: 20000, currency: 'TWD', per: 'project' }],
    ['NT$30,000', { min: 30000, max: 30000, currency: 'TWD', per: 'project' }],
    ['US$ 500-800', { min: 500, max: 800, currency: 'USD', per: 'project' }],
  ];
  for (const [t, want] of cases) it(t, () => expect(parseMoney(t)).toEqual(want));
  it('ignores user counts', () => expect(parseMoney('we have 5,000 users')).toBeNull());
  it('picks budget not user count', () => expect(parseMoney('we have 5,000 users and a budget of $1,200')).toMatchObject({ min: 1200, max: 1200 }));
  it('converts', () => expect(Math.round(convert(100, 'USD', 'TWD'))).toBe(3150));
});

describe('parseMoney ranges with units on both ends', () => {
  it('3.5 萬到 4.5 萬', () => expect(parseMoney('預算大概 3.5 萬到 4.5 萬')).toMatchObject({ min: 35000, max: 45000, currency: 'TWD' }));
  it('$500 to $700', () => expect(parseMoney('Our budget is $500 to $700')).toMatchObject({ min: 500, max: 700, currency: 'USD' }));
});

describe('more money', () => {
  it('around 2k', () => expect(parseMoney('around 2k for this, maybe a bit more')).toMatchObject({ min: 2000, max: 2000 }));
  it('two grand', () => expect(parseMoney('Budget is about two grand, give or take')).toMatchObject({ min: 2000, max: 2000, currency: 'USD' }));
  it('1.5k-2k', () => expect(parseMoney('budget 1.5k-2k')).toMatchObject({ min: 1500, max: 2000 }));
});

describe('round 2 money', () => {
  it('一萬二', () => expect(parseMoney('預算一萬二')).toMatchObject({ min: 12000, max: 12000, currency: 'TWD' }));
  it('$25,000+', () => expect(parseMoney('$25,000+ budget')).toMatchObject({ min: 25000, max: null }));
  it('5000 NTD', () => expect(parseMoney('5000 NTD')).toMatchObject({ min: 5000, currency: 'TWD' }));
  it('per month', () => expect(parseMoney('$400-600 a month')).toMatchObject({ per: 'month' }));
});
