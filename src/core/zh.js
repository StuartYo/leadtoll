// Gemma 4 E2B sometimes answers a Traditional Chinese post in Simplified Chinese, even when it is
// copying a quote. OpenCC (open source, MIT/Apache-2.0) converts it back, character by character.
import * as OpenCC from 'opencc-js/cn2t';

const toTaiwan = OpenCC.Converter({ from: 'cn', to: 'tw' });
const toTaiwanPhrases = OpenCC.Converter({ from: 'cn', to: 'twp' });
const CJK = /[一-鿿]/;

export function hasCJK(s) {
  return CJK.test(String(s ?? ''));
}

/** Simplified -> Traditional (Taiwan). Keeps the everyday 台 instead of 臺. */
export function toTW(s) {
  const t = String(s ?? '');
  return hasCJK(t) ? toTaiwan(t).replace(/臺/g, '台') : t;
}

/** True when the post is mostly Traditional Chinese (conversion changes under 5% of its Chinese characters). */
export function isTraditional(post) {
  const t = String(post ?? '');
  const cjk = (t.match(/[一-鿿]/g) || []).length;
  if (!cjk) return false;
  const c = toTW(t);
  let diff = 0;
  for (let i = 0; i < Math.min(t.length, c.length); i++) if (t[i] !== c[i]) diff++;
  return diff / cjk < 0.05;
}

/** For drafts: also swaps mainland words for Taiwan ones (軟件 -> 軟體). Not used for quote checks. */
export function toTWPhrases(s) {
  const t = String(s ?? '');
  return hasCJK(t) ? toTaiwanPhrases(t).replace(/臺/g, '台') : t;
}
