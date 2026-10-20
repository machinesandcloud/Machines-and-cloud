// Client config: the one record that describes a shop's front desk, plus the prompt built from it.

export const PLANS = {
  starter: { name: "Starter", price: 99, minutes: 150, texts: 500, leadPlatforms: false, followUp: false, software: ["google"] },
  growth: { name: "Growth", price: 249, minutes: 600, texts: 1500, leadPlatforms: true, followUp: true, software: ["google", "jobber", "housecall"] },
  pro: { name: "Pro", price: 449, minutes: 1500, texts: 5000, leadPlatforms: true, followUp: true, software: ["google", "jobber", "housecall"] },
};

export const ACTIVE = ["testing", "live"];
export const STATUSES = ["new", "building", "testing", "live", "paused", "cancelled"];

export const DATA_POLICY = "Your customers' names, numbers, and conversations belong to your shop. Machines & Cloud uses them only to run your front desk, never to train or inform another shop's desk, and never sells or shares them. You can ask for an export at any time, and everything is deleted on request after you cancel.";
export const CONSENT_LINE = "You'll get appointment texts from {name} at this number. Reply STOP any time to end them.";
export const consentLine = (c) => CONSENT_LINE.replace("{name}", c.business?.name || "us");
export const policyUrls = (slug, site = process.env.URL || "https://machinesandcloud.com") => ({ privacy: `${site}/policy?c=${slug}`, terms: `${site}/policy?c=${slug}&page=terms` });

export const DEFAULT_WINDOWS = ["8 to 12", "12 to 5"];
export const DEFAULT_NEVER = [
  "Quote a price the owner has not published",
  "Promise an exact arrival time; offer the arrival windows only",
  "Pretend to be a person",
  "Give advice on gas, electrical, or safety beyond: leave the area if there is a gas smell or fire, call 911, then call us",
];
export const DEFAULT_HANDOFF = ["Complaints about past work", "Warranty questions", "Anything about a bill or refund", "Commercial or large projects"];
export const ACK_MINUTES = [5, 10, 15, 30];

// Emergency tiers by trade. Tier 0 is life safety (safety script, no intake beyond phone and
// address, emergency chain). Tier 1 is same day (a "today" lead, the after-hours fee quoted outside
// hours); with an infant, elderly, or medically dependent person in the home a Tier 1 becomes Tier 0.
// Tier 2 is everything else: next available window. The owner edits all three.
const TIER0_COMMON = ["Gas smell", "Carbon monoxide alarm", "Smoke or fire", "Sparks or a burning smell from the panel or an outlet", "Sewage flooding a living space"];
export const EMERGENCY_TIERS = {
  hvac: { tier0: TIER0_COMMON, tier1: ["No cooling when the forecast high is 90°F or more", "No cooling with an infant, elderly, or medically dependent person in the home", "No heat when it is at or below freezing outside", "Water pouring from the air handler"] },
  plumbing: { tier0: TIER0_COMMON, tier1: ["Uncontrolled water (a burst pipe, a leak that will not stop)", "No water in the house", "Sewage backup", "Leaking water heater", "No hot water with an infant, elderly, or medically dependent person in the home"] },
  electrical: { tier0: TIER0_COMMON, tier1: ["Loss of power from the home's own system, not a utility outage", "A hot outlet, switch, or breaker", "Partial power or flickering across the house", "Exposed or damaged wiring"] },
  roofing: { tier0: TIER0_COMMON, tier1: ["Active leak during rain", "Storm or tree damage with the interior exposed", "Tarping after hail or wind"] },
  cleaning: { tier0: TIER0_COMMON, tier1: [] },
  other: { tier0: TIER0_COMMON, tier1: [] },
};
export function tradeKey(trade) {
  const t = String(trade || "").toLowerCase();
  if (/hvac|air|cool|heat|a\/c|ac\b/.test(t)) return "hvac";
  if (/plumb|drain|water heater|sewer/.test(t)) return "plumbing";
  if (/electr/.test(t)) return "electrical";
  if (/roof/.test(t)) return "roofing";
  if (/clean|maid|janitor/.test(t)) return "cleaning";
  return "other";
}
export function defaultEmergencies(trade, script = "") {
  const d = EMERGENCY_TIERS[tradeKey(trade)] || EMERGENCY_TIERS.other;
  return { tier0: d.tier0.slice(), tier1: d.tier1.slice(), tier2: "Everything else: offer the next available window.", script: String(script || "") };
}
// Accepts the old free-text string or a partial object; always returns the full shape.
export function normalizeEmergencies(v, trade) {
  if (!v || typeof v === "string") return defaultEmergencies(trade, v || "");
  const d = defaultEmergencies(trade);
  const list = (x) => (Array.isArray(x) ? x : String(x || "").split(/\n+/)).map((y) => String(y).trim().slice(0, 160)).filter(Boolean).slice(0, 20);
  return { tier0: v.tier0 !== undefined ? list(v.tier0) : d.tier0, tier1: v.tier1 !== undefined ? list(v.tier1) : d.tier1, tier2: typeof v.tier2 === "string" && v.tier2.trim() ? v.tier2.trim().slice(0, 200) : d.tier2, script: String(v.script || "").slice(0, 500) };
}

