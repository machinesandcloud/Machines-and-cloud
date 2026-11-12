// Shared inbound SMS keyword classifier for the platform line and supported shop numbers.
// CTIA Messaging Principles (May 2023) 5.1.3: opt-out validity "should not be impacted by any
// de minimis variances ... such as capitalization, punctuation, or any letter-case sensitivities",
// and normal language ("stop", "end", "unsubscribe", "cancel", "quit", "please opt me out") should be
// acted on "except where a specific word can result in unintentional opt-out".
//
// Rule (conservative; an HVAC/plumbing customer's "It quit" or "make it stop" must stay a conversation):
// 1. Normalize: drop a trailing "Sent from my iPhone"-style signature line; Unicode NFKD, drop accents,
//    uppercase; every character that is not a letter, digit or in-word apostrophe becomes a space;
//    collapse spaces; join OPT [ME] OUT -> OPTOUT and STOP ALL -> STOPALL; a message made only of
//    single letters is joined ("S T O P" -> STOP).
// 2. Exact keyword: the whole normalized message is one keyword. STOP list below, plus CANCELAR and
//    BAJA (Spanish; recognized but not part of the published keyword list). CANCEL, END, QUIT, REVOKE
//    and CANCELAR count ONLY as the whole message ("cancel my appointment", "it quit", "quit working").
// 3. Whole-message opt-out phrases (DON'T TEXT ME, DO NOT CONTACT ME, REMOVE MY NUMBER, TAKE ME OFF
//    YOUR LIST, NO MORE TEXTS, NO MÁS MENSAJES, DEJEN DE ESCRIBIRME, ...), optionally with a leading
//    PLEASE and trailing courtesy words or AGAIN/ANYMORE.
// 4. Short polite opt-out: at most 6 words, at least one strong word (STOP, STOPALL, UNSUBSCRIBE,
//    OPTOUT, ALTO, PARAR, BAJA), every other word from a strict courtesy/object list (PLEASE, ME,
//    TEXTING, MESSAGES, NOW, THANKS, WRONG NUMBER, POR FAVOR, ...). IT, THE, MY, ALL, THIS and MAS are
//    deliberately NOT courtesy words: "stop it", "the stop", "my stop", "Mas alto" stay conversations.
// START and HELP are exact only ("help me", "help, my pipe burst" are conversations).
// Consent-granting replies (YES, SI, SÍ) are deliberately not handled here and stay exact.
export const SMS_KEYWORDS = Object.freeze({
  stop: Object.freeze(['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','REVOKE','OPTOUT','ALTO','PARAR']),
  start: Object.freeze(['START','UNSTOP','EMPEZAR']), help: Object.freeze(['HELP','INFO','AYUDA'])
});
const EXTRA_STOP = new Set(['CANCELAR','BAJA']);
const STRONG = new Set(['STOP','STOPALL','UNSUBSCRIBE','OPTOUT','ALTO','PARAR','BAJA']);
const COURTESY = new Set([
  'PLEASE','PLS','PLZ','NOW','JUST','ME','TEXT','TEXTS','TEXTING','MESSAGE','MESSAGES','MESSAGING','SENDING','SEND','CONTACTING',
  'THANKS','THANK','YOU','THX','TY','OK','OKAY','WRONG','NUMBER',
  'POR','FAVOR','YA','GRACIAS','MENSAJES','TEXTOS'
]);
const PHRASE_TAIL = new Set(['PLEASE','PLS','PLZ','NOW','THANKS','THANK','YOU','THX','TY','AGAIN','ANYMORE','EVER','POR','FAVOR','GRACIAS','YA']);
const PHRASES = [
  /^(?:DONT|DON'T|DO NOT) (?:TEXT|MESSAGE|CONTACT|TEXTING|MESSAGING) ME$/,
  /^(?:QUIT|STOP) (?:TEXTING|MESSAGING|CONTACTING) ME$/,
  /^REMOVE (?:ME|MY NUMBER)(?: FROM (?:YOUR|THE|THIS) (?:LIST|TEXTS|MESSAGES))?$/,
  /^TAKE (?:ME|MY NUMBER) OFF (?:YOUR |THE |THIS )?LIST$/,
  /^UNSUBSCRIBE (?:ME )?FROM (?:YOUR|THE|THIS) LIST$/,
  /^NO MORE (?:TEXTS|MESSAGES)$/,
  /^NO (?:QUIERO )?MAS MENSAJES$/,
  /^NO ME (?:ESCRIBAN|MANDEN|ENVIEN|TEXTEEN)(?: MAS)?(?: MENSAJES)?$/,
  /^DEJEN DE (?:ESCRIBIRME|ESCRIBIR|MANDARME MENSAJES|ENVIARME MENSAJES|MANDAR MENSAJES|ENVIAR MENSAJES)$/,
];
const MAX_PHRASE_WORDS = 6;
const SIGNATURE = /^\s*(?:sent from my\b.{0,40}|sent from (?:yahoo|outlook|gmail|aol)\b.{0,40}|get outlook for\b.{0,40}|enviado desde mi\b.{0,40})\s*$/i;
export function normalizeSMSKeywordText(text) {
  const lines = String(text ?? '').slice(0, 1600).split(/\r?\n/);
  while (lines.length > 1 && (SIGNATURE.test(lines.at(-1)) || !lines.at(-1).trim())) lines.pop();
  const normal = lines.join(' ').normalize('NFKD').replace(/\p{M}+/gu, '').toUpperCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ').replace(/(^|\s)'+|'+(?=\s|$)/g, '$1')
    .replace(/\bOPT(?:\s+ME)?\s+OUT\b/g, 'OPTOUT').replace(/\bSTOP\s+ALL\b/g, 'STOPALL').replace(/\s+/g, ' ').trim();
  return /^(?:\p{L} ){2,}\p{L}$/u.test(normal) ? normal.replace(/ /g, '') : normal;
}
function phrase(words) {
  let start = 0, end = words.length;
  if (words[0] === 'PLEASE' || words[0] === 'PLS') start = 1;
  while (end > start + 1 && PHRASE_TAIL.has(words[end - 1])) end--;
  for (let cut = end; cut <= words.length; cut++) { const core = words.slice(start, cut).join(' '); if (PHRASES.some(rule => rule.test(core))) return true; }
  return false;
}
// Returns 'stop' | 'start' | 'help' | null. STOP wins over START and HELP.
export function classifySMSKeyword(text) {
  const normal = normalizeSMSKeywordText(text);
  if (!normal) return null;
  if (SMS_KEYWORDS.stop.includes(normal) || EXTRA_STOP.has(normal)) return 'stop';
  if (SMS_KEYWORDS.start.includes(normal)) return 'start';
  if (SMS_KEYWORDS.help.includes(normal)) return 'help';
  const words = normal.split(' ');
  if (phrase(words)) return 'stop';
  if (words.length <= MAX_PHRASE_WORDS && words.some(word => STRONG.has(word)) && words.every(word => STRONG.has(word) || COURTESY.has(word))) return 'stop';
  return null;
}
