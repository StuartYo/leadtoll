// Money parsing and conversion. All numbers that drive a verdict come from here,
// never straight from the model.

export const FX = { USD: 1, TWD: 31.5 }; // fixed demo rate, 1 USD = 31.5 TWD (Oct 2026, rounded)

export function convert(amount, from, to) {
  if (amount == null || !from || !to || from === to) return amount;
  if (!(from in FX) || !(to in FX)) return null;
  return (amount / FX[from]) * FX[to];
}

const WAN = /萬|万/;

function num(s) {
  if (s == null) return null;
  const t = String(s).replace(/[,，\s]/g, '');
  let m = t.match(/^(\d+(?:\.\d+)?)([kK])?$/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (m[2]) v *= 1000;
  return v;
}

/**
 * Read money out of a short piece of text (a verified quote).
 * Returns { min, max, currency, per } or null.
 * Handles: "$1,200", "US$ 500-800", "2k", "$15-20/hr", "預算 3–5 萬", "10~15萬", "3 萬以下", "NT$30,000".
 */
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1 };

export function parseMoney(text) {
  if (!text) return null;
  let s = String(text).normalize('NFKC');
  // "two grand" -> "$2000"
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|a|\d+(?:\.\d+)?)\s+grand\b/gi, (_, w) => '$' + Math.round((WORDS[w.toLowerCase()] ?? parseFloat(w)) * 1000));
  let currency = null;
  if (/NT\$|NTD|TWD|新台幣|台幣|元|萬|万/.test(s)) currency = 'TWD';
  if (/US\$|USD|\$|dollars?/i.test(s) && !/NT\$/.test(s)) currency = currency === 'TWD' && /萬|元/.test(s) ? 'TWD' : 'USD';
  const per = /\/\s*h(ou)?r|per hour|an hour|hourly|時薪|每小時/i.test(s) ? 'hour' : 'project';

  const range = /(\d[\d,]*(?:\.\d+)?\s*[kK]?)\s*(?:萬|万)?\s*(?:-|–|—|~|～|to|至|到)\s*\$?\s*(\d[\d,]*(?:\.\d+)?\s*[kK]?)/;
  const single = /(\d[\d,]*(?:\.\d+)?\s*[kK]?)/;
  // Only look at numbers attached to a money marker or the word budget, to avoid "5,000 users".
  const anchored = new RegExp(
    String.raw`(?:US\$|NT\$|\$|USD|TWD|預算|budget|pay|paying|set aside|cap|up to|最多)[^\d]{0,12}` + range.source +
    `|` + range.source + String.raw`\s*(?:萬|万|元|USD|TWD|dollars|/\s*h)` +
    String.raw`|(?:US\$|NT\$|\$|USD|TWD|預算|budget|set aside|up to|最多)[^\d]{0,12}` + single.source +
    `|` + single.source + String.raw`\s*(?:萬|万|元|USD|TWD|dollars|[kK]\b)`,
    'i'
  );
  const m = s.match(anchored);
  if (!m) return null;
  const g = m.slice(1).filter((x) => x !== undefined);
  const after = s.slice(m.index + m[0].length - 2, m.index + m[0].length + 4);
  const mult = WAN.test(m[0]) || WAN.test(after) ? 10000 : 1;
  let lo = num(g[0]);
  let hi = g.length > 1 ? num(g[1]) : null;
  if (lo == null) return null;
  lo *= mult;
  if (hi != null) hi *= mult;
  // "2k" where the k was matched by the unit part of the pattern rather than the number.
  if (mult === 1 && /\d\s*[kK]\b/.test(m[0])) {
    if (lo < 1000) lo *= 1000;
    if (hi != null && hi < 1000) hi *= 1000;
  }
  let min = lo, max = hi ?? lo;
  if (hi == null) {
    if (/以下|以內|under|below|up to|max|最多|at most|or less/i.test(s)) min = null;
    else if (/以上|over|at least|from|起/i.test(s)) max = null;
  }
  if (min != null && max != null && min > max) [min, max] = [max, min];
  return { min, max, currency: currency || 'USD', per };
}