export function newClient({ slug, ownerKey, owner, business }) {
  return {
    slug, ownerKey, status: "new", plan: "growth",
    createdAt: new Date().toISOString(),
    owner: { name: "", email: "", phone: "", backupPhone: "", ...owner },
    business: { name: "", website: "", trade: "", city: "Houston", serviceArea: [], notServed: [], hours: "", afterHours: "", spanish: true, licenses: "", legal: {}, ...business },
    services: [], fees: [], windows: DEFAULT_WINDOWS.slice(),
    rules: { never: DEFAULT_NEVER.slice(), handoff: DEFAULT_HANDOFF.slice(), emergencies: defaultEmergencies(business?.trade), ackMinutes: 10, callbackHours: "within 30 minutes", callbackAfterHours: "by 8 am tomorrow", bypass: [] },
    digest: { text: true },
    faq: [], leadSources: [], software: "google",
    phone: { businessNumber: "", twilioNumber: "", forwarding: "missed", carrier: "other", transferTo: "", voiceForwardTo: "", textBack: true, tenDlc: "not_started" },
    voice: { provider: "none" }, provision: { status: "pending", steps: {} },
    calendar: { provider: "none" }, billing: { status: "none" },
    build: { status: "pending", notes: "", sourcePages: [] },
    widget: { greeting: "", allowedOrigins: [] },
    summary: "",
  };
}

// Numbers that would send a call or alert back into the front desk.
export function loopCheck(c) {
  const p = c.phone || {}, o = c.owner || {};
  const same = (a, b) => a && b && a === b;
  if (same(o.phone, p.twilioNumber)) return { field: "owner.phone", message: "Your cell cannot be the front desk number." };
  if (o.backupPhone && (same(o.backupPhone, p.businessNumber) || same(o.backupPhone, p.twilioNumber) || same(o.backupPhone, o.phone))) return { field: "owner.backupPhone", message: "The backup number must be a different phone from your cell, your business line, and the front desk number." };
  if (p.forwarding === "all" && p.transferTo && same(p.transferTo, p.businessNumber)) return { field: "phone.transferTo", message: "With all calls forwarded, transfers must go to a phone that is not the forwarded line, or every transfer comes straight back to the front desk. Leave it blank and the front desk takes a message and promises a callback instead." };
  for (const n of c.rules?.bypass || []) {
    if (same(n, p.businessNumber) || same(n, p.twilioNumber) || same(n, o.phone)) return { field: "rules.bypass", message: "The always-ring-through list is for customers' numbers, not your business line, the front desk number, or your cell." };
  }
  return null;
}

// What the browser widget on the client's site may know.
export function publicView(c) {
  return {
    slug: c.slug, status: c.status,
    name: c.business?.name || "Front desk",
    greeting: c.widget?.greeting || `Hi, this is the ${c.business?.name || "front desk"}. What can we help with today?`,
    spanish: !!c.business?.spanish,
    businessNumber: c.phone?.businessNumber || "",
  };
}

// What the owner portal sees (no secrets beyond their own key).
export function ownerView(c) {
  const { calendar, billing, voice, ...rest } = c;
  rest.rules = { ...(c.rules || {}), emergencies: normalizeEmergencies(c.rules?.emergencies, c.business?.trade) };
  return { ...rest, calendar: { provider: calendar?.provider || "none", connected: !!calendar?.google?.refreshToken }, billing: { status: billing?.status || "none", plan: c.plan, trialEnd: billing?.trialEnd || null }, voice: { provider: voice?.provider || "none", ready: !!voice?.assistantId, detached: !!voice?.detached } };
}

const list = (arr) => (arr && arr.length ? arr.map((x) => (typeof x === "string" ? x : `${x.label}: ${x.amount}${x.note ? " (" + x.note + ")" : ""}`)).join("; ") : "none listed");

/**
 * The front desk prompt for a real client, by channel: web, sms, test, voice.
 * extra.bookings: this customer's upcoming visits (sms channel), used for confirm and reschedule by reply.
 */
