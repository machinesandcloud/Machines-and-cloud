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
  const portalOnly = system.includes("Channel limits: this workspace operates website chat only.");
  if (/\b(gas|carbon monoxide|co alarm|smoke|fire|sparks?|burning)\b/i.test(text)) {
    const safety = sayES("Please leave the house right now, call 911 or CenterPoint from outside, then call us.", "Salga de la casa ahora, llame al 911 desde afuera y luego llámenos.");
    if (phone) return { text: safety + " " + (portalOnly ? sayES("Your urgent request is saved in the shop portal; human contact is not confirmed.", "Su solicitud urgente está guardada en el portal; el contacto humano no está confirmado.") : sayES(`I have sent ${owner} your details.`, `Ya le avisé a ${owner}.`)), tool: { name: "notify_owner", input: { customer_name: name, phone, address, issue: text.slice(0, 120), reason: "emergency", urgency: "emergency", wanted: "", language: lang, nobook_reason: "none", unsure: "" } } };
    return { text: safety + " " + sayES("When you are safe, send me your address and best number.", "Cuando esté a salvo, envíeme su dirección y su número.") };
  }
  if (/\b(person|human|owner|real|call me|talk to|speak to|hablar con)\b/i.test(text)) {
    const win = pick(/will call them ([^.]+?)(?: during| \(|\.)/, system) || "within 30 minutes";
    if (phone) return { text: portalOnly ? sayES("Your callback request is saved in the shop portal. Whether or when a person will respond is not confirmed.", "Su solicitud está guardada en el portal. No hay una llamada ni un horario confirmado.") : sayES(`I am the front desk assistant. ${owner} will call you ${win}.`, `Soy la asistente de recepción. ${owner} le llamará ${win}.`), tool: { name: "notify_owner", input: { customer_name: name, phone, address, issue: text.slice(0, 120), reason: "wants_call", urgency: "flexible", wanted: "", language: lang, nobook_reason: "none", unsure: "" } } };
    return { text: portalOnly ? sayES("I am the front desk assistant. What number should the shop use if they can call you? A callback is not confirmed.", "Soy la asistente. ¿Cuál es su número para solicitar una llamada? No hay una llamada confirmada.") : sayES(`I am the front desk assistant. ${owner} will call you ${win}. What is the best number?`, `Soy la asistente. ${owner} le llamará ${win}. ¿Cuál es el mejor número?`) };
  }
  if (/\b(seo|page one of google|funding|loan|lead list|free audit)\b/i.test(text)) return { text: "No thank you.", tool: { name: "notify_owner", input: { customer_name: "", phone: "", address: "", issue: text.slice(0, 120), reason: "spam", urgency: "flexible", wanted: "", language: "en", nobook_reason: "none", unsure: "" } } };
  const wantsBooking = /\b(book|schedule|agend|come|visit|yes|sí|si)\b/i.test(text);
  const alreadyBooked = /\[Done: visit (?:booked|saved in portal)/.test(all);
  if (wantsBooking && phone && address && window && !alreadyBooked) {
    const issue = pick(/\b(ac [^.,]+|heater[^.,]*|furnace[^.,]*|aire[^.,]*|calentador[^.,]*)/i, all) || "service visit";
    return { text: portalOnly ? sayES(`The visit details for ${date}, ${window}, at ${address} are saved in the shop portal. The shop needs to confirm arrival details.`, `Los detalles de la visita para ${date}, ${window}, en ${address} están guardados en el portal. La tienda debe confirmar la llegada.`) : sayES(`${name ? name.split(" ")[0] + ", you" : "You"} are booked for ${date}, ${window}, at ${address}. The tech texts when on the way.`, `Queda agendado para ${date === "tomorrow" ? "mañana" : date}, ${window}, en ${address}.`), tool: { name: "book_visit", input: { customer_name: name, phone, address, issue: issue.trim(), date, window, urgency: "this_week", language: lang, notes: "", unsure: "" } } };
  }
  if (alreadyBooked) return { text: portalOnly ? sayES("Your visit details are already saved in the shop portal.", "Los detalles de su visita ya están guardados en el portal.") : sayES("Your visit is already booked; the ref is on your confirmation text.", "Su visita ya quedó agendada.") };
  if (/\b(how much|price|cost|fee|cuánto)\b/i.test(text)) { const fee = pick(/Published prices \(the only prices you may state\): ([^\n]+)/, system); return { text: sayES(`Our published prices: ${fee}. Want a window this week?`, `Nuestros precios publicados: ${fee}. ¿Quiere una ventana esta semana?`) }; }
  const missing = [!phone && "best phone number", !address && "address", !window && "window (8 to 12 or 12 to 5)"].filter(Boolean);
  return { text: sayES(`Sorry to hear that. To get you scheduled I need your ${missing.join(", ") || "go-ahead"}.`, `Lamento escucharlo. Para agendar necesito su ${missing.join(", ") || "confirmación"}.`) };
}

// The public practice personas expose only an on-page summary tool. Keep this separate
// from the real-shop fake desk so rehearsal cannot emit booking/notification tools.
function practiceDesk(system, messages) {
  const turns = messages.filter(message => message.role === "user" && typeof message.content === "string").map(message => message.content);
  const all = turns.join("\n"), lang = es(all) ? "es" : "en";
  const owner = pick(/^Owner: ([^.]+)\./m, system) || "the owner";
  const latest = extractor => turns.map(extractor).filter(Boolean).at(-1) || "";
  const name = latest(text => pick(/\b(?:I(?:'m| am)|my name is|[Ss]oy|[Mm]e llamo)\s+([A-ZÁÉÍÓÚÑ][\p{L}]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}]+)?)/u, text));
  const days = { "lunes": "monday", "martes": "tuesday", "miércoles": "wednesday", "jueves": "thursday", "viernes": "friday", "sábado": "saturday", "domingo": "sunday" };
  const phone = latest(E164), address = latest(ADDR), window = latest(WINDOW), date = latest(text => DATE(text) || days[pick(/(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i, text).toLowerCase()] || "");
  const emergency = /\b(gas|carbon monoxide|smoke|fire|sparks?|burning|humo|fuego)\b/i.test(all);
  let issue = (turns[0] || "").slice(0, 250);
  const rooms = latest(text => pick(/(\d+)\s*(?:recámaras|habitaciones|bedrooms?|beds?)/i, text));
  if (rooms) issue = issue.replace(/\d+\s*(recámaras|habitaciones|bedrooms?|beds?)/gi, (_, noun) => rooms + " " + noun);
  const callbackTiming = latest(text => pick(/((?:after|despu[eé]s de)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, text));
  if (callbackTiming) issue = issue.replace(/(?:after|despu[eé]s de)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, callbackTiming);
  // Fixture-only English owner fields; this is not a production translation service.
  if (lang === "es") {
    const baths = latest(text => pick(/(\d+)\s*baños/i, text));
    const area = latest(text => pick(/([\d,]+)\s*pies cuadrados/i, text));
    issue = /limpieza/i.test(all) ? [(/profunda/i.test(all) ? "Deep cleaning" : "Cleaning") + " request" + (/Memorial/i.test(all) ? " in Memorial" : ""), rooms && `${rooms} bedrooms`, baths && `${baths} bathrooms`, area && `${area} square feet`].filter(Boolean).join("; ") : emergency ? "Safety emergency reported" : "Service request";
  }
  const requested_window = callbackTiming.replace(/despu[eé]s de/i, "after") || (window ? [date, window.replace(/\s*a\s*/, " to ")].filter(Boolean).join(", ") : "");
  const customerDate = lang === "es" ? date === "tomorrow" ? "mañana" : date === "today" ? "hoy" : Object.keys(days).find(day => days[day] === date) || date : date;
  const customerWindow = callbackTiming || (window ? [customerDate, window].filter(Boolean).join(", ") : "");
  const urgentLeak = /actively leaking|active leak|water is (?:actively )?leaking|sewage backup/i.test(all) && /Katy Pipeworks/.test(system);
  const callback = urgentLeak || /call me|call back|callback|don.t book|solo.*llam|ll.meme/i.test(all);
  const areaQuestion = /Woodlands|Pearland|only asking|do you serv(?:e|ice)/i.test(turns.at(-1) || "");
  const questionOnly = areaQuestion || /only.*(?:information|price)|solo.*información|total repair price|exactly|exactamente|slab leak.*(?:price|cost)|outside.*Beltway/i.test(turns.at(-1) || "");
  const input = { requested_action: emergency ? "emergency_handoff" : callback ? "callback" : questionOnly ? "question_only" : "visit_request", customer_name: name, phone, address, issue, urgency: emergency || urgentLeak ? "emergency" : /\b(today|hoy)\b/i.test(all) ? "today" : /\b(this week|esta semana)\b/i.test(all) ? "this_week" : "flexible", requested_window, language: lang };
  const say = (english, spanish) => lang === "es" ? spanish : english;
  let text;
  if (emergency) text = say("Leave the area now and call 911 from safety.", "Salga del lugar ahora y llame al 911 desde un lugar seguro.") + " " + (!phone ? say("When safe, what is your best phone number?", "Cuando esté a salvo, ¿cuál es su número de teléfono?") : !address ? say("When safe, what is the street address?", "Cuando esté a salvo, ¿cuál es la dirección?") : say("Your request is shown in the practice owner summary.", "Su solicitud aparece en el resumen de práctica."));
  else if (questionOnly) text = /Woodlands|Pearland/.test(turns.at(-1)) ? `We do not serve ${/Pearland/.test(turns.at(-1)) ? "Pearland" : "The Woodlands"}. We cover Katy, Cypress, Memorial, Energy Corridor, Sugar Land and Richmond.` : say("The owner must confirm that; I cannot promise an exact time or an unpublished repair price.", "La dueña debe confirmarlo; no puedo prometer una hora exacta ni un precio no publicado.");
  else if (!name) text = say("What is your name?", "¿Cómo se llama?");
  else if (!phone) text = say("What is your best phone number?", "¿Cuál es su número de teléfono?");
  else if (callback) text = say(`Your callback request is ready for ${owner} to review; no visit is requested.`, `Su solicitud de llamada está lista para que ${owner} la revise; no se solicita una visita.`);
  else if (!address) text = say("What is the street address?", "¿Cuál es la dirección?");
  else if (!window) text = say("What day and arrival window would you like to request?", "¿Qué día y horario quiere solicitar?");
  else text = say(`Thanks, ${name.split(" ")[0]}. Your requested ${customerWindow} visit is ready for ${owner} to review.`, `Gracias, ${name.split(" ")[0]}. Su solicitud para ${customerWindow} está lista para que ${owner} la revise.`);
  return { text, tool: { name: "send_owner_summary", input } };
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
  const stream = ({ system, messages, tools }) => {
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
    else ({ text, tool } = (tools || []).some(tool => tool.name === "send_owner_summary") ? practiceDesk(sys, messages) : desk(sys, messages));
    const content = []; if (text) content.push({ type: "text", text }); if (tool) content.push({ type: "tool_use", id: id(), name: tool.name, input: tool.input });
    const final = { stop_reason: tool ? "tool_use" : "end_turn", content, usage: { input_tokens: 10, output_tokens: 10 } };
    return { async *[Symbol.asyncIterator]() { if (text) yield { type: "content_block_delta", delta: { type: "text_delta", text } }; }, finalMessage: async () => final };
  };
  return { messages: { create }, beta: { messages: { create, stream } } };
}
