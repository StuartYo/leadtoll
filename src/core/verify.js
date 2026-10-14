// The verifier: a claim from the model only counts if its quote is really in the post.

export function norm(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”"「」『』'‘’`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?。，；：！？、-]+|[\s.,;:!?。，；：！？、-]+$/g, '')
    .trim();
}

/** True when every piece of the quote (split on "..." / "…") appears in the post, in order. */
export function quoteInPost(quote, post) {
  const q = norm(quote);
  if (q.length < 2) return false;
  const p = norm(post);
  const parts = q.split(/\s*(?:\.\.\.|…)\s*/).filter((x) => x.length >= 2);
  if (!parts.length) return false;
  let from = 0;
  for (const part of parts) {
    const i = p.indexOf(part, from);
    if (i < 0) return false;
    from = i + part.length;
  }
  return true;
}

/** Find where the quote sits in the original post, for highlighting. Returns [start, end] or null. */
export function locate(quote, post) {
  const q = String(quote ?? '').normalize('NFKC').trim();
  if (!q) return null;
  const P = String(post).normalize('NFKC');
  const i = P.toLowerCase().indexOf(q.toLowerCase());
  if (i >= 0) return [i, i + q.length];
  const first = q.split(/\.\.\.|…/)[0].trim();
  const j = first.length >= 2 ? P.toLowerCase().indexOf(first.toLowerCase()) : -1;
  return j >= 0 ? [j, j + first.length] : null;
}
