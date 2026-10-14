// Plain-text checks that run without any model. They are a backstop, not the main reader:
// they only fire on phrasings that are hard to misread.

const R = [
  ['onsite', /\b(on[- ]?site|in[- ]person|come (in )?to our (office|shop|store|factory)|at our (office|shop|factory|warehouse))\b|進廠|到場|駐點|現場安裝|來公司|到公司|到店|到我們(的)?辦公室/i],
  ['tos_grey', /phone farm|multi[- ]?account|(manage|run|warm up)\s+\d+\s+(instagram|ig|tiktok|facebook|fb|x|twitter|shopee)?\s*accounts|without (getting )?(flagged|banned|detected)|avoid (bans?|detection)|bypass (the )?(ban|detection|captcha)|fake reviews?|buy followers|群控|養號|防風控|避開.{0,6}(偵測|風控)|洗評論|假評論/i],
  ['pay_on_success', /(pay|paid|compensat\w*)[^.]{0,40}(after|once|when)[^.]{0,30}(launch|users|revenue|funded|funding|seed|round|profit)|equity[- ]only|revenue share only|rev[- ]share instead|上線後.{0,6}(才|再)付|賺錢後.{0,4}分潤/i],
  ['unpaid_work', /(unpaid|free|no[- ]pay)\s+(test|trial|sample)|(test|trial|sample)[^.]{0,60}\b(unpaid|not paid|for free)\b|paid (only )?if (we|you) (move forward|proceed|go ahead|hire)|免費試做|先做一個.{0,6}(試試|看看)再/i],
  ['off_platform', /\b(whatsapp|telegram|skype)\b[^.]{0,30}(me|us|contact|message)|(contact|message|text) (me|us) (on|via) (whatsapp|telegram|skype|line)|move to whatsapp|加\s*line|加賴/i],
  ['clone_big_app', /\b(like|clone of|similar to)\s+(uber|airbnb|amazon|tinder|doordash|instagram|facebook)\b|\b(an?|the)\s+(uber|airbnb|tinder)\s+for\b|類似\s*(uber|蝦皮|airbnb)/i],
];

// Things the freelancer does not build, by name. These come from the profile's "do not build" list.
const NO_GO = [
  ['no_code_platform', /(ragic|bubble\.io|airtable|glide|adalo|softr)[^.。]{0,40}(做|客製|公式|build|custom|develop|automat)|(做|客製|build|develop|customi[sz]e)[^.。]{0,20}(ragic|bubble\.io|airtable|glide|adalo|softr)/i],
  ['shopify_theme', /\bliquid\b|shopify (theme|佈景)|佈景主題/i],
  ['game', /\b(mobile|ios|android|unity)\s+game\b|手機遊戲|手遊/i],
  ['hardware', /\b(plc|machines?|sensors?)\b[^.]{0,40}(connect|install|integrat)|機台|硬體安裝/i],
];

export function sentenceList(post) {
  return String(post ?? '').normalize('NFKC').split(/(?<=[.!?。！？\n])(?!\d)\s*/).map((s) => s.trim()).filter(Boolean);
}

// "No need to come to the shop" is the opposite of an on-site requirement.
export const NEGATED_ONSITE = /(不用|不需要?|不必|無須|免)[^，。,.]{0,6}(到|來|跑|進|去)|no need to (come|visit|be)|(don't|do not|won't|will not) (need|have) to (come|visit|be)|never (need|have) to (come|visit)|not required to (come|visit|be)|\b(not|never|no)\b[^.,;]{0,25}\bon[- ]?site\b|\bon[- ]?site\b[^.,;]{0,25}\b(not required|not needed|isn't required|is not required|optional)\b|\b(remote only|fully remote|100% remote)\b/i;

/** Returns [{type, quote, source:'rule'}]. Looks at each sentence and at each pair of neighbours. */
export function ruleFlags(post) {
  const ss = sentenceList(post);
  const windows = [...ss, ...ss.slice(0, -1).map((s, i) => s + ' ' + ss[i + 1])];
  const out = [];
  for (const [type, re] of R) {
    const s = windows.find((x) => re.test(x) && !(type === 'onsite' && NEGATED_ONSITE.test(x)));
    if (s) out.push({ type, quote: s, source: 'rule' });
  }
  return out;
}

export function ruleNoGo(post) {
  const ss = sentenceList(post);
  const out = [];
  for (const [type, re] of NO_GO) {
    const s = ss.find((x) => re.test(x));
    if (s) out.push({ type, count: 1, quote: s, source: 'rule' });
  }
  return out;
}

// A real quote can still carry the wrong label ("mobile responsive design" tagged as a Shopify theme).
// For the labels that end a lead, the quote must also contain a word that fits the label.
export const LABEL_WORDS = {
  onsite: /office|site|visit|in[- ]person|come|local|premises|store|shop|factory|clinic|warehouse|辦公室|現場|到場|進廠|門市|公司|店|駐點/i,
  tos_grey: /account|farm|review|ban|detect|flag|bot|follower|captcha|帳號|風控|群控|評論|偵測|養號/i,
  pay_on_success: /after|once|when|equity|share|launch|fund|seed|round|revenue|profit|上線|分潤|賺|募資/i,
  unpaid_work: /unpaid|free|trial|sample|test|not paid|paid if|免費|試做|試用/i,
  rush: /urgent|asap|rush|immediately|tomorrow|tonight|this week|next week|by (monday|tuesday|wednesday|thursday|friday)|b\d+\s*days?b|急|盡快|馬上|明天|今天|這週|下週|本週|\d+\s*天內/i,
  unlimited_revisions: /unlimited|as many (changes|revisions)|endless|revisions?|無限|改到滿意|不限次數/i,
  native_app: /\bios\b|android|app store|play store|native|mobile app|手機\s*app|上架|原生/i,
  game: /game|遊戲|手遊/i,
  shopify_theme: /shopify|liquid|佈景/i,
  no_code_platform: /ragic|bubble|airtable|glide|adalo|softr|no-?code|無程式碼/i,
  erp_suite: /erp|crm|進銷存|部門/i,
  hardware: /machine|device|sensor|hardware|plc|install|機台|硬體|安裝|設備/i,
};
