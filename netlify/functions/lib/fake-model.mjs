// Test-only stand-in for the model (MC_FAKE_MODEL=1): deterministic rules that exercise the same tools and
// shapes the real client returns, so every flow can be verified locally with no Anthropic spend and no
// Netlify usage. Never set in production.
const pick = (re, t) => (t.match(re) || [])[1] || "";
const E164 = (t) => { const m = t.match(/(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/); return m ? m[1] : ""; };
const ADDR = (t) => pick(/(\d{1,6}\s+[A-Z][\w.]*(?:\s+[A-Z][\w.]*)*\s+(?:St|Street|Rd|Road|Ln|Lane|Dr|Drive|Ave|Blvd|Ct|Way|Hollow)\b[^,.\n]*(?:,\s*[A-Z][a-z]+)?)/, t);
const NAME = (t) => { const m = t.match(/\b(?:I'm|I am|this is|it's|soy)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/) || t.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:\+?1?[\s.-]?\(?\d{3})/); return m ? m[1] : ""; };
const WINDOW = (t) => pick(/\b(\d{1,2}\s*(?:to|a)\s*\d{1,2})\b/, t);
const DATE = (t) => pick(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mañana|hoy)\b/i, t).toLowerCase().replace("mañana", "tomorrow").replace("hoy", "today");
const es = (t) => /\b(hola|aire|calentador|agende|mañana|necesito|gracias|sí)\b/i.test(t);

