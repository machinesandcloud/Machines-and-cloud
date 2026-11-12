// Proposal 10 acceptance check, revision 2: a model turn that stops on max_tokens,
// model_context_window_exceeded or refusal, or that holds a tool_use block without stopping on tool_use,
// never delivers its planning/partial text on any runAgent caller. Revision 2 also requires:
//  - N1: after a saved action (booking, request, preview, practice summary) the fallback says the details
//    were received, never "say that again" / "can't help"; Done markers stay; managed SMS appends the
//    consent question in the booking's language after a coherent line;
//  - N2: every cut-off fallback carries the generic danger line ("call 911");
//  - N3: Spanish fallbacks when the language is known (tool input or saved record), bilingual on a
//    Spanish-enabled shop when it is not;
//  - N4: exactly one "[agent]" log line per withheld/rejected turn, with the stop reason and no text;
//  - N5: a withheld owner-test rehearsal does not record setup proof;
//  - mutation gaps: the stream equals the reply (M6), events are a checked surface (M9), and
//    end_turn/stop_sequence turns with a tool_use block are covered (M1).
// Revision 3 (answers QA-10 r2) also requires:
//  - D1: a lead flagged as spam, and an is_error result that carries an event, are not saves (no "details
//    were received"), on web, legacy SMS, managed SMS and direct runs;
//  - the five QA-10 r2 survivors are covered: a notify_owner callback save (Q4), legacy update_visit
//    confirm/cancel saves (Q5), mixed tool languages where the last executed one wins (Q2), an erroring tool
//    carrying a language (Q1), and a Spanish-enabled owner test (Q6);
//  - D2: the shortened bilingual lines (each at most 134 characters);
//  - the shop slug on every "[agent]" line ("none" for the sales desk, practice persona and direct runs);
//  - the sales desk's cut-off has no 911 line (cut_off_plain).
// Revision 4 (a54-10-delta revision 2, answers QA-DELTA G1): QA's stop-probe cases (text-only stop_sequence,
// pause_turn, pause_turn + tool_use, an unknown stop reason) run on every caller; on requireComplete callers they
// are clean rejections. They kill all 4 release-rule mutants (stop_sequence, pause_turn, any non-tool_use, Codex-only).
// Usage: node --import ./p10-model-stub.mjs agent-truncation-check.mjs --repo <copy root> --output <new json>
// Expected: FAILS on dfb0ae78 and on revisions 1 and 2, PASSES with revision 3 of 10-agent-truncation-withhold.patch
// and with a54-10-delta.patch on a54c5874.
// Offline: memory store, scripted SDK double (p10-model-stub.mjs), provider env removed, sockets/fetch denied.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { execFileSync } from "node:child_process";
import net from "node:net"; import http from "node:http"; import https from "node:https";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo") || ".");
const output = arg("--output");
if (output && existsSync(output)) throw new Error("Choose a new output path: " + output);
let netAttempts = 0;
const deny = () => { netAttempts++; throw new Error("p10 check denies real networking"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async () => deny();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|THUMBTACK|CALENDAR_|MANAGED_|PHONE_|SERVICE_|MESSAGING_|MC_TWILIO|MC_MESSAGING|STEVE_|DEPLOY_|NETLIFY)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", ADMIN_KEY: "p10-admin", URL: "http://127.0.0.1:8888", MC_SALES_AI_GLOBAL_DAILY_LIMIT: "500", MC_SALES_AI_IP_DAILY_LIMIT: "100", MC_PLATFORM_AI_ENABLED: "1" });

const sent = []; let warns = []; const origLog = console.log;
const quiet = (...a) => { const s = a.map(String).join(" "); const m = s.match(/^\[sms:disabled\] to=(\S+) from=\S+ :: ([\s\S]*)$/); if (m) sent.push({ to: m[1], body: m[2] }); };
console.log = quiet; console.error = () => {};
console.warn = (...a) => { const s = a.map(String).join(" "); if (s.startsWith("[agent]")) warns.push(s); };

const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const store = await import(F("lib/store.mjs"));
const cfg = await import(F("lib/config.mjs"));
const desk = await import(F("lib/desk.mjs"));
const { runAgent } = await import(F("lib/agent.mjs"));
const chat = (await import(F("chat.mjs"))).default;
const smsAgent = (await import(F("sms-agent-background.mjs"))).default;
const { generatePlatformAIProposal } = await import(F("lib/platform-ai-proposal.mjs"));

// ---- Fixed texts -------------------------------------------------------------------------------
const NOTE = "Have name, address, issue, window. Phone filled automatically. Book."; // S1-21
const NOTE2 = "Got window. Now book_visit with phone from caller ID.";
const PARTIAL = "Thanks Lee. If you smell gas, leave the house now and cal"; // cut mid-word by max_tokens
const PARTIAL_ES = "Gracias Lee. Si huele a gas, salga de la casa y llam";
const BOOKED_PARTIAL = "Booked Lee for the 7th, window 8 to 12, ref"; // closing turn after a saved visit
const BOOKED_NOTE = "Booked Lee for the 7th. Confirm window.";
const BOOKED_ES = "Listo Lee, su visita queda el martes de 8 a";
const FINAL = "You're set for Tuesday 8 to 12. Ray will see you then.";
const LEAKS = ["Have name", "Phone filled", "Book.", "Got window", "book_visit", "caller ID", "now and cal", "Booked Lee", "Confirm window", "Listo Lee", "salga de la casa"];
const USER_TEXT = ["Pine St", "AC out", "Lee", "HVAC shop", "Huele"]; // customer text: never in an [agent] log line
const SORRY = "Sorry, could you say that again?";
const EXHAUSTED = "Let me get the owner to pick this up. What is the best number to reach you?";
const SALES_EXHAUSTED = "I couldn’t finish that reliably. Your question hasn’t been sent to anyone; you can try again or contact us directly.";
const OWNER_PREFIX = "Test preview: ";
// Revision 3 fallback copy (needs PO sign-off; Spanish needs the named Spanish reviewer).
const FALLBACK = {
  en: {
    refusal: "I can't help with that one. Anything else, ask away.",
    cut_off: "Sorry, my reply was cut off. If anyone is in danger, call 911 now. Otherwise, please send your message again.",
    cut_off_after_action: "Your details were received, but my reply was cut off. If anyone is in danger, call 911 now. Otherwise, reply here with any questions.",
    refusal_after_action: "Thanks, your details were received. Reply here with any questions.",
    cut_off_plain: "Sorry, my reply was cut off. Please send your message again.",
  },
  es: {
    refusal: "No puedo ayudar con eso. Si necesita otra cosa, pregunte.",
    cut_off: "Perdón, mi respuesta se cortó. Si alguien está en peligro, llame al 911 ahora. Si no, envíe su mensaje otra vez.",
    cut_off_after_action: "Recibimos sus datos, pero mi respuesta se cortó. Si alguien está en peligro, llame al 911 ahora. Si no, responda aquí con cualquier pregunta.",
    refusal_after_action: "Gracias, recibimos sus datos. Responda aquí con cualquier pregunta.",
    cut_off_plain: "Perdón, mi respuesta se cortó. Envíe su mensaje otra vez.",
  },
  // Revision 3 (D2): shortened bilingual lines, each at most 134 characters (2 SMS segments even as UCS-2).
  bilingual: {
    refusal: "I can't help with that one. Anything else, ask away. / No puedo ayudar con eso. Si necesita otra cosa, pregunte.",
    cut_off: "Reply cut off. If anyone is in danger, call 911; else resend. / Respuesta cortada. Si hay peligro, llame al 911; si no, reenvíe.",
    cut_off_after_action: "Details received; reply cut off. If anyone is in danger, call 911. / Datos recibidos; respuesta cortada. Si hay peligro, llame al 911.",
    refusal_after_action: "Thanks, your details were received. Reply with any questions. / Gracias, recibimos sus datos. Responda con cualquier pregunta.",
    cut_off_plain: "Sorry, my reply was cut off. Please send your message again. / Perdón, mi respuesta se cortó. Envíe su mensaje otra vez.",
  },
};
for (const [key, line] of Object.entries(FALLBACK.bilingual)) if ([...line].length > 134) throw new Error("bilingual fallback over 134 characters: " + key);
const fallback = (key, lang = "en") => FALLBACK[lang][key];
const leaked = (s) => LEAKS.filter((x) => String(s ?? "").includes(x));
const LOG_WITHHELD = /^\[agent\] final turn withheld: stop_reason=([a-z_]+) tool_use_block=(true|false) after_action=(true|false) language=(en|es|bilingual) shop=([a-z0-9-]+)$/;
const LOG_REJECTED = /^\[agent\] incomplete turn rejected: stop_reason=([a-z_]+) shop=([a-z0-9-]+)$/;

// Tool calls per caller family (only executed when the turn stops on tool_use).
const AVAIL = { name: "get_availability", input: { date: "2099-01-07", days: 1 } };
let day = 0;
const nextDate = () => { for (;;) { const d = new Date(Date.UTC(2099, 0, 5) + (day++) * 86400000); if (d.getUTCDay() % 6) return d.toISOString().slice(0, 10); } };
const BOOK = (language = "en") => ({ name: "book_visit", input: { customer_name: "Lee", phone: "713-555-0142", address: "5 Pine St", issue: "AC out", date: nextDate(), window: "8 to 12", urgency: "this_week", language, notes: "", unsure: "" } });
const SUMMARY = (language = "en") => ({ name: "send_owner_summary", input: { customer_name: "Lee", phone: "713-555-0142", address: "5 Pine St", issue: "AC out", requested_window: "", urgency: "this_week", language, requested_action: "visit_request" } });
const SALES_TOOL = { name: "suggest_next_step", input: { action: "see_example", scenario: "sms", language: "en" } };
// Revision 3: a callback request and a spam flag (notify_owner), and legacy-SMS visit changes (update_visit).
const NOTIFY = (reason = "callback", language = "en") => ({ name: "notify_owner", input: { customer_name: "Lee", phone: "713-555-0142", address: "5 Pine St", issue: "AC out", reason, urgency: "today", wanted: "callback", language, nobook_reason: "other", unsure: "" } });
const UPDATE = (action) => ({ name: "update_visit", input: { booking_id: "__BOOKING__", action } });
// D1 and Q4: a real callback request is a save; a spam flag is not.
const leadScenarios = () => [
  { id: "r3:callback->max_tokens", kind: "incomplete", expect: "cut_off_after_action", turns: [T("tool_use", "", NOTIFY("callback")), T("max_tokens", BOOKED_PARTIAL)] },
  { id: "r3:callback->refusal", kind: "incomplete", expect: "refusal_after_action", turns: [T("tool_use", "", NOTIFY("callback")), T("refusal", BOOKED_NOTE)] },
  { id: "r3:spam->refusal", kind: "incomplete", expect: "refusal", turns: [T("tool_use", "", NOTIFY("spam")), T("refusal", NOTE2)] },
  { id: "r3:spam->max_tokens", kind: "incomplete", expect: "cut_off", turns: [T("tool_use", "", NOTIFY("spam")), T("max_tokens", NOTE2)] },
];

// Scenarios. kind: incomplete (fixed by the patch) or control (byte-identical base vs patched).
// expect: a FALLBACK key, or "final" | "empty" | "exhausted"; lang: the expected fallback language.
// save: the scenario saves an action before its closing turn (the Done marker must be stored).
const T = (stop, text, tool = null) => ({ stop, text, tool });
function scenarios({ prep, act, save = null, prepSaves = false }) {
  const cut = prepSaves ? "cut_off_after_action" : "cut_off", ref = prepSaves ? "refusal_after_action" : "refusal";
  const list = [
    { id: "max_tokens+note+tool_use", kind: "incomplete", expect: "cut_off", turns: [T("max_tokens", NOTE, act())] },
    { id: "max_tokens+note", kind: "incomplete", expect: "cut_off", turns: [T("max_tokens", NOTE)] },
    { id: "max_tokens+partial", kind: "incomplete", expect: "cut_off", turns: [T("max_tokens", PARTIAL)] },
    { id: "max_tokens+empty+tool_use", kind: "incomplete", expect: "cut_off", turns: [T("max_tokens", "", act())] },
    { id: "max_tokens+empty", kind: "incomplete", expect: "cut_off", turns: [T("max_tokens", "")] },
    { id: "context_window+note", kind: "incomplete", expect: "cut_off", turns: [T("model_context_window_exceeded", NOTE)] },
    { id: "refusal+note+tool_use", kind: "incomplete", expect: "refusal", turns: [T("refusal", NOTE, act())] },
    { id: "refusal+note", kind: "incomplete", expect: "refusal", turns: [T("refusal", NOTE)] },
    { id: "refusal+empty+tool_use", kind: "incomplete", expect: "refusal", turns: [T("refusal", "", act())] },
    { id: "refusal+empty", kind: "incomplete", expect: "refusal", turns: [T("refusal", "")] },
    { id: "tool_use(note)->max_tokens+note2", kind: "incomplete", expect: cut, turns: [T("tool_use", NOTE, prep()), T("max_tokens", NOTE2)] },
    { id: "tool_use(note)->max_tokens+note2+tool_use", kind: "incomplete", expect: cut, turns: [T("tool_use", NOTE, prep()), T("max_tokens", NOTE2, act())] },
    { id: "tool_use(note)->refusal+note2", kind: "incomplete", expect: ref, turns: [T("tool_use", NOTE, prep()), T("refusal", NOTE2)] },
    // Revision 2 (M1): a tool_use block in a turn that did not stop on tool_use is not run and its text is withheld.
    { id: "end_turn+note+tool_use", kind: "incomplete", expect: "cut_off", turns: [T("end_turn", NOTE, act())] },
    { id: "stop_sequence+note+tool_use", kind: "incomplete", expect: "cut_off", turns: [T("stop_sequence", NOTE, act())] },
    // Revision 4 (QA-DELTA G1, from qa/tools/stop-probe.mjs): text-only stop_sequence and pause_turn turns, and
    // pause_turn with a tool_use block, are withheld too; they kill the stop_sequence and pause_turn release mutants.
    { id: "stop_sequence+note", kind: "incomplete", expect: "cut_off", turns: [T("stop_sequence", NOTE)] },
    { id: "stop_sequence+partial", kind: "incomplete", expect: "cut_off", turns: [T("stop_sequence", PARTIAL)] },
    { id: "pause_turn+note", kind: "incomplete", expect: "cut_off", turns: [T("pause_turn", NOTE)] },
    { id: "pause_turn+note+tool_use", kind: "incomplete", expect: "cut_off", turns: [T("pause_turn", NOTE, act())] },
    { id: "weird_reason+note", kind: "incomplete", expect: "cut_off", turns: [T("weird_reason", NOTE)] },
    { id: "control:end_turn", kind: "control", expect: "final", turns: [T("end_turn", FINAL)] },
    { id: "control:tool_use(note)->end_turn", kind: "control", expect: "final", turns: [T("tool_use", NOTE, prep()), T("end_turn", FINAL)] },
    { id: "control:end_turn+empty", kind: "control", expect: "empty", turns: [T("end_turn", "")] },
    { id: "control:exhausted", kind: "control", expect: "exhausted", turns: [T("tool_use", NOTE, prep()), T("tool_use", NOTE2, prep()), T("tool_use", "", prep())] },
  ];
  // Revision 2 (N1, N3): an action is saved, then the closing turn is cut off or refused.
  if (save) list.push(
    { id: "save->max_tokens", kind: "incomplete", expect: "cut_off_after_action", save: true, turns: [T("tool_use", "", save("en")), T("max_tokens", BOOKED_PARTIAL)] },
    { id: "save->refusal", kind: "incomplete", expect: "refusal_after_action", save: true, turns: [T("tool_use", "", save("en")), T("refusal", BOOKED_NOTE)] },
    { id: "es:save->max_tokens", kind: "incomplete", expect: "cut_off_after_action", lang: "es", save: true, turns: [T("tool_use", "", save("es")), T("max_tokens", BOOKED_ES)] },
    { id: "es:save->refusal", kind: "incomplete", expect: "refusal_after_action", lang: "es", save: true, turns: [T("tool_use", "", save("es")), T("refusal", BOOKED_ES)] },
    { id: "control:save->end_turn", kind: "control", expect: "final", save: true, turns: [T("tool_use", "", save("en")), T("end_turn", FINAL)] },
  );
  return list;
}
// Revision 2 (N3): a Spanish-enabled shop with no known language gets the bilingual line.
function bilingualScenarios({ act, save = null }) {
  const list = [
    { id: "bilingual:max_tokens+partial_es", kind: "incomplete", expect: "cut_off", lang: "bilingual", turns: [T("max_tokens", PARTIAL_ES)] },
    { id: "bilingual:refusal+note", kind: "incomplete", expect: "refusal", lang: "bilingual", turns: [T("refusal", NOTE)] },
    { id: "bilingual:end_turn+note+tool_use", kind: "incomplete", expect: "cut_off", lang: "bilingual", turns: [T("end_turn", NOTE, act())] },
    { id: "bilingual:control:end_turn", kind: "control", expect: "final", turns: [T("end_turn", FINAL)] },
    { id: "bilingual:control:end_turn+empty", kind: "control", expect: "empty", turns: [T("end_turn", "")] },
  ];
  if (save) list.push(
    { id: "bilingual:es:save->max_tokens", kind: "incomplete", expect: "cut_off_after_action", lang: "es", save: true, turns: [T("tool_use", "", save("es")), T("max_tokens", BOOKED_ES)] },
    { id: "bilingual:en:save->refusal", kind: "incomplete", expect: "refusal_after_action", lang: "en", save: true, turns: [T("tool_use", "", save("en")), T("refusal", BOOKED_NOTE)] },
  );
  return list;
}
const lastStop = (sc) => sc.turns.at(-1).stop;
// requireComplete callers (sales, managed SMS, platform) throw on any stop other than these three.
const rejected = (sc) => !["end_turn", "tool_use", "refusal"].includes(lastStop(sc));

const results = [];
let serial = 0;
async function scripted(turns, fn) {
  globalThis.__p10Script = turns.map((t) => ({ ...t })); globalThis.__p10Requests = []; warns = [];
  try { return await fn(); } finally { const left = globalThis.__p10Script.length; globalThis.__p10Script = undefined; if (left) throw new Error("script not consumed: " + left); }
}
const readNdjson = async (res) => (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
const expectedText = (sc, { exhausted = EXHAUSTED, prefix = "" } = {}) => prefix + (sc.expect === "final" ? FINAL : sc.expect === "empty" ? SORRY : sc.expect === "exhausted" ? exhausted : fallback(sc.expect, sc.lang || "en"));
// N4: exactly one [agent] line per incomplete row, none per control; stop reason only, no text.
function logProblems(sc, lines, { requireComplete = false, shop = "none" } = {}) {
  const problems = [];
  for (const l of lines) { if (leaked(l).length || USER_TEXT.some((x) => l.includes(x))) problems.push("log has text"); if (!LOG_WITHHELD.test(l) && !LOG_REJECTED.test(l)) problems.push("log format"); }
  if (sc.kind === "control") { if (lines.length) problems.push("control logged"); return problems; }
  if (lines.length !== 1) { problems.push(`logs=${lines.length}`); return problems; }
  const m = lines[0].match(requireComplete && rejected(sc) ? LOG_REJECTED : LOG_WITHHELD);
  if (!m || m[1] !== lastStop(sc)) problems.push("log stop reason");
  if (!m || m.at(-1) !== shop) problems.push("log shop"); // revision 3: the shop slug, "none" without a shop
  return problems;
}
function record(caller, surface, sc, out, { expected, requireComplete = false, streamEqual = false, stored = false, logs = true, shop = "none" } = {}) {
  const lines = warns; warns = [];
  const surfaces = Object.fromEntries(Object.entries(out).filter(([k]) => k !== "error"));
  const all = Object.values(surfaces).map((v) => typeof v === "string" ? v : JSON.stringify(v)).join("\n");
  const leaks = leaked(all), problems = [];
  if (expected !== undefined && out.reply !== expected) problems.push("reply");
  if (out.error && !(requireComplete && sc.kind === "incomplete" && rejected(sc))) problems.push("error");
  if (requireComplete && sc.kind === "incomplete" && rejected(sc) && !out.error) problems.push("no clean failure");
  if (streamEqual && !out.error && out.streamed !== out.reply) problems.push("stream != reply"); // M6
  if (stored && sc.save && !String(out.stored).includes("[Done: visit booked, ref")) problems.push("Done marker"); // N1
  if (logs) problems.push(...logProblems(sc, lines, { requireComplete, shop }));
  results.push({ caller, surface, scenario: sc.id, kind: sc.kind, pass: leaks.length === 0 && problems.length === 0, leaks, problems, ...out, logs: lines });
}

// ---- 1. runAgent directly: dropToolPreamble and withholdToolText modes ---------------------------
const directExec = async (name, input) => name === "book_visit" ? { content: "Visit saved. Ref p10ref.", event: { type: "booking", id: "p10ref" } } : { content: "Openings: 8 to 12." };
for (const mode of ["dropToolPreamble", "withholdToolText"]) for (const [hint, list] of [["en", scenarios({ prep: () => AVAIL, act: BOOK, save: BOOK })], ["bilingual", bilingualScenarios({ act: BOOK, save: BOOK })], ["es", [{ id: "es-hint:max_tokens+partial_es", kind: "incomplete", expect: "cut_off", lang: "es", turns: [T("max_tokens", PARTIAL_ES)] }, { id: "es-hint:refusal+note", kind: "incomplete", expect: "refusal", lang: "es", turns: [T("refusal", NOTE)] }]]]) for (const sc of list) {
  const chunks = [];
  const out = await scripted(sc.turns, async () => { try { return await runAgent({ system: "p10 fixture", tools: [cfg.GET_AVAILABILITY, cfg.BOOK_VISIT], messages: [{ role: "user", content: "Book me tomorrow" }], onText: (t) => chunks.push(t), execTool: directExec, [mode]: true, fallbackLanguage: hint }); } catch (e) { return { error: e.message }; } });
  record(`runAgent(${mode}, fallbackLanguage ${hint})`, "reply+onText+events", sc, { reply: out.reply, streamed: chunks.join(""), events: out.events, error: out.error }, { expected: expectedText(sc), streamEqual: true });
}
// Revision 3 (Q1, Q2, D1): the last successful tool language wins; an erroring tool's language and its event
// are ignored; a spam lead is not a save.
const r3Exec = async (name, input) => name === "book_visit" && input.customer_name === "Err" ? { content: "Failed to save.", is_error: true, event: { type: "booking", id: "p10err" } }
  : name === "book_visit" ? { content: "Visit saved. Ref p10ref.", event: { type: "booking", id: "p10ref" } }
  : name === "notify_owner" ? { content: input.reason === "spam" ? "Noted as spam." : "Request saved. Ref p10lead.", event: { type: "lead", id: "p10lead", reason: input.reason } } : { content: "Openings: 8 to 12." };
const ERR_BOOK = (language) => ({ name: "book_visit", input: { ...BOOK(language).input, customer_name: "Err" } });
const r3Direct = () => [
  { id: "r3:mixed en->es->refusal", kind: "incomplete", expect: "refusal_after_action", lang: "es", turns: [T("tool_use", "", BOOK("en")), T("tool_use", "", NOTIFY("callback", "es")), T("refusal", BOOKED_ES)] },
  { id: "r3:mixed es->en->max_tokens", kind: "incomplete", expect: "cut_off_after_action", lang: "en", turns: [T("tool_use", "", BOOK("es")), T("tool_use", "", NOTIFY("callback", "en")), T("max_tokens", BOOKED_PARTIAL)] },
  { id: "r3:error tool es (with event)->max_tokens", kind: "incomplete", expect: "cut_off", lang: "en", turns: [T("tool_use", "", ERR_BOOK("es")), T("max_tokens", NOTE2)] },
  { id: "r3:error tool es (with event)->refusal", kind: "incomplete", expect: "refusal", lang: "en", turns: [T("tool_use", "", ERR_BOOK("es")), T("refusal", NOTE2)] },
  { id: "r3:ok en then error tool es->refusal", kind: "incomplete", expect: "refusal_after_action", lang: "en", turns: [T("tool_use", "", BOOK("en")), T("tool_use", "", ERR_BOOK("es")), T("refusal", BOOKED_NOTE)] },
  ...leadScenarios(),
];
// Revision 3 (D2): a save whose tool input names no language keeps the bilingual hint, so every bilingual
// after-action line is reachable and checked.
const NOLANG = (reason) => { const t = NOTIFY(reason); delete t.input.language; return t; };
const r3Bilingual = () => [
  { id: "r3:bilingual save (no tool language)->max_tokens", kind: "incomplete", expect: "cut_off_after_action", lang: "bilingual", turns: [T("tool_use", "", NOLANG("callback")), T("max_tokens", BOOKED_PARTIAL)] },
  { id: "r3:bilingual save (no tool language)->refusal", kind: "incomplete", expect: "refusal_after_action", lang: "bilingual", turns: [T("tool_use", "", NOLANG("callback")), T("refusal", BOOKED_NOTE)] },
  { id: "r3:bilingual spam (no tool language)->refusal", kind: "incomplete", expect: "refusal", lang: "bilingual", turns: [T("tool_use", "", NOLANG("spam")), T("refusal", NOTE2)] },
];
for (const mode of ["dropToolPreamble", "withholdToolText"]) for (const [hint, sc] of [...r3Direct().map((x) => ["en", x]), ...r3Bilingual().map((x) => ["bilingual", x])]) {
  const chunks = [];
  const out = await scripted(sc.turns, async () => { try { return await runAgent({ system: "p10 fixture", tools: [cfg.GET_AVAILABILITY, cfg.BOOK_VISIT, cfg.NOTIFY_OWNER], messages: [{ role: "user", content: "Book me tomorrow" }], onText: (t) => chunks.push(t), execTool: r3Exec, [mode]: true, fallbackLanguage: hint }); } catch (e) { return { error: e.message }; } });
  record(`runAgent(${mode}, revision 3 language/save cases)`, "reply+onText+events", sc, { reply: out.reply, streamed: chunks.join(""), error: out.error }, { expected: expectedText(sc), streamEqual: true });
}

// ---- 2. Website chat, legacy shop (chat.mjs client mode, channel web), English and Spanish-enabled -------
// newClient enables Spanish by default (Houston shops), so the English-only fixtures set spanish: false.
const shop = (slug, spanish = false) => { const c = cfg.newClient({ slug, ownerKey: slug + "-owner-key", owner: { name: "Ray", email: "", phone: "+17135550100" }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Sat 7am-7pm", spanish } }); Object.assign(c, { status: "live", services: ["AC repair"], windows: ["8 to 12", "12 to 5"] }); return c; };
const legacy = shop("p10-web"), legacyEs = shop("p10-web-es", true);
await store.saveClient(legacy); await store.saveClient(legacyEs);
const post = (body, ip) => chat(new Request("http://127.0.0.1:8888/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { ip });
const callChat = async (body, stream) => {
  const res = await post({ ...body, stream }, body.ip);
  if (!stream) { const j = await res.json(); return j.error ? { error: j.error } : { reply: j.reply, events: j.events, ...(j.test ? { proofRecorded: j.test.proofRecorded } : {}) }; }
  const lines = await readNdjson(res); const done = lines.find((l) => l.t === "done"), err = lines.find((l) => l.t === "error");
  return { reply: done?.reply, streamed: lines.filter((l) => l.t === "delta").map((l) => l.text).join(""), events: done?.events, ...(done?.test ? { proofRecorded: done.test.proofRecorded } : {}), ...(err ? { error: err.error } : {}) };
};
for (const [c, gen] of [[legacy, () => [...scenarios({ prep: () => AVAIL, act: BOOK, save: BOOK }), ...leadScenarios()]], [legacyEs, () => bilingualScenarios({ act: BOOK, save: BOOK })]]) for (const stream of [false, true]) for (const sc of gen()) {
  const contact = "p10web" + (++serial);
  const out = await scripted(sc.turns, () => callChat({ client: c.slug, contact, messages: [{ role: "user", content: "Book me tomorrow 8 to 12, 5 Pine St, AC out, Lee" }], ip: "10.30." + (serial % 250) + ".1" }, stream));
  const conv = await store.getConversation(c, "web", contact);
  out.stored = conv.messages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n");
  record(`chat.mjs web (${c === legacy ? "legacy shop" : "Spanish-enabled shop"})`, stream ? "ndjson" : "json", sc, out, { expected: expectedText(sc), streamEqual: stream, stored: true, shop: c.slug });
}

// ---- 3. Owner test line (chat.mjs channel test -> lib/owner-test.mjs runOwnerTest) ---------------
// N5: a withheld rehearsal must not record setup proof. The stored test history and previews are checked.
// Revision 3 (Q6): the owner test on a Spanish-enabled shop gets the bilingual lines.
for (const [c, gen] of [[legacy, () => scenarios({ prep: () => AVAIL, act: BOOK, save: BOOK })], [legacyEs, () => bilingualScenarios({ act: BOOK, save: BOOK })]]) for (const stream of [false, true]) for (const sc of gen()) {
  const contact = "p10test" + (++serial);
  const out = await scripted(sc.turns, () => callChat({ client: c.slug, key: c.ownerKey, channel: "test", contact, messages: [{ role: "user", content: "Book me tomorrow 8 to 12, 5 Pine St, AC out, Lee" }] }, stream));
  const saved = await store.get("owner_tests", `${c.slug}/${contact}`);
  out.stored = JSON.stringify({ messages: (saved?.messages || []).filter((m) => m.role === "assistant").map((m) => m.content), previews: saved?.previews || [] });
  const r = { ...out }; const pre = results.length;
  record(`chat.mjs test line (owner-test.mjs${c === legacy ? "" : ", Spanish-enabled shop"})`, stream ? "ndjson" : "json", sc, r, { expected: expectedText(sc, { prefix: OWNER_PREFIX }), streamEqual: stream, shop: c.slug });
  const row = results[pre];
  if (sc.kind === "incomplete" && out.proofRecorded !== false) { row.problems.push("proof recorded"); row.pass = false; }
}

// ---- 4. Homepage practice persona (chat.mjs persona mode) ----------------------------------------
// The persona path stores no server history (practice history stays in the browser); the summary
// card is the saved action, so after it the fallback is the after-action line.
for (const stream of [false, true]) for (const sc of scenarios({ prep: SUMMARY, act: SUMMARY, save: SUMMARY, prepSaves: true })) {
  const out = await scripted(sc.turns, () => callChat({ persona: "bayou-air", messages: [{ role: "user", content: "My AC is out, I'm Lee at 5 Pine St" }], ip: "10.10.0." + (++serial % 250) }, stream));
  record("chat.mjs practice persona", stream ? "ndjson" : "json", sc, out, { expected: expectedText(sc), streamEqual: stream });
}

// ---- 5. Sales desk (chat.mjs mc mode; requireComplete) -------------------------------------------
for (const stream of [false, true]) for (const sc of scenarios({ prep: () => SALES_TOOL, act: () => SALES_TOOL })) {
  const out = await scripted(sc.turns, () => callChat({ messages: [{ role: "user", content: "Can you help my HVAC shop?" }], ip: "10.20." + (++serial % 250) + ".1" }, stream));
  // Revision 3: the sales desk's cut-off has no 911 line (cut_off_plain).
  const clean = sc.kind === "incomplete" && rejected(sc) ? undefined : expectedText(sc.expect === "cut_off" ? { ...sc, expect: "cut_off_plain" } : sc, { exhausted: SALES_EXHAUSTED });
  record("chat.mjs sales desk", stream ? "ndjson" : "json", sc, out, { expected: clean, requireComplete: true, streamEqual: stream });
}

// ---- 6. Legacy SMS (sms-agent-background.mjs), English shop, Spanish-enabled shop, saved Spanish record --
const smsShop = shop("p10-sms"), smsEs = shop("p10-sms-es", true);
await store.saveClient(smsShop); await store.saveClient(smsEs);
const smsCases = [
  ...scenarios({ prep: () => AVAIL, act: BOOK, save: BOOK }).map((sc) => [smsShop, sc]),
  ...bilingualScenarios({ act: BOOK, save: BOOK }).map((sc) => [smsEs, sc]),
  // An upcoming visit saved in Spanish for this number: its record language picks the fallback.
  [smsShop, { id: "es-record:max_tokens+partial_es", kind: "incomplete", expect: "cut_off", lang: "es", spanishRecord: true, turns: [T("max_tokens", PARTIAL_ES)] }],
  // Revision 3 (D1, Q4): a callback request is a save, a spam flag is not.
  ...leadScenarios().map((sc) => [smsShop, sc]),
  // Revision 3 (Q5): visit changes on this number's upcoming visit are saves.
  [smsShop, { id: "r3:confirm->refusal", kind: "incomplete", expect: "refusal_after_action", existingVisit: true, turns: [T("tool_use", "", UPDATE("confirm")), T("refusal", BOOKED_NOTE)] }],
  [smsShop, { id: "r3:cancel->max_tokens", kind: "incomplete", expect: "cut_off_after_action", existingVisit: true, turns: [T("tool_use", "", UPDATE("cancel")), T("max_tokens", BOOKED_PARTIAL)] }],
  [smsShop, { id: "r3:reschedule->refusal", kind: "incomplete", expect: "refusal_after_action", existingVisit: true, reschedule: true, turns: [T("tool_use", "", UPDATE("reschedule")), T("refusal", BOOKED_NOTE)] }],
];
for (const [c, sc] of smsCases) {
  const from = "+1713557" + String(1000 + (++serial)).padStart(4, "0");
  if (sc.spanishRecord) await desk.bookVisit(c, { ...BOOK("es").input, phone: from }, { channel: "sms", contact: from });
  if (sc.existingVisit) { const b = await desk.bookVisit(c, { ...BOOK("en").input, phone: from }, { channel: "sms", contact: from }); sc.turns = sc.turns.map((t) => t.tool?.name === "update_visit" ? { ...t, tool: { ...t.tool, input: { ...t.tool.input, booking_id: b.id, ...(sc.reschedule ? { date: nextDate(), window: "12 to 5" } : {}) } } } : t); }
  const conv = await store.getConversation(c, "sms", from); conv.messages.push({ role: "user", content: "Book me tomorrow 8 to 12, 5 Pine St, AC out, Lee", at: new Date().toISOString() }); await store.saveConversation(conv);
  sent.length = 0;
  await scripted(sc.turns, () => smsAgent(new Request("http://127.0.0.1:8888/.netlify/functions/sms-agent-background", { method: "POST", headers: { "x-admin-key": "p10-admin" }, body: JSON.stringify({ slug: c.slug, from }) })));
  const stored = (await store.getConversation(c, "sms", from)).messages.filter((m) => m.role === "assistant" && !m.system).map((m) => m.content).join("\n");
  const body = sent.filter((x) => x.to === from).at(-1)?.body ?? null;
  // The legacy word-list trim (proposal 03 replaces it) cuts "Let me get the owner..." from the exhausted
  // tail at base, so that control is compared base vs patched by compare-controls.mjs, not by exact text.
  record(`sms-agent-background.mjs (${c === smsShop ? "English shop" : "Spanish-enabled shop"})`, "sendSMS body", sc, { reply: body, stored }, { expected: sc.id === "control:exhausted" ? undefined : expectedText(sc), stored: true, shop: c.slug });
}

// ---- 7. Thumbtack/platform AI proposal (lib/platform-ai-proposal.mjs; withholdToolText + requireComplete)
const pc = cfg.newClient({ slug: "p10-platform", ownerKey: "p10-platform-key", owner: { email: "p10@example.invalid", phone: "+17135550142" }, business: { name: "Fixture Heating", trade: "HVAC", serviceArea: ["Katy"], hours: "Mon to Fri 8 to 5" } });
pc.status = "testing"; pc.onboarding = { version: 1 }; pc.services = ["AC repair"];
const lead = () => ({ customer_name: "Jamie Customer", issue: "AC repair", platform: { source: "thumbtack", externalLeadId: "p10-" + (++serial), context: { messages: [{ messageID: "100", from: "Customer", text: "Can you fix my AC?", sentAt: new Date().toISOString() }] } } });
for (const sc of scenarios({ prep: () => AVAIL, act: () => AVAIL })) {
  if (sc.id === "control:exhausted") continue; // maxIterations 2 with a forced final turn; not a 3-turn caller
  const out = await scripted(sc.id.startsWith("control:end_turn") || sc.id === "control:tool_use(note)->end_turn" ? sc.turns.map((t) => t.stop === "end_turn" ? { ...t, text: t.text && JSON.stringify({ reply: FINAL, decision: "reply", summary: "Asks about AC.", language: "en", customer_name: "", phone: "", address: "", requested_date: "", requested_window: "", urgency: "flexible" }) } : t) : sc.turns, async () => {
    try { const r = await generatePlatformAIProposal({ client: pc, lead: lead() }); return { reply: r.reply, decision: r.decision }; } catch (e) { return { error: e.code || e.message }; }
  });
  const lines = warns; warns = [];
  // Patched and base must both fail cleanly for incomplete turns (no candidate reply at all).
  const problems = sc.kind === "incomplete" ? (!out.reply && !!out.error ? [] : ["candidate reply"]) : (sc.expect === "empty" ? (!!out.error || !!out.reply ? [] : ["no outcome"]) : (out.reply === FINAL ? [] : ["reply"]));
  problems.push(...logProblems(sc, lines, { requireComplete: true, shop: pc.slug }));
  const leaks = leaked(JSON.stringify(out));
  results.push({ caller: "platform-ai-proposal.mjs (Thumbtack replies)", surface: "proposal reply", scenario: sc.id, kind: sc.kind, pass: leaks.length === 0 && problems.length === 0, leaks, problems, ...out, logs: lines });
}

// ---- 8. Managed SMS (lib/managed-sms.mjs processManagedSMS): derived from the repo's own QA harness
const managedScenarios = [...scenarios({ prep: () => AVAIL, act: BOOK, save: BOOK }).map((sc) => ({ ...sc, spanishShop: false })), ...leadScenarios().map((sc) => ({ ...sc, spanishShop: false })), ...bilingualScenarios({ act: BOOK, save: BOOK }).map((sc) => ({ ...sc, spanishShop: true }))];
const managed = JSON.parse(execFileSync(process.execPath, ["--import", pathToFileURL(resolve(import.meta.dirname, "p10-model-stub.mjs")).href, resolve(import.meta.dirname, "managed-sms-truncation-child.mjs"), repo], { cwd: repo, env: { ...process.env, P10_SCENARIOS: JSON.stringify(managedScenarios) }, encoding: "utf8", maxBuffer: 1 << 24 }).trim().split("\n").at(-1));
for (const row of managed.rows) {
  const sc = managedScenarios.find((s) => s.id === row.scenario);
  const surfaces = { reply: row.reply, deliveries: row.deliveries, inboundReply: row.inboundReply };
  const leaks = leaked(JSON.stringify(surfaces)), problems = [];
  if (sc.kind === "incomplete" && rejected(sc)) { if (row.replyDeliveries.length !== 0) problems.push("queued reply"); } // requireComplete: max_tokens throws, no reply queued
  else {
    // N1: after a saved booking the consent question follows a coherent line, in the booking's language.
    const want = expectedText(sc) + (sc.save ? "\n" + row.consentQuestion[sc.lang === "es" ? "es" : "en"] : "");
    if (row.replyDeliveries.length !== 1 || row.replyDeliveries[0] !== want) problems.push("reply delivery");
  }
  problems.push(...logProblems(sc, row.warns || [], { requireComplete: true, shop: row.slug }));
  results.push({ caller: `managed-sms.mjs (verified texting${sc.spanishShop ? ", Spanish-enabled shop" : ""})`, surface: "queued delivery", scenario: row.scenario, kind: sc.kind, pass: leaks.length === 0 && problems.length === 0, leaks, problems, ...surfaces, replyDeliveries: row.replyDeliveries, otherPurposes: row.otherPurposes, outcome: row.outcome, logs: row.warns || [] });
}
netAttempts += managed.blocked;

// ---- Revision 3 (D2): the repository's own fallback table matches this check and the 134-character limit ----
for (const lang of ["en", "es", "bilingual"]) for (const key of Object.keys(FALLBACK.en)) {
  const got = cfg.AGENT_FALLBACKS?.[lang]?.[key], problems = [];
  if (got !== FALLBACK[lang][key]) problems.push("fallback table");
  if (lang === "bilingual" && [...String(got ?? "")].length > 134) problems.push("bilingual over 134 characters");
  results.push({ caller: "config.mjs AGENT_FALLBACKS", surface: "fixed copy", scenario: `${lang}.${key}`, kind: "incomplete", pass: problems.length === 0, leaks: [], problems, reply: got ?? null, logs: [] });
}

// ---- Report -----------------------------------------------------------------------------------
const incomplete = results.filter((r) => r.kind === "incomplete"), controls = results.filter((r) => r.kind === "control");
const summary = {
  repo: repo.split("/").pop(), at: new Date().toISOString(), netAttempts,
  callers: [...new Set(results.map((r) => r.caller))],
  incomplete: { total: incomplete.length, pass: incomplete.filter((r) => r.pass).length, leaked: incomplete.filter((r) => r.leaks.length).length },
  controls: { total: controls.length, pass: controls.filter((r) => r.pass).length },
  problems: Object.fromEntries([...new Set(results.flatMap((r) => r.problems))].map((p) => [p, results.filter((r) => r.problems.includes(p)).length])),
};
summary.verdict = summary.incomplete.pass === summary.incomplete.total && summary.controls.pass === summary.controls.total && netAttempts === 0 ? "PASS" : "FAIL";
for (const r of results) origLog(`${r.pass ? "ok  " : "FAIL"} ${r.caller} [${r.surface}] ${r.scenario}${r.leaks.length ? " leaked=" + JSON.stringify(r.leaks) : ""}${r.problems.length ? " problems=" + JSON.stringify(r.problems) : ""} reply=${JSON.stringify(r.reply ?? null)}${r.error ? " error=" + r.error : ""}`);
origLog(JSON.stringify(summary));
if (output) writeFileSync(output, JSON.stringify({ summary, results }, null, 2));
process.exit(summary.verdict === "PASS" ? 0 : 1);
