// Plain-language opt-outs in inbound texts (FCC 24-24: revocation "in any reasonable manner"; CTIA 5.1.3;
// legal precondition P9). Runs only on messages that the keyword matcher did not already treat as STOP.
//
// Two levels:
// - "certain": the sentence asks to stop TEXTS/MESSAGES to this person. It is applied like STOP.
// - "review": an opt-out word without a clear texting object, or a guarded case. It is never applied
//   automatically; it is queued for an operator, who can apply it with the apply_opt_out action.
// Ordinary booking language ("please cancel my visit", "can you stop by", "the leak won't stop",
// "end of the day works", "it quit working") matches neither level.

const fold = text => String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’ʼ]/g, "'").replace(/[​-‍﻿]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const TEXTS = "(?:texts?|text messages?|messages?|msgs?|sms|reminders?|notifications?)";
const ME = "(?:me|us|this number|my number|my phone)";
// Rev 2: plural only, for "stop the texts" ("stop the message from showing" is not a request about texts).
const TEXTS_PL = "(?:texts|text messages|messages|msgs|reminders|notifications)";
const CERTAIN = [
  // stop texting me / quit messaging me / stop sending me texts / stop sending these messages
  new RegExp(`\\b(?:stop|stp|sotp|quit|cease|discontinue)\\s+(?:texting|textin'?|txting|txtin'?|messaging|messagin'?|sending\\s+(?:me\\s+|us\\s+)?(?:any\\s+more\\s+|anymore\\s+|these\\s+|the\\s+|your\\s+|all\\s+(?:the\\s+|these\\s+)?)?${TEXTS})\\b`),
  // do not text me / don't message this number / never text me again
  new RegExp(`\\b(?:do not|dont|don't|never|no longer)\\s+(?:text|message|txt|sms)\\s+${ME}\\b`),
  // I don't want (any more) texts / no quiero mas mensajes (accent-folded)
  new RegExp(`\\b(?:i )?(?:do not|dont|don't|no longer) want (?:to (?:get|receive) )?(?:any ?more |your |these |any )?${TEXTS}\\b`),
  // Rev 2 recall: I want to stop receiving texts / stop getting these messages
  new RegExp(`\\b(?:stop|quit)\\s+(?:receiving|getting)\\s+(?:any\\s+more\\s+|these\\s+|the\\s+|your\\s+|all\\s+(?:the\\s+|these\\s+)?)?${TEXTS}\\b`),
  // Rev 2 recall: stop the texts / stop with the texts / stop all these messages
  new RegExp(`\\b(?:stop|stp|end)\\s+(?:with\\s+)?(?:the|these|those|all|all the|all these|your)\\s+${TEXTS_PL}\\b`),
  // Rev 2 recall: please don't send me any more texts / never send me messages again
  new RegExp(`\\b(?:do not|dont|don't|never|no longer)\\s+send\\s+(?:me|us|this number)\\s+(?:any ?more\\s+|anymore\\s+|these\\s+|the\\s+|your\\s+|any\\s+)?${TEXTS}\\b`),
  // Rev 2 recall: stop contacting me
  /\b(?:stop|quit)\s+contacting\s+(?:me|us|this number|my number)\b/,
  // Rev 2 recall: the whole message is "unsubscribe me" / "opt me out" (with an optional please)
  /^(?:please |pls )?(?:unsubscribe me|opt me out|opt out me|remove me|take me off)(?: please| pls| now| thanks| thank you)?[.!]*$/,
  // Rev 3 (QA r2 B4, production STOP_PHRASE parity): "Remove me please, I sold the house" / "remove me, wrong person"
  /^(?:please |pls )?(?:remove me|take me off)(?: please| pls| now)?\s*[,.!;:-]/,
  // no more texts (not "I got no more messages")
  new RegExp(`(?:^|[.!,;:] ?|please |pls |and )no more ${TEXTS}\\b`),
  // unsubscribe me / opt me out of these texts / opt out of texts
  new RegExp(`\\b(?:unsubscribe|opt(?:[ -]?me)?[ -]?out)\\b(?:\\s+(?:me|us))?\\s+(?:from|of)\\s+(?:all\\s+|these\\s+|your\\s+|the\\s+|this\\s+)?(?:${TEXTS}|text(?:ing)?\\s+list|list|sms\\s+list)\\b`),
  // remove me from your (texting) list / take my number off the list
  /\b(?:remove|take)\s+(?:me|my (?:phone )?number|this number)\s+(?:from|off(?: of)?)\s+(?:your|the|this|ur)\s+(?:text(?:ing)?\s+|sms\s+|contact\s+|mailing\s+)?list\b/,
  // cancel the texts / cancel these reminders (not "cancel my visit")
  new RegExp(`\\bcancel\\s+(?:the|these|all|all the|your|my)\\s+${TEXTS}\\b`),
  // Spanish (folded): dejen de mandarme mensajes / no me manden mas mensajes / ya no quiero recibir mensajes / darme de baja
  // Rev 3 (QA r2): a texting object or the end of the message is required ("dejen de mandarme tecnicos" is not an opt-out)
  /\bdej(?:e|en|a) de (?:mandar(?:me)?|enviar(?:me)?|escribir(?:me)?|textear(?:me)?)(?: (?:mas )?(?:mensajes|textos)\b|\s*(?:por favor|ya)?\s*[.!]*$)/,
  /\bno me (?:manden|envien|escriban|texteen|mande|envie|escriba)(?: mas)? (?:mensajes|textos)\b/,
  /\b(?:ya )?no quiero (?:recibir )?(?:mas )?(?:mensajes|textos)\b/,
  // Rev 3 (QA r2): "dar de baja mi aire viejo" is not about texts; require darme, a number/list/messages object or the end
  /\bdarme de baja\b|\bdar de baja (?:mi (?:numero|telefono|celular)|de (?:la|su|esta) lista|de (?:los )?mensajes)\b|\bdar(?:me)? de baja\s*(?:por favor)?\s*[.!]*$/,
  // Rev 2 recall (Spanish review): no mas mensajes / quitenme de la lista / borren mi numero / ya no me escriban
  /(?:^|[.!,;:] ?|por favor |y )no mas (?:mensajes|textos)\b/,
  /\b(?:quit|saqu|borr|elimin)(?:enme|eme|ame)\s+de\s+(?:la|su|sus|esta|esa)\s+lista\b/,
  // Rev 3 (QA r2): "borre mi numero de la factura" is not an opt-out; require the end of the message or a list
  /\b(?:borr|elimin)(?:en|e)\s+mi\s+(?:numero|telefono|celular)(?:\s+de\s+(?:la|su|sus|esta)\s+lista\b|\s*(?:por favor)?\s*[.!]*$)/,
  /\b(?:ya no|no) me (?:escriban|texteen)(?: mas)?\b/,
];
// Guards that turn a "certain" match into "review": complaints about the past, time preferences,
// negated wishes and reported speech.
const GUARDS = [
  /\b(?:why|did|didn't|didnt|have|has|had|was|were|when)\b[^.?!]{0,24}\b(?:stop(?:ped)?|quit)\s+(?:texting|messaging|sending|receiving|getting|contacting)/,
  // Rev 2: an instruction about someone else ("tell the supplier to stop contacting me")
  /\b(?:tell|ask)\s+(?:the|my|him|her|them|your)\b[^.?!]{0,30}\bto\s+(?:stop|quit)\b/,
  /\b(?:do not|dont|don't|never|not)\s+(?:want|need)\s+(?:you\s+|y'all\s+)?to\s+(?:stop|quit|cease)\b/,
  new RegExp(`\\b(?:text|message|txt)\\s+${ME}\\s+(?:before|after|until|till|at|between|during|today|tonight|right now|yet|while|on (?:mon|tue|wed|thu|fri|sat|sun))\\b`),
  /\b(?:he|she|they|the tech|my (?:wife|husband|son|daughter|tenant))\s+(?:said|says|asked|wants)\b/,
  // Rev 2 (QA): a third party is the object ("stop texting my husband, text me instead")
  /\b(?:stop|quit)\s+(?:texting|messaging)\s+(?:my|him|her|them|the (?:tenant|landlord|office))\b/,
  /\b(?:text|message)\s+me\s+instead\b/,
  // Rev 2 (QA): one item, not the channel ("don't text me the price, call me"; "do not text me the code")
  new RegExp(`\\b(?:do not|dont|don't|never)\\s+(?:text|message|txt|sms)\\s+${ME}\\s+(?:the|a|an|your|that|this)\\s+\\w+`),
  // Rev 2 (QA): one reminder ("cancel the reminder for tomorrow, I rescheduled")
  /\b(?:cancel|stop)\s+(?:the|my|this|that)\s+(?:reminder|text|message|notification)\s+(?:for|about|on|of)\b/,
  // Rev 2: a time or place preference for texts, not a stop ("don't send me texts before 8", "no me escriban antes de las 8")
  new RegExp(`\\b${TEXTS}\\s+(?:before|after|until|till|at (?!all)|between|during|while|on (?:mon|tue|wed|thu|fri|sat|sun))`),
  /\bno me (?:escriban|texteen)\b[^.?!]{0,16}\b(?:antes|despues|hasta|en el trabajo|de noche|en la noche|a esta hora)\b/,
  // Rev 2: a list that is not the texting list, or an old number being replaced
  /\blista de (?:espera|citas|precios|materiales)\b/,
  /\b(?:old|other|previous|viejo|anterior|otro)\s+(?:number|numero|telefono)\b|\b(?:numero|telefono) (?:viejo|anterior)\b/,
  // Rev 2: an explicit wish to keep texting ("no, keep texting me", "sigan mandando mensajes")
  /\b(?:keep|continue|please do)\s+(?:texting|messaging|sending)\b|\bsigan (?:mandando|enviando|escribiendo)\b/,
  // Rev 3 (QA r2 B3): negation before the verb ("please don't cancel the reminders", "don't stop texting me")
  /\b(?:do not|dont|don't|never|please don't|please do not)\s+(?:cancel|stop|quit|end|discontinue)\b/,
  // Rev 3: someone else's phone or a family member is the object ("stop sending reminders to my husband's phone")
  /\b(?:to|for|on)\s+(?:my|his|her|their|our)\s+\w+(?:'s)?\s+(?:phone|number|cell|celular)\b/,
  /\b(?:to|for)\s+(?:my|his|her|their)\s+(?:husband|wife|son|daughter|mom|mother|dad|father|tenant|landlord|partner|boss|kids?|parents?)\b/,
  /\ba (?:su|mi) (?:telefono|celular|numero)\b|\ba mi (?:esposo|esposa|hijo|hija|mama|papa)\b/,
  // Rev 3: "stop the texts from showing my address" (stop a property of the texts, not the texts)
  /\b(?:stop|keep)\s+(?:the|these|those|your|my)\s+\w+\s+from\b/,
  // Rev 3: a condition ("if you stop texting me reminders I'll forget")
  /\bif\s+(?:you|u|y'all|they)\s+(?:stop|quit|don't|dont)\b/,
  // Rev 3: Spanish relayed speech ("dile a mi esposo que deje de...", "mi hijo dijo que paren...")
  /\b(?:dile|digale|diganle|avisale|avisele|pidele|pidale)\s+a\b.*\bque\b|\b(?:dijo|dice|pidio|quiere)\s+que\b/,
  // Rev 3: "remove me from the 2pm slot", "take me off the waitlist" (not a texting list)
  /\b(?:remove|take)\s+me\s+(?:from|off(?: of)?)\s+(?:the|my|that|this|our)\s+(?!(?:text(?:ing)?\s+|sms\s+|contact\s+|mailing\s+)?list\b)/,
  // Rev 2: "no me mande al tecnico" (a person or thing, not messages)
  /\bno me (?:mande|manden|envie|envien)\s+(?:al|a la|el|la|los|las|un|una)\s+(?!mensajes?\b|textos?\b)/,
];
// Rev 2: the guards alone, for the legacy line's older phrase list (12-04 STOP_PHRASE), so "don't text me the
// price, call me" or "my husband said stop texting him" is not auto-applied there either.
export const optOutGuarded = text => { const t = fold(text); return !!t && GUARDS.some(re => re.test(t)); };
const REVIEW = /\b(?:unsubscribe|opt[ -]?out|optout|remove me|take me off|wrong number|not my number|leave me alone|harass\w*|stop contacting|tcpa|lawyer|attorney|de baja|numero equivocado|no me (?:escriban|manden|envien)|dejen de)\b/;

export function detectOptOutIntent(text) {
  const t = fold(text);
  if (!t || t.length > 1600) return null;
  // Rev 2: a short message with a word per sentence ("Stop. Texting. Me.") is also read without punctuation.
  const compact = t.split(" ").length <= 6 ? t.replace(/[.!,;:]+/g, " ").replace(/\s+/g, " ").trim() : t;
  const hit = CERTAIN.find(re => re.test(t) || re.test(compact));
  if (hit) return GUARDS.some(re => re.test(t)) ? { level: "review", reason: "guarded" } : { level: "certain", reason: "plain_language" };
  // Rev 2: a bare BASTA ("enough") is in the legacy keyword list only; on the other lines it goes to review.
  return REVIEW.test(t) || /^(?:ya )?basta[.! ]*$/.test(t) ? { level: "review", reason: "opt_out_word" } : null;
}