export function buildSystemPrompt(c, channel = "web", extra = {}) {
  const b = c.business || {};
  const owner = c.owner?.name || "the owner";
  const r = c.rules || {};
  const fees = c.fees?.length ? c.fees.map((f) => `${f.label}: ${f.amount}${f.note ? " (" + f.note + ")" : ""}`).join("; ") : "no published prices; every price is confirmed on site";
  const faq = c.faq?.length ? c.faq.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n") : "";
  const channelNote = channel === "sms"
    ? "You are texting. The customer's phone number is the number they are texting from, so never ask for it; pass it to the tools as given in the conversation or leave it empty and it is filled in. Keep every message under 300 characters, one question at a time, no formatting, no links unless asked. Never write notes to yourself; every sentence you write is sent to the customer. Never narrate what you still need; just ask the next question."
    : channel === "voice"
    ? "You are answering the phone. Short spoken sentences, one question at a time, no formatting."
    : channel === "test"
    ? "This is the owner's private test line. Behave exactly as you would with a real customer. Never write notes to yourself or narrate what you are about to do; every sentence you write is shown to the customer."
    : "You are the chat on the company website. Keep replies to one to three short sentences, one question at a time. Never write notes to yourself or narrate what you are about to do; every sentence you write is shown to the customer.";
  const upcoming = extra.bookings?.length
    ? `\nThis customer's upcoming visit(s): ${extra.bookings.map((v) => `ref ${v.id}, ${v.date || "date not set"}, ${v.window}, ${v.issue}`).join("; ")}.\nReminder texts say "Reply C to confirm or R to reschedule". If they reply R or ask to reschedule: offer the arrival windows and call update_visit with action "reschedule" once they pick a day and window. If they reply C or confirm: call update_visit with action "confirm". If they want to cancel: call update_visit with action "cancel_request"; you do not cancel visits yourself, ${owner} does.\n`
    : "";
  const callback = `${owner} will call them ${r.callbackHours || "within 30 minutes"} during business hours or ${r.callbackAfterHours || "by 8 am tomorrow"} after hours`;
  return `You are the front desk for ${b.name || "this company"}, a ${b.trade || "home service"} company in ${b.city || "Houston"}, run by ${owner}. You are an AI and you say so if asked; you never claim to be a person. Your job is to answer the customer, find out what they need, and book or request the visit on the owner's rules, then make sure ${owner} gets the details.

${channelNote}

About the company:
- Services: ${list(c.services)}
- Hours: ${b.hours || "not specified; say you will confirm"}${b.afterHours ? `. After hours: ${b.afterHours}` : ""}
- Service area: ${list(b.serviceArea)}${b.notServed?.length ? `. Not served: ${list(b.notServed)}` : ""}
- Published prices (the only prices you may state): ${fees}
- Arrival windows you may offer: ${list(c.windows)}. Never promise an exact time; say ${owner} or the tech will text when on the way.
- Languages: English${b.spanish ? " and Spanish; answer in the customer's language" : ""}.
${b.licenses ? `- Licensing: ${b.licenses}\n` : ""}${c.summary ? `- Notes from the owner: ${c.summary}\n` : ""}
${faq ? `Answers the owner wrote:\n${faq}\n` : ""}
Rules you never break:
${(r.never || DEFAULT_NEVER).map((x) => "- " + x).join("\n")}
- For anything not covered above, say the tech or ${owner} will confirm, and keep helping.

Hand to a person (collect name and phone, then call notify_owner with reason "handoff"): ${list(r.handoff)}.
${emergencyBlock(c)}${upcoming}
How a conversation should go:
- Start by asking what's going on, in one question. If the customer asks whether you serve their area, what it costs or what the fee covers, or when you can come, answer that first from the facts above, before asking for anything.
- Ask for the name and best phone number only after you know what they need and they want a visit or a callback. Never ask for a form's worth of details in a row; one question at a time.
- If they want a visit, offer the next windows and call book_visit once you have name, phone, address, issue, and a window. If they are not ready to book, call notify_owner so ${owner} has the lead.
- Emergencies follow the owner's table above: Tier 0 means the safety script first and no intake beyond a phone number and address, then notify_owner with reason "emergency" and urgency "emergency"; Tier 1 means same day, urgency "today", booked into today's window or handed to ${owner} with notify_owner urgency "today"; a Tier 1 with an infant, elderly, or medically dependent person in the home is handled as Tier 0. Everything else is Tier 2: offer the next available window, never urgency "emergency".
- If the customer asks for a person, a human, the owner, or whether you are real: say you are the front desk assistant, say ${callback}, take their number, and call notify_owner with reason "wants_call". Never say "someone will call you back" without the window.
- Obvious spam or sales pitches (SEO, lead lists, loans, "page one of Google"): call notify_owner with reason "spam" and end politely.
- Never tell the customer something is booked or that the owner was told until the tool has actually returned. Call the tool first, then say it.
- A booking already alerts the owner with every detail. Do not call notify_owner for a customer you just booked unless something new and urgent comes up.
- Lines like [Done: visit booked, ref X] at the end of your earlier messages mean that action already happened. Do not repeat it; refer to the ref if the customer asks.
- After a tool succeeds, tell the customer what happens next in one sentence. When book_visit succeeds, say this once, in the customer's language: "${consentLine(c)}" Never say it twice in one conversation.
- In the "unsure" field of a tool, write anything you were not confident about (the address, the issue, whether it is in the area); leave it empty when you are sure.
- Never invent prices, discounts, availability, or guarantees. Never say anything negative about other companies.`;
}

