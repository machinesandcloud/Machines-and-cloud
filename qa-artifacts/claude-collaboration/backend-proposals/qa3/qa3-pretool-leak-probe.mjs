// QA3: which runAgent stop reasons let text written in a tool-calling turn reach the customer (dropToolPreamble). Harness from qa2-sms-trim-probe.
// Proposal 3 acceptance check: the SMS "planning line" trim never drops life-safety text.
// Runs the real netlify/functions/sms-agent-background.mjs handler in-process for every case. The only seam
// is the model: a loader hook points lib/agent.mjs's "./fake-model.mjs" import at a scripted stub that
// returns the case's reply as one end_turn message (MC_FAKE_MODEL=1 path, no network, no provider env).
// The text actually handed to sendSMS (the "[sms:disabled] ... :: body" log line) and the stored
// assistant turn are both compared with the expectation:
//   keep: the whole reply is sent;
//   trim: the first sentence is dropped exactly as before (the S1-21 planning-text cases still work).
// Usage: node sms-trim-safety-check.mjs [--repo <repo root>] [--output <new json path>]
// Expected: FAILS on dfb0ae78 (safety first sentences are dropped), PASSES with 03-sms-trim-safety.patch.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, writeFileSync } from "node:fs";
import { register, syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo") || resolve(import.meta.dirname, "../../.."));
const output = arg("--output");
if (output && existsSync(output)) throw new Error("Choose a new output path: " + output);
const deny = () => { throw new Error("qa3 probe denies real networking"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
let netAttempts = 0; globalThis.fetch = async () => { netAttempts++; deny(); };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|CALENDAR_|MANAGED_|PHONE_|SERVICE_|MC_TWILIO|MC_MESSAGING|STEVE_|ADMIN_KEY|DEPLOY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", ADMIN_KEY: "trim-check-admin", URL: "https://platform.example.test" });

// Scripted model: each runAgent call takes the next queued reply.
const stub = `export function fakeClient() {
  const stream = () => { const t = (globalThis.__trimScript || []).shift() ?? "OK.";
    const sr = globalThis.__stop || "end_turn"; const final = { stop_reason: sr, content: sr === "end_turn" ? [{ type: "text", text: t }] : [{ type: "text", text: t }, { type: "tool_use", id: "tu1", name: "book_visit", input: {} }], usage: { input_tokens: 1, output_tokens: 1 } };
    return { async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text: t } }; }, finalMessage: async () => final }; };
  return { messages: { create: async () => { throw new Error("not scripted"); }, stream }, beta: { messages: { create: async () => { throw new Error("not scripted"); }, stream } } };
}`;
const stubURL = "data:text/javascript," + encodeURIComponent(stub);
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, ctx, next) {
  if (s === "./fake-model.mjs" && ctx.parentURL?.endsWith("/netlify/functions/lib/agent.mjs")) return { url: ${JSON.stringify(stubURL)}, shortCircuit: true };
  return next(s, ctx); }`));

const sent = []; const origLog = console.log, origErr = console.error;
console.log = (...a) => { const s = a.map(String).join(" "); const m = s.match(/^\[sms:disabled\] to=(\S+) from=\S+ :: ([\s\S]*)$/); if (m) sent.push({ to: m[1], body: m[2] }); };
console.error = (...a) => origErr("[handler error]", ...a.map((x) => x instanceof Error ? x.message : x));

const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const store = await import(F("lib/store.mjs"));
const cfg = await import(F("lib/config.mjs"));
const smsAgent = (await import(F("sms-agent-background.mjs"))).default;

function legacyClient(slug, script) {
  const c = cfg.newClient({ slug, ownerKey: "owner-" + slug, owner: { name: "Ray", email: "", phone: "" }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Sat 7am-7pm" } });
  Object.assign(c, { status: "live", services: ["AC repair"], windows: ["8 to 12", "12 to 5"] });
  if (script !== undefined) c.rules.emergencies = { ...cfg.normalizeEmergencies(null, "HVAC"), script };
  return c;
}
const OWNER_A = "Now walk away from the house and phone Atmos at 888-286-6700. We will follow up once you are safe.";
const OWNER_B = "Call Atmos at 888-286-6700 and stay off the property. We will follow up.";
const clients = { default: legacyClient("trim-default"), ownerA: legacyClient("trim-owner-a", OWNER_A), ownerB: legacyClient("trim-owner-b", OWNER_B) };
for (const c of Object.values(clients)) await store.saveClient(c);


const NOTE = "Have name, address, issue, window. Phone filled automatically. Book.";
for (const stop of ["tool_use", "max_tokens", "refusal"]) {
  const c = clients.default, from = "+1713557" + String(1000 + ["tool_use","max_tokens","refusal"].indexOf(stop)).padStart(4, "0");
  const conv = await store.getConversation(c, "sms", from); conv.messages.push({ role: "user", content: "Book me tomorrow 8 to 12, 5 Pine St, AC out, Lee", at: new Date().toISOString() }); await store.saveConversation(conv);
  globalThis.__stop = stop; globalThis.__trimScript = [NOTE, "You're booked for tomorrow 8 to 12.", "OK."]; sent.length = 0;
  await smsAgent(new Request("https://platform.example.test/.netlify/functions/sms-agent-background", { method: "POST", headers: { "x-admin-key": "trim-check-admin" }, body: JSON.stringify({ slug: c.slug, from }) }));
  origLog(JSON.stringify({ repo: repo.split("/").pop(), firstTurnStopReason: stop, firstTurnText: NOTE, sentToCustomer: sent.find((x) => x.to === from)?.body ?? null }));
}
