// Every customer-facing voice greeting, and the first text reply in an SMS conversation, says the
// customer is dealing with an automated assistant (Anthropic Usage Policy: disclose AI at the start of
// the session; Customer Agreement §8; legal precondition P6).
//
// SMS cost: both intros are plain GSM-7 (no apostrophe, accent or "¿"), so they never switch a reply
// to UCS-2 by themselves. Each adds len(intro)+1 characters, only to the first reply per conversation.
// Rev 2 (QA Q10): a shop name that is not GSM-7 ("Martínez Plumbing", a curly apostrophe) is left out
// of the intro, which would otherwise switch a GSM-7 reply to UCS-2 (+2 segments). Worst case: +1.

const shopName = c => String(c?.business?.name || "").trim();

// "This is Bayou Air's automated front desk assistant." (or "the automated..." without a name)
export const automatedDesk = c => shopName(c) ? `${shopName(c)}'s automated front desk assistant` : "the automated front desk assistant";

// Spoken greeting used by the legacy assistant, the assistant-request override and the managed assistant.
// Spanish shops add one Spanish sentence (glossary: formal usted, "le atiende", never "Soy la recepción").
export function voiceGreeting(c, ask = "How can I help you today?") {
  return `Thanks for calling. This is ${automatedDesk(c)}.${c?.business?.spanish ? " Hablamos español: le atiende un asistente automatizado." : ""} ${ask}`;
}

// Conservative Spanish signal for the first inbound text (accents/ñ/¿/¡ or common words).
const SPANISH = /[¿¡ñáíóú]|\b(hola|buen[oa]s|necesito|quiero|tengo|puede[ns]?|usted|gracias|por favor|ayuda|cita|cu[aá]nto|d[ií]as?|ma[ñn]ana|aire acondicionado|fuga|agua)\b/i;
export const looksSpanish = text => SPANISH.test(String(text || ""));

const GSM7 = new Set("@£$¥èéùìòÇ\nØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");
export const isGSM7 = text => [...String(text || "")].every(ch => GSM7.has(ch));
export function automatedSMSIntro(c, language = "en") {
  const raw = shopName(c), name = isGSM7(raw) ? raw : "";
  if (language === "es") return name ? `Asistente automatizado de ${name}.` : "Asistente automatizado.";
  return name ? `Automated assistant for ${name}.` : "Automated assistant.";
}

// Prefix the intro on the first reply only. `first` is decided by the caller from its own history.
export const withAutomatedIntro = (c, text, { first, language = "en" } = {}) => first ? `${automatedSMSIntro(c, language)}\n${text}` : text;