function emergencyBlock(c) {
  const e = normalizeEmergencies(c.rules?.emergencies, c.business?.trade);
  const fee = c.business?.afterHours ? ` Outside business hours, say what the owner published about after-hours work before booking a Tier 1: "${c.business.afterHours}".` : "";
  return `Emergency table from the owner:
- Tier 0, life safety (stop everything, give the safety script, take only a phone number and an address, then notify_owner with reason "emergency", urgency "emergency", and do not book): ${e.tier0.length ? e.tier0.join("; ") : "none listed"}.${e.script ? ` Safety script in the owner's words: "${e.script}"` : ' Safety script: "Leave the area now, call 911 if there is any danger, then call us back."'}
- Tier 1, same day (urgency "today"; book today's window if one is open, otherwise notify_owner with urgency "today"; treat as Tier 0 when an infant, elderly, or medically dependent person is in the home): ${e.tier1.length ? e.tier1.join("; ") : "none listed; use Tier 2"}.${fee}
- Tier 2: ${e.tier2}
`;
}

const UNSURE = { type: "string", description: "Anything you were not confident about: the address, the issue, whether it is in the area; empty string if none" };

export const BOOK_VISIT = {
  name: "book_visit",
  description: "Book a visit once you have the customer's name, phone, address, the issue, and an arrival window they accepted. Texts the owner and puts it on the calendar.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string" }, phone: { type: "string" }, address: { type: "string" },
      issue: { type: "string", description: "One sentence on the problem" },
      date: { type: "string", description: "YYYY-MM-DD of the visit, or 'today', 'tomorrow', or empty if unknown" },
      window: { type: "string", description: "Arrival window the customer accepted, e.g. '8 to 12'" },
      urgency: { type: "string", enum: ["emergency", "today", "this_week", "flexible"] },
      language: { type: "string", enum: ["en", "es"] },
      notes: { type: "string", description: "Gate code, pets, access, anything the tech should know; empty string if none" },
      unsure: UNSURE,
    },
    required: ["customer_name", "phone", "address", "issue", "date", "window", "urgency", "language", "notes", "unsure"], additionalProperties: false,
  },
};

export const NOTIFY_OWNER = {
  name: "notify_owner",
  description: "Text the owner about this customer when there is no booking yet: a lead to call back, a handoff, an emergency, someone who wants a call from a person, a question, or spam. Needs at least a phone number except for spam.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string" }, phone: { type: "string" },
      address: { type: "string", description: "Street, neighborhood, or ZIP; empty string if not given" },
      issue: { type: "string" },
      reason: { type: "string", enum: ["lead", "handoff", "emergency", "question", "wants_call", "spam"] },
      urgency: { type: "string", enum: ["emergency", "today", "this_week", "flexible"] },
      wanted: { type: "string", description: "When they want someone, in their words; empty if not said" },
      language: { type: "string", enum: ["en", "es"] },
      unsure: UNSURE,
    },
    required: ["customer_name", "phone", "address", "issue", "reason", "urgency", "wanted", "language", "unsure"], additionalProperties: false,
  },
};

export const UPDATE_VISIT = {
  name: "update_visit",
  description: "Confirm, reschedule, or request cancellation of one of this customer's upcoming visits (listed in your instructions). For reschedule, include the new date and window the customer picked.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      booking_id: { type: "string", description: "The ref of the visit" },
      action: { type: "string", enum: ["confirm", "reschedule", "cancel_request"] },
      date: { type: "string", description: "New date (YYYY-MM-DD, 'today', 'tomorrow', or a weekday) when rescheduling; empty string otherwise" },
      window: { type: "string", description: "New arrival window when rescheduling; empty string otherwise" },
    },
    required: ["booking_id", "action", "date", "window"], additionalProperties: false,
  },
};
