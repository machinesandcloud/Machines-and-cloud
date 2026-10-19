// Client config: the one record that describes a shop's front desk, plus the prompt built from it.

export const PLANS = {
  starter: { name: "Starter", price: 99, minutes: 150, texts: 500, leadPlatforms: false, followUp: false, software: ["google"] },
  growth: { name: "Growth", price: 249, minutes: 600, texts: 1500, leadPlatforms: true, followUp: true, software: ["google", "jobber", "housecall"] },
  pro: { name: "Pro", price: 449, minutes: 1500, texts: 5000, leadPlatforms: true, followUp: true, software: ["google", "jobber", "housecall"] },
};

export const DEFAULT_WINDOWS = ["8 to 12", "12 to 5"];
export const DEFAULT_NEVER = [
  "Quote a price the owner has not published",
  "Promise an exact arrival time; offer the arrival windows only",
  "Pretend to be a person",
  "Give advice on gas, electrical, or safety beyond: leave the area if there is a gas smell or fire, call 911, then call us",
];
export const DEFAULT_HANDOFF = ["Complaints about past work", "Warranty questions", "Anything about a bill or refund", "Commercial or large projects"];

export function newClient({ slug, ownerKey, owner, business }) {
  return {
    slug, ownerKey, status: "new", plan: "growth",
    createdAt: new Date().toISOString(),
    owner: { name: "", email: "", phone: "", ...owner },
    business: { name: "", website: "", trade: "", city: "Houston", serviceArea: [], notServed: [], hours: "", afterHours: "", spanish: true, licenses: "", ...business },
    services: [], fees: [], windows: DEFAULT_WINDOWS.slice(), rules: { never: DEFAULT_NEVER.slice(), handoff: DEFAULT_HANDOFF.slice(), emergencies: "" },
    faq: [], leadSources: [], software: "google",
    phone: { businessNumber: "", twilioNumber: "", forwarding: "missed", voiceForwardTo: "", textBack: true, tenDlc: "not_started" },
    calendar: { provider: "none" }, billing: { status: "none" },
    build: { status: "pending", notes: "", sourcePages: [] },
    widget: { greeting: "", allowedOrigins: [] },
    summary: "",
  };
}

// What the browser widget on the client's site may know.
export function publicView(c) {
  return {
    slug: c.slug, status: c.status,
    name: c.business?.name || "Front desk",
    greeting: c.widget?.greeting || `Hi, this is the ${c.business?.name || "front desk"}. What can we help with today?`,
    spanish: !!c.business?.spanish,
  };
}

// What the owner portal sees (no secrets beyond their own key).
export function ownerView(c) {
  const { calendar, billing, ...rest } = c;
  return { ...rest, calendar: { provider: calendar?.provider || "none", connected: !!calendar?.google?.refreshToken }, billing: { status: billing?.status || "none", plan: c.plan, trialEnd: billing?.trialEnd || null } };
}

const list = (arr) => (arr && arr.length ? arr.map((x) => (typeof x === "string" ? x : `${x.label}: ${x.amount}${x.note ? " (" + x.note + ")" : ""}`)).join("; ") : "none listed");

// The front desk prompt for a real client, by channel.
export function buildSystemPrompt(c, channel = "web") {
  const b = c.business || {};
  const owner = c.owner?.name || "the owner";
  const fees = c.fees?.length ? c.fees.map((f) => `${f.label}: ${f.amount}${f.note ? " (" + f.note + ")" : ""}`).join("; ") : "no published prices; every price is confirmed on site";
  const faq = c.faq?.length ? c.faq.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n") : "";
  const channelNote = channel === "sms"
    ? "You are texting. Keep every message under 300 characters, one question at a time, no formatting, no links unless asked."
    : channel === "test"
    ? "This is the owner's private test line. Behave exactly as you would with a real customer."
    : "You are the chat on the company website. Keep replies to one to three short sentences, one question at a time.";
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
${(c.rules?.never || DEFAULT_NEVER).map((r) => "- " + r).join("\n")}
- For anything not covered above, say the tech or ${owner} will confirm, and keep helping.

Hand to a person (collect name and phone, then call notify_owner with the reason): ${list(c.rules?.handoff)}.
${c.rules?.emergencies ? `Emergency instructions from the owner: ${c.rules.emergencies}\n` : ""}
How a conversation should go:
- Find out what is wrong, where (address or neighborhood), and when they want someone. Ask one question at a time.
- Then get the customer's name and best phone number.
- If they want a visit, offer the next windows and call book_visit once you have name, phone, address, issue, and a window. If they are not ready to book, call notify_owner so ${owner} has the lead.
- Emergencies (no cooling in extreme heat, active leak, no water, sewage, gas smell, sparking, burning smell, no power, active roof leak): give the owner's safety instruction first, get a phone number and address fast, and call notify_owner with urgency "emergency" right away.
- Never tell the customer something is booked or that the owner was told until the tool has actually returned. Call the tool first, then say it.
- A booking already alerts the owner with every detail. Do not call notify_owner for a customer you just booked unless something new and urgent comes up.
- Lines like [Done: visit booked, ref X] at the end of your earlier messages mean that action already happened. Do not repeat it; refer to the ref if the customer asks.
- After a tool succeeds, tell the customer what happens next in one sentence.
- Never invent prices, discounts, availability, or guarantees. Never say anything negative about other companies.`;
}

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
    },
    required: ["customer_name", "phone", "address", "issue", "date", "window", "urgency", "language", "notes"], additionalProperties: false,
  },
};

export const NOTIFY_OWNER = {
  name: "notify_owner",
  description: "Text the owner about this customer when there is no booking yet: a lead to call back, a handoff, or an emergency. Needs at least a phone number.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string" }, phone: { type: "string" },
      address: { type: "string", description: "Street or neighborhood; empty string if not given" },
      issue: { type: "string" },
      reason: { type: "string", enum: ["lead", "handoff", "emergency", "question"] },
      urgency: { type: "string", enum: ["emergency", "today", "this_week", "flexible"] },
      language: { type: "string", enum: ["en", "es"] },
    },
    required: ["customer_name", "phone", "address", "issue", "reason", "urgency", "language"], additionalProperties: false,
  },
};
