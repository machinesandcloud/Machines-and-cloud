// Separate, explicitly authorized local rehearsal. Never reads .env or starts a server.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { newClient, DAYS } from "../netlify/functions/lib/config.mjs";

const args = process.argv.slice(2), opt = (k, fallback) => args.includes(k) ? args[args.indexOf(k) + 1] : fallback;
const KEY = "pm-local-owner-key", OWNER = "+17135550199", NOW = new Date().toISOString();
const day = n => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + n * 86400000));
const slug = n => `pm-matrix-${String(n === 2 ? 1 : n).padStart(2, "0")}`;
const phone = n => `+171355501${String(30 + n).padStart(2, "0")}`;
const line = n => `+128155501${String(20 + n).padStart(2, "0")}`;
const booked = n => ({ id: `pmseed${n}`, slug: slug(n), createdAt: NOW, customer_name: "PM Test Customer", phone: phone(n), address: "12 Oak St Katy TX 77494", issue: "AC not cooling", date: day(3), window: "8 to 12", urgency: "this_week", language: n === 18 ? "es" : "en", status: "booked", notes: "", source: { channel: "sms", contact: phone(n) } });
function fixture() {
  const f = { clients: {}, index: {}, bookings: {}, tasks: {}, conversations: {} };
  for (let n = 1; n <= 18; n++) {
    if (n === 2) continue;
    const c = newClient({ slug: slug(n), ownerKey: KEY, owner: { name: "Dana", email: `pm-matrix-${n}@example.test`, phone: OWNER },
      business: { name: `PM Test Matrix ${n} HVAC`, website: "", trade: "HVAC", city: "Houston", serviceArea: ["Katy", "Cypress"], notServed: ["The Woodlands"], hours: "Daily 24 hours", afterHours: "After-hours emergency visit $189 plus the $89 service call", spanish: true, licenses: "TACLA 12345" } });
    c.plan = "growth"; c.status = "live"; c.liveAt = NOW;
    c.services = ["AC repair", "AC replacement", "heating repair", "maintenance"];
    c.fees = [{ label: "Service call", amount: "$89", note: "goes toward repair" }, { label: "After-hours emergency fee", amount: "$189", note: "plus service call" }];
    c.windows = ["8 to 12", "12 to 5"];
    c.rules.hours = Object.fromEntries(DAYS.map(d => [d, { open: "00:00", close: "24:00" }]));
    if ([3, 15].includes(n)) {
      // All-day closure deterministically exercises after-hours prompts without replacing the system clock.
      c.rules.hours = Object.fromEntries(DAYS.map(d => [d, { open: "00:00", close: "00:00" }]));
      c.business.hours = "Closed except 24/7 emergency calls"; c.rules.emergency247 = true;
    }
    c.phone = { ...c.phone, businessNumber: "+17135550100", twilioNumber: line(n), forwarding: "none", tenDlc: "approved" };
    f.clients[c.slug] = c; f.index[`number:${line(n)}`] = c.slug; f.index[`email:${c.owner.email}`] = c.slug;
    if ([8, 9, 13, 18].includes(n)) {
      const b = booked(n); f.bookings[`${c.slug}/${b.id}`] = b; f.index[`bookings:${c.slug}:${b.phone}`] = [b.id];
      for (const [i, type] of ["reminder_24h", "reminder_1h", "visit_check"].entries()) {
        const dueAt = new Date(Date.now() + (i + 1) * 86400000).toISOString(), id = `pmtask${n}-${i}`;
        f.tasks[`${dueAt}_${id}`] = { id, slug: c.slug, dueAt, type, data: { bookingId: b.id }, createdAt: NOW };
      }
    }
  }
  return f;
}
if (args.includes("--fixture-out")) { writeFileSync(opt("--fixture-out"), JSON.stringify(fixture(), null, 2) + "\n"); console.log("Wrote synthetic 18-case fixture; no server/model call."); process.exit(0); }
if (!args.includes("--run")) {
  console.log(JSON.stringify({ runOnlyAfterRootAuthorization: true, cases: 18, fixtureShops: 17, inputStrategy: "Case1 two turns; case2 reuses contact1; case9 R fast-path then model SMS reschedule; other model cases full minimal inputs. Cases13/18 include deterministic opt-outs. Per-case synthetic shops prevent cross-case capacity effects.", maxLogicalModelCalls: 60, outputs: "Exact requests/replies, records/events/tasks, semantic checks, model-vs-deterministic markers, code fingerprint. PM must read replies independently.", unitOnlyReferences: "Case19 capacity and calendar-failure scripts are referenced with actual supplied artifacts, never called real-model/real-provider evidence." }, null, 2)); process.exit(0);
}
if (!args.includes("--confirm-local-real-model")) throw new Error("Root must authorize real-model matrix and confirm no provider keys.");
const base = new URL(opt("--base", ""));
if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || !base.port || base.pathname !== "/" || base.search || base.hash || base.username || base.password) throw new Error("Explicit loopback HTTP origin required.");
const output = opt("--output"); if (!output) throw new Error("--output required.");
const maximum = Number(opt("--max-model-calls", "60")); if (!Number.isInteger(maximum) || maximum < 1 || maximum > 60) throw new Error("Allowance must be1..60; server guards actual attempts including retries.");
const selectedCases = opt("--cases") ? opt("--cases").split(",").map(Number) : Array.from({ length: 18 }, (_, i) => i + 1);
if (!selectedCases.length || new Set(selectedCases).size !== selectedCases.length || selectedCases.some(n => !Number.isInteger(n) || n < 1 || n > 18)) throw new Error("--cases must contain unique case numbers1..18.");
const hash = d => createHash("sha256").update(d).digest("hex");
function fingerprint() { const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".mjs") ? [`${d}/${e.name}`] : []); return hash([...walk("netlify/functions"), "scripts/local-server.mjs", "package.json", "package-lock.json"].sort().map(p => `${p}\0${hash(readFileSync(p))}\n`).join("")); }
const report = { startedAt: NOW, commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), relevantCodeSha256: fingerprint(), runnerSha256: hash(readFileSync(new URL(import.meta.url))), base: base.origin, selectedCases, originalEvidence: opt("--original-evidence", null), realModelRehearsal: true, liveProviderAcceptance: false, maximumLogicalCalls: maximum, logicalCallsReserved: 0, cases: [], requests: [], unitReferences: [], requiresIndependentPMReplyReview: true };
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
function reserve(n = 3) { if (report.logicalCallsReserved + n > maximum) throw new Error("Logical model-call budget reached."); report.logicalCallsReserved += n; save(); }
async function req(path, body, form = false) {
  const r = await fetch(new URL(path, base), { method: body === undefined ? "GET" : "POST", headers: { "x-admin-key": "local-admin", ...(body === undefined ? {} : { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" }) }, body: body === undefined ? undefined : form ? new URLSearchParams(body) : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(180000) });
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  report.requests.push({ at: new Date().toISOString(), path, body, status: r.status, response: data }); save();
  if (!r.ok) throw new Error(`Local API failure ${r.status} at ${path}`);
  return data;
}
const admin = (n, action, rest = {}) => req("/api/admin", { slug: slug(n), action, ...rest });
const recs = async (n, kind) => (await admin(n, "records", { kind })).records;
async function chat(n, text, contact = `pmcase${n === 2 ? 1 : n}`) { reserve(); return req("/api/chat", { client: slug(n), key: KEY, channel: "test", contact, stream: false, messages: [{ role: "user", content: text }] }); }
async function sms(n, text, usesModel = false) { if (usesModel) reserve(); return req("/api/sms", { From: phone(n), To: line(n), Body: text }, true); }
let current;
function check(name, pass, actual) { current.checks.push({ name, pass: !!pass, ...(actual === undefined ? {} : { actual }) }); save(); }
const hasWindow = text => /8\s*(?:to|a|–|-)\s*12|12\s*(?:to|a|–|-)\s*5/i.test(text);
const safetyFirst = text => /\bleave\b|\bget out\b|\boutside\b|\bevacuat|\bmove\b.*\bcool\b|\bcall 911\b/i.test(text.split(/[.!?]/)[0]);
const noPlan = text => !/^(?:Have name|Phone filled|Need name|Got address|Book now)\b/i.test(text);
const details = n => `My name is PM Test Customer, phone ${phone(n)}, address 12 Oak St, Katy, TX 77494.`;
const notBooked = async n => (await recs(n, "bookings")).length === 0;
const rules = {
  1: async () => { let r = await chat(1, `My AC isn't cooling. I'm in Katy. Do you serve here and what is the service call? I'd like ${day(3)}, 8 to 12.`); check("area and fee before intake", /Katy|serve|cover/i.test(r.reply) && /\$89|89/.test(r.reply), r.reply); r = await chat(1, `${details(1)} Please book ${day(3)}, 8 to 12. I agree to receive appointment texts.`); const b = await recs(1, "bookings"); check("listed window booked", b.length === 1 && b[0].date === day(3) && /8/.test(b[0].window), b); check("consent once and customer-facing reply", /STOP/.test(r.reply) && noPlan(r.reply), r.reply); },
  2: async () => { const r = await chat(2, "What is my visit's arrival window and reference?"); const b = await recs(1, "bookings"); check("returning contact knows visit and no duplicate", b.length === 1 && hasWindow(r.reply) && r.reply.includes(b[0].id), r.reply); current.limitations.push("The existing/new owner-alert distinction is verified in keyed booking flows; an information-only returning turn need not create a new alert."); },
  3: async () => { const r = await chat(3, `The AC is out and my 84-year-old mother is home. We need help tonight. ${details(3)}`); const leads = await recs(3, "leads"); check("after-hours vulnerable customer opens emergency with safety first", safetyFirst(r.reply) && leads.some(l => l.urgency === "emergency") && (await admin(3, "tasks")).tasks.some(t => t.type === "escalate"), { reply: r.reply, leads }); },
  4: async () => { const r = await chat(4, `I want an AC visit ${day(3)}, 9 to 11. ${details(4)}`); check("only published windows offered", hasWindow(r.reply) && await notBooked(4), r.reply); },
  5: async () => { const r = await chat(5, `My AC is noisy in The Woodlands, ZIP 77380. ${details(5).replace("Katy", "The Woodlands").replace("77494", "77380")}`); check("outside area refused without booking", await notBooked(5) && /(?:not|don't|do not|outside|unable|unfortunately|isn't).*(?:serve|area|cover)|(?:Woodlands).*(?:outside|not|don't)/i.test(r.reply), r.reply); },
  6: async () => { const r = await chat(6, `Can I talk to a person? ${details(6)}`); const leads = await recs(6, "leads"); check("owner name, callback window, wants-call lead", /Dana/.test(r.reply) && /30\s*minutes|8\s*a\.?m/i.test(r.reply) && leads.some(l => l.reason === "wants_call"), { reply: r.reply, leads }); },
  7: async () => { const r = await chat(7, `I smell gas by the furnace. ${details(7)}`); check("safety first and no booking", /leave|outside|evacuat/i.test(r.reply.split(/[.!?]/)[0]) && /911/.test(r.reply) && await notBooked(7), r.reply); },
  8: async () => { const r = await chat(8, `I need to cancel my visit on ${day(3)}. ${details(8)}`); check("cancellation request preserves visit pending owner", (await recs(8, "bookings")).find(b => b.id === "pmseed8")?.status === "booked" && (await recs(8, "leads")).some(l => /cancel/i.test(l.issue)), r.reply); },
  10: async () => { const r = await chat(10, `Hola, mi aire no enfría. Estoy en Katy. Agéndeme para ${day(3)}, de 8 a 12. Soy PM Test Customer, teléfono ${phone(10)}, dirección 12 Oak St, Katy TX 77494. Sí, acepto los mensajes sobre mi cita.`); const b = await recs(10, "bookings"); check("Spanish booking and Spanish consent", b.length === 1 && b[0].language === "es" && /mensaj|recibir|cita|agend/i.test(r.reply) && /STOP|ALTO/.test(r.reply) && !/You're booked|The tech|Reply STOP/.test(r.reply), r.reply); current.limitations.push("Local Spanish wording is not named-reviewer approval or a real Spanish voice call."); },
  11: async () => { const r = await chat(11, "How much to replace the entire AC system?"); const amounts = [...r.reply.matchAll(/\$([\d,]+)/g)].map(m => m[1]); check("on-site quote, no invented price", /tech|Dana|on.site|inspect|look|confirm/i.test(r.reply) && amounts.every(x => ["89", "189"].includes(x)), r.reply); },
  12: async () => { const r = await chat(12, `Can you be here at exactly 9 on ${day(3)}? ${details(12)}`); check("declines exact time and offers window", /can't|cannot|don't|do not|rather|instead|window/i.test(r.reply) && hasWindow(r.reply), r.reply); },
  13: async () => { await sms(13, "Is an AC tune-up covered by the service call?", true); const stopped = await sms(13, "STOP"); const opts = await recs(13, "optouts"); check("STOP recorded and scheduled customer sends cancelled", opts.some(o => o.phone === phone(13)) && (await admin(13, "tasks")).tasks.length === 0, stopped); const again = await sms(13, "Can you still hear me?"); check("opted-out subsequent text silent", !/<Message>/.test(again), again); },
  14: async () => { const r = await chat(14, "Is this a real person?"); check("honest assistant identity and no planning text", /assistant|AI|artificial/i.test(r.reply) && noPlan(r.reply), r.reply); },
  15: async () => { const r = await chat(15, `My AC is out, it's 95 degrees today and my mother is 84. ${details(15)}`); check("after-hours heat/vulnerable safety first, emergency and published fee", safetyFirst(r.reply) && (await recs(15, "leads")).some(l => l.urgency === "emergency") && /189/.test(r.reply), r.reply); },
  16: async () => { let r = await chat(16, "AC is out, it's 78 tonight, just me."); check("mild-temperature first turn offers next listed window without emergency", hasWindow(r.reply) && !(await recs(16, "leads")).some(l => l.urgency === "emergency"), r.reply); r = await chat(16, `${details(16)} Tomorrow, 8 to 12 works. Please book it.`); const leads = await recs(16, "leads"), b = await recs(16, "bookings"); check("next-window booking has non-emergency prompt urgency", !leads.some(l => l.urgency === "emergency") && b.length === 1 && ["today", "this_week"].includes(b[0].urgency), { reply: r.reply, bookings: b, leads }); },
  17: async () => { let r = await chat(17, "I smell gas."); check("Tier0 safety before intake, no booking", safetyFirst(r.reply) && /911/.test(r.reply) && await notBooked(17), r.reply); if (args.includes("--safety-follow-up")) { r = await chat(17, `I am outside. ${details(17)}`); check("gas follow-up keeps safety before owner/tool summary", safetyFirst(r.reply) && (await recs(17, "leads")).some(l => l.urgency === "emergency") && await notBooked(17), r.reply); } },
  18: async () => { const first = await sms(18, "ALTO"); const second = await sms(18, "ALTO"); check("Spanish unsubscribe once, opt-out and task cancellation", /ya no|recibir|mensaj/i.test(first) && !/<Message>/.test(second) && (await recs(18, "optouts")).some(o => o.phone === phone(18)) && (await admin(18, "tasks")).tasks.length === 0, { first, second }); current.modelCallForCase = false; },
};
try {
  const initial = await req("/api/admin");
  if (initial.clients.length !== 17 || initial.clients.some(c => !/^pm-matrix-\d+$/.test(c.slug))) throw new Error("Isolated matrix fixture was not restored exactly.");
  for (const n of selectedCases) {
    current = { case: n, checks: [], limitations: [], modelCallForCase: n !== 18 }; report.cases.push(current);
    // Case9 task assertion must observe state after its model SMS callback completes.
    if (n === 9) {
      const fast = await sms(9, "R"); check("R uses actual SMS fast path", /Which day and window/i.test(fast), fast);
      await sms(9, `Please move my visit to ${day(4)}, 12 to 5.`, true);
      const b = (await recs(9, "bookings")).find(b => b.id === "pmseed9"); current.tasks = (await admin(9, "tasks")).tasks;
      check("SMS reschedule changes date/window on same booking", b?.date === day(4) && /12/.test(b.window), b);
      check("SMS reschedule recreates three tasks", ["reminder_24h", "reminder_1h", "visit_check"].every(type => current.tasks.some(t => t.type === type && t.data?.bookingId === b.id)), current.tasks);
      current.limitations.push("Calendar write and delivered owner notification remain provider-keyed; local fixture has no Google refresh token.");
    } else await rules[n]();
    current.events = await recs(n, "events");
    if (current.events.some(e => e.type === "sms_agent_failed")) throw new Error(`SMS model API/pipeline error in case${n}; stopped globally.`);
    current.pass = current.checks.every(c => c.pass); save();
    console.log(JSON.stringify({ case: n, checks: current.checks.length, pass: current.pass, logicalCallsReserved: report.logicalCallsReserved }));
  }
  for (const [label, flag] of [["Case19 capacity: offline only", "--capacity-evidence"], ["Calendar-failure scenarios: injected local faults only", "--calendar-evidence"]]) {
    const path = opt(flag); report.unitReferences.push(path ? { label, evidencePath: path, sha256: hash(readFileSync(path)), realModel: false, providerDelivery: false } : { label, evidencePath: null, status: "not attached; do not count as passed" });
  }
  report.result = report.cases.every(c => c.pass) ? "automated local checks passed; independent PM reply review required" : "local acceptance failures recorded";
  if (report.cases.some(c => !c.pass)) process.exitCode = 1;
} catch (e) { report.result = "incomplete"; report.error = String(e?.message || e); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); report.finishedRelevantCodeSha256 = fingerprint(); report.relevantCodeChangedDuringRun = report.relevantCodeSha256 !== report.finishedRelevantCodeSha256; save(); console.log(JSON.stringify({ result: report.result, error: report.error, evidence: output, cases: report.cases.length, logicalCallsReserved: report.logicalCallsReserved })); }