function desk(system, messages) {
  const user = [...messages].reverse().find((m) => m.role === "user");
  const text = typeof user?.content === "string" ? user.content : (user?.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ");
  const all = messages.filter((m) => typeof m.content === "string").map((m) => m.content).join("\n");
  const owner = pick(/run by ([^.]+)\./, system) || "the owner";
  const lang = es(text) ? "es" : "en";
  const phone = E164(all), address = ADDR(all), name = NAME(all), window = WINDOW(all), date = DATE(all) || "tomorrow";
  const sayES = (en, esT) => (lang === "es" ? esT : en);
  if (/\b(gas|carbon monoxide|co alarm|smoke|fire|sparks?|burning)\b/i.test(text)) {
    const safety = sayES("Please leave the house right now, call 911 or CenterPoint from outside, then call us.", "Salga de la casa ahora, llame al 911 desde afuera y luego llámenos.");
    if (phone) return { text: safety + " " + sayES(`I have sent ${owner} your details.`, `Ya le avisé a ${owner}.`), tool: { name: "notify_owner", input: { customer_name: name, phone, address, issue: text.slice(0, 120), reason: "emergency", urgency: "emergency", wanted: "", language: lang, nobook_reason: "none", unsure: "" } } };
    return { text: safety + " " + sayES("When you are safe, send me your address and best number.", "Cuando esté a salvo, envíeme su dirección y su número.") };
  }
  if (/\b(person|human|owner|real|call me|talk to|speak to|hablar con)\b/i.test(text)) {
    const win = pick(/will call them ([^.]+?)(?: during| \(|\.)/, system) || "within 30 minutes";
    if (phone) return { text: sayES(`I am the front desk assistant. ${owner} will call you ${win}.`, `Soy la asistente de recepción. ${owner} le llamará ${win}.`), tool: { name: "notify_owner", input: { customer_name: name, phone, address, issue: text.slice(0, 120), reason: "wants_call", urgency: "flexible", wanted: "", language: lang, nobook_reason: "none", unsure: "" } } };
    return { text: sayES(`I am the front desk assistant. ${owner} will call you ${win}. What is the best number?`, `Soy la asistente. ${owner} le llamará ${win}. ¿Cuál es el mejor número?`) };
  }
  if (/\b(seo|page one of google|funding|loan|lead list|free audit)\b/i.test(text)) return { text: "No thank you.", tool: { name: "notify_owner", input: { customer_name: "", phone: "", address: "", issue: text.slice(0, 120), reason: "spam", urgency: "flexible", wanted: "", language: "en", nobook_reason: "none", unsure: "" } } };
  const wantsBooking = /\b(book|schedule|agend|come|visit|yes|sí|si)\b/i.test(text);
  const alreadyBooked = /\[Done: visit booked/.test(all);
  if (wantsBooking && phone && address && window && !alreadyBooked) {
    const issue = pick(/\b(ac [^.,]+|heater[^.,]*|furnace[^.,]*|aire[^.,]*|calentador[^.,]*)/i, all) || "service visit";
    return { text: sayES(`${name ? name.split(" ")[0] + ", you" : "You"} are booked for ${date}, ${window}, at ${address}. The tech texts when on the way.`, `Queda agendado para ${date === "tomorrow" ? "mañana" : date}, ${window}, en ${address}.`), tool: { name: "book_visit", input: { customer_name: name, phone, address, issue: issue.trim(), date, window, urgency: "this_week", language: lang, notes: "", unsure: "" } } };
  }
  if (alreadyBooked) return { text: sayES("Your visit is already booked; the ref is on your confirmation text.", "Su visita ya quedó agendada.") };
  if (/\b(how much|price|cost|fee|cuánto)\b/i.test(text)) { const fee = pick(/Published prices \(the only prices you may state\): ([^\n]+)/, system); return { text: sayES(`Our published prices: ${fee}. Want a window this week?`, `Nuestros precios publicados: ${fee}. ¿Quiere una ventana esta semana?`) }; }
  const missing = [!phone && "best phone number", !address && "address", !window && "window (8 to 12 or 12 to 5)"].filter(Boolean);
  return { text: sayES(`Sorry to hear that. To get you scheduled I need your ${missing.join(", ") || "go-ahead"}.`, `Lamento escucharlo. Para agendar necesito su ${missing.join(", ") || "confirmación"}.`) };
}

function classify(system, messages) {
  const text = String(messages[0]?.content || "");
  if (/Classify the customer's reply/.test(system)) return /\b(mess|rude|late|never|wrong|bad|worst|unhappy|not happy|disappoint|still (rattles|broken))\b/i.test(text) ? "negative" : /\b(great|thanks|thank you|wonderful|good job|perfect|will do|love)\b/i.test(text) ? "positive" : "none";
  if (/You audit an AI front desk/.test(system)) {
    const prices = (system.match(/Published prices: ([^.]+)\./) || ["", ""])[1];
    const deskLines = text.split("\n").filter((l) => l.startsWith("Desk:")).join(" ");
    const out = [];
    for (const m of deskLines.matchAll(/\$\s?([\d,]+)/g)) if (!prices.includes("$" + m[1])) { out.push("price_not_listed"); break; }
    if (/\b(exactly|sharp|on the dot|at \d{1,2}(:\d{2})? ?(am|pm)\b(?!.*(to|window)))/i.test(deskLines) && !/\d\s*to\s*\d/.test(deskLines)) out.push("exact_time_promised");
    if (/\b(gas|carbon monoxide|co alarm|smoke|sparks|sewage)\b/i.test(text) && !/\b(911|leave|salga|outside)\b/i.test(deskLines)) out.push("tier0_missed");
    if (/\b(person|human|owner)\b/i.test(text) && /\b(someone will call|will call you back|pass that along|sent your request|alguien le llamará)\b/i.test(deskLines) && !/\b(within|by \d|minutes|hour|dentro de)\b/i.test(deskLines)) out.push("no_callback_window");
    const custEs = /Customer: [^\n]*\b(hola|necesito|calentador|cuánto|español|mi aire)\b/i.test(text), deskEs = /Desk: [^\n]*\b(claro|usted|cuál|señor|gracias)\b/i.test(deskLines);
    if ((custEs && /Desk: [^\n]*\b(what|sure|thanks for reaching|would|got it)\b/i.test(deskLines) && !deskEs) || (!custEs && deskEs && /Customer: [^\n]*\b(what|don't speak)\b/i.test(text))) out.push("spanish_mishandled");
    if (/\b(booked|you're booked|queda agendad)/i.test(deskLines) && !/\d+\s+[A-Z][\w]*\s+(St|Rd|Ln|Dr|Ave)\b/.test(text)) out.push("no_address");
    if (/Customer: [^\n]*\?/.test(text) && /Customer: [^\n]*(doesn't answer|asked|my question|hello\?|primero)/i.test(text) && !/Desk: [^\n]*(sorry|you are right|disculpe|yes,|sí,)/i.test(deskLines)) out.push("question_unanswered");
    return [...new Set(out)].join(", ") || "none";
  }
  return "none";
}

function profile(system, messages) {
  const text = String(messages[0]?.content || "");
  const trade = (text.match(/trade ([^;]+);/) || ["", "HVAC"])[1].trim();
  return { type: "tool_use", id: "fake_profile", name: "save_front_desk_profile", input: { business_name: (text.match(/name ([^;]+);/) || ["", ""])[1].trim(), trade: trade === "-" ? "HVAC" : trade, city: "Houston", service_area: [], hours: "", after_hours: "", google_review_link: "", services: [], published_prices: [], licenses: "", spanish: true, faq: [{ q: "Are you licensed?", a: "ASK OWNER" }], missing: ["hours", "service area"], summary: "Built by the local fake model." } };
}

export function fakeClient() {
  const id = () => "fake_" + Math.random().toString(36).slice(2, 10);
  const create = async ({ system, messages, tools }) => {
    const sys = Array.isArray(system) ? system.map((b) => b.text).join("\n") : String(system || "");
    if ((tools || []).some((t) => t.name === "save_front_desk_profile")) return { stop_reason: "tool_use", content: [profile(sys, messages)], usage: { input_tokens: 10, output_tokens: 10 } };
    return { stop_reason: "end_turn", content: [{ type: "text", text: classify(sys, messages) }], usage: { input_tokens: 10, output_tokens: 5 } };
  };
  const stream = ({ system, messages }) => {
    const sys = Array.isArray(system) ? system.map((b) => b.text).join("\n") : String(system || "");
    const lastIsToolResult = Array.isArray(messages[messages.length - 1]?.content) && messages[messages.length - 1].content.some((b) => b.type === "tool_result");
    let text, tool = null;
    if (lastIsToolResult) {
      // After the tool: say the sentence that went with the tool call (the real model writes it after the result).
      const res = String(messages[messages.length - 1].content.find((b) => b.type === "tool_result")?.content || "");
      const prev = [...messages].reverse().find((m) => m.role === "assistant" && Array.isArray(m.content));
      // A refused booking: say so and offer the other window, as the real model would from the tool result.
      text = /already full|Nothing was booked/.test(res) ? "That window just filled up. " + (res.match(/Offer ([^.]+)/)?.[1] ? "I can do " + res.match(/Offer ([^.]+)/)[1].replace(/^the other window \(([^)]+)\)/, "$1") + " instead. Which works?" : "Which other time works?") : ((prev?.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ") || "Done.");
    }
    else ({ text, tool } = desk(sys, messages));
    const content = []; if (text) content.push({ type: "text", text }); if (tool) content.push({ type: "tool_use", id: id(), name: tool.name, input: tool.input });
    const final = { stop_reason: tool ? "tool_use" : "end_turn", content, usage: { input_tokens: 10, output_tokens: 10 } };
    return { async *[Symbol.asyncIterator]() { if (text) yield { type: "content_block_delta", delta: { type: "text_delta", text } }; }, finalMessage: async () => final };
  };
  return { messages: { create }, beta: { messages: { create, stream } } };
}
