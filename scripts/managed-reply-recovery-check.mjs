// Managed customer-reply failure (no resend, owner alert) and unverified-number inbound (managed-sms-gaps rev 2).
// Reuses the fixture/provider-double setup of managed-sms-qa-check.mjs (everything before its first
// check), then runs the scenarios below the TAIL marker. Real handlers, installed SDK CAS, fake model,
// zero external network. Usage: node scripts/managed-reply-recovery-check.mjs [--output scratchpad/x.json]
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)), self = readFileSync(fileURLToPath(import.meta.url), "utf8");
const setup = readFileSync(join(here, "managed-sms-qa-check.mjs"), "utf8"), cut = setup.indexOf("\nawait check(");
if (cut < 0) throw new Error("managed-sms-qa-check setup marker not found");
const tail = self.slice(self.indexOf("\n// ---TAIL---") + 1, self.lastIndexOf("*/"));
const temp = join(here, `.managed-reply-recovery-${process.pid}.mjs`);
writeFileSync(temp, setup.slice(0, cut).replace(/^const outputIndex = .*$/m, "const outputIndex = -1, output = null;") + "\n" + tail);
process.on("exit", () => rmSync(temp, { force: true }));
try { await import(pathToFileURL(temp).href); } finally { rmSync(temp, { force: true }); }
/*
// ---TAIL---
process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT = "500"; // many fixtures in one Houston day; per-tenant limits unchanged
const outAt = process.argv.indexOf("--output"), outPath = outAt < 0 ? null : process.argv[outAt + 1];
// Provider double extensions: a POST that fails before reaching the provider, a POST whose response is lost
// after the message was created (optionally stored with a normalised body), and a documented 4xx rejection.
const mode = { throwPost: 0, lostResponse: 0, alterStored: false, reject4xx: 0, lists: 0 }; const priorFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = String(init.method || "GET").toUpperCase();
  if (url.origin === "https://api.twilio.com" && url.pathname === `/2010-04-01/Accounts/${account}/Messages.json`) {
    if (method === "GET") { mode.lists++; return new Response("{}", { status: 503 }); }
    if (method === "POST" && mode.throwPost > 0) { mode.throwPost--; throw new TypeError("fetch failed (network double)"); }
    if (method === "POST" && mode.reject4xx > 0) { mode.reject4xx--; return Response.json({ code: 21610, message: "Attempt to send to unsubscribed recipient", status: 400 }, { status: 400 }); }
    if (method === "POST" && mode.lostResponse > 0) {
      mode.lostResponse--; const r = await priorFetch(input, init), row = await r.json();
      if (mode.alterStored) messages.get(row.sid).body = row.body.replace(/'/g, "’").replace(/\.$/, "");
      throw new TypeError("socket hang up (response lost double)");
    }
  }
  return priorFetch(input, init);
};
const results = [];
async function scenario(name, fn) { try { const note = await fn(); results.push({ name, pass: true, ...(note ? { note } : {}) }); } catch (error) { results.push({ name, pass: false, error: String(error?.message || error).slice(0, 600) }); } }
const sends = f => [...messages.values()].filter(row => row.direction === "outbound-api" && row.from === f.number);
const sentTo = (f, phone = caller) => sends(f).filter(row => row.to === phone).map(row => row.body);
const jobs = async f => store.listJSON("managed_deliveries", f.c.slug + "/");
const replies = async (f, phone = caller) => (await jobs(f)).filter(j => j.channel === "sms" && ["reply", "consent_ask"].includes(j.purpose) && j.to === phone);
const ownerAlerts = async f => (await jobs(f)).filter(j => j.channel === "email" && j.purpose === "owner_lead" && /was not delivered|could not confirm|while texting from it was not switched on/.test(j.body));
const leadsFor = async (f, phone = caller) => (await store.listJSON("leads", f.c.slug + "/")).filter(l => l.phone === phone);
async function refresh(f) { await store.atomicUpdate("messaging_activation", f.row.id, r => ({ value: { ...r, lastVerifiedAt: stamp() } })); }
async function wave(f, n = 1) { for (let i = 0; i < n; i++) { await refresh(f); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 }); } }
async function advance(f, minutes, step = 5) { for (let m = 0; m < minutes; m += step) { clock += step * 60000; await wave(f, 1); } }
async function text(f, body, from = caller) {
  clock += 2000; const fields = inbound(f, body, { from }); fields.From = from;
  const response = await httpHandler(signed(fields)), twiml = await response.text(), id = inboundKey(f, fields);
  if ((await strictRead("managed_sms_inbound", id))?.state === "queued") await processManagedSMS(id);
  await wave(f, 1);
  return { status: response.status, twiml, id, row: await strictRead("managed_sms_inbound", id), fields };
}
const historyLen = async (f, phone = caller) => (await strictRead("managed_sms_history", `${f.c.slug}/${f.tenant}/${phone}`))?.messages?.length || 0;
const failuresIndex = async () => (await strictRead("managed_delivery_pending", "active"))?.failures || {};
const lastAssistant = async f => (await managedSMSConversations(await strictRead("clients", f.c.slug))).find(c => c.contact === caller).messages.filter(m => m.role === "assistant").at(-1);
const NOT_DELIVERED = "Reply not delivered: call or text the customer.";
function oneTextPerReply(f, expected) { const b = sentTo(f); assert.equal(b.length, expected, `customer texts ${b.length}, expected ${expected}: ${JSON.stringify(b.map(x => x.slice(0, 40)))}`); assert.equal(new Set(b).size, b.length, "same text sent twice"); }

await scenario("R0 policy: no automatic resend; unconfirmed alert after 30 minutes", async () => {
  const RR = delivery.REPLY_RECOVERY; assert.ok(RR, "REPLY_RECOVERY missing"); assert.equal(RR.resend, false); assert.equal(RR.unconfirmedMs, 1800000); assert.equal(typeof delivery.recoverManagedReply, "function");
});
await scenario("R1 failed receipt: one text only, shown not delivered, one owner request and email", async () => {
  const f = await fixture("rv-fail"); const prev = sendStatus; sendStatus = "failed"; const r = await text(f, "Can you come Friday?"); sendStatus = prev; await advance(f, 180);
  oneTextPerReply(f, 1); assert.equal((await strictRead("managed_sms_inbound", r.id)).attempts, 1, "model rerun"); assert.equal(await historyLen(f), 2);
  const [job] = await replies(f); assert.equal(job.state, "failed"); assert.equal(job.replyRecovery?.state, "done");
  const leads = await leadsFor(f); assert.equal(leads.length, 1); assert.match(leads[0].issue, /was not delivered\. It was not sent again/); assert.match(leads[0].issue, /Can you come Friday/);
  assert.equal((await ownerAlerts(f)).length, 1); assert.ok(job.id in await failuresIndex(), "operator health signal kept");
  const m = await lastAssistant(f); assert.equal(m.processing, "not_delivered"); assert.equal(m.processingDetail, NOT_DELIVERED);
});
await scenario("R2 network error before the provider: no text ever, owner told after 30 minutes, no list lookups", async () => {
  const f = await fixture("rv-throw"); mode.throwPost = 1; await text(f, "Do you service tankless heaters?"); mode.throwPost = 0;
  await advance(f, 25); assert.equal((await leadsFor(f)).length, 0, "alerted before 30 minutes"); assert.equal((await lastAssistant(f)).processing, "uncertain");
  await advance(f, 180); oneTextPerReply(f, 0);
  const [job] = await replies(f); assert.equal(job.state, "uncertain"); assert.equal(job.replyRecovery?.reason, "unconfirmed");
  assert.equal((await leadsFor(f)).length, 1); assert.match((await leadsFor(f))[0].issue, /could not confirm/); assert.equal((await ownerAlerts(f)).length, 1);
  assert.equal((await lastAssistant(f)).processingDetail, NOT_DELIVERED); assert.equal(mode.lists, 0, "provider list lookups");
});
await scenario("R3 (QA A1) failure, then the customer texts again: the old reply is never sent after the new one", async () => {
  const f = await fixture("rv-a1"); const prev = sendStatus; sendStatus = "failed"; const one = await text(f, "Question one"); sendStatus = prev;
  const two = await text(f, "Hello? any update"); await advance(f, 180);
  const b = sentTo(f); oneTextPerReply(f, 2); assert.equal(b[0], one.row.reply); assert.equal(b[1], two.row.reply);
  assert.equal((await leadsFor(f)).length, 1);
});
await scenario("R4 (QA A2) failure, workspace paused, resumed 3 hours later: no further text", async () => {
  const f = await fixture("rv-a2"); const prev = sendStatus; sendStatus = "failed"; await text(f, "Need help with my sink"); sendStatus = prev;
  const c = await strictRead("clients", f.c.slug); await store.put("clients", f.c.slug, { ...c, status: "paused" }); await advance(f, 180, 15);
  await store.put("clients", f.c.slug, { ...(await strictRead("clients", f.c.slug)), status: "live" }); await advance(f, 120, 10);
  oneTextPerReply(f, 1); assert.equal((await replies(f)).length, 1, "a resend job exists");
});
await scenario("R5 (QA A3) response lost, provider stored a normalised body, no callback: one text, owner told, never resent", async () => {
  const f = await fixture("rv-a3"); mode.lostResponse = 1; mode.alterStored = true; await text(f, "Is Saturday possible? I'm free."); mode.lostResponse = 0; mode.alterStored = false;
  await advance(f, 240); assert.equal(sends(f).filter(m => m.to === caller).length, 1, "customer texts");
  const [job] = await replies(f); assert.equal(job.state, "uncertain"); assert.equal(job.replyRecovery?.reason, "unconfirmed"); assert.equal((await leadsFor(f)).length, 1);
});
await scenario("R6 (QA A4) response lost, owner told, then a verified delivered callback: corrected to delivered, request resolved, one text", async () => {
  const f = await fixture("rv-a4"); mode.lostResponse = 1; await text(f, "Do you install water softeners?"); mode.lostResponse = 0;
  await advance(f, 40); let [job] = await replies(f); assert.equal(job.replyRecovery?.state, "done"); assert.equal((await leadsFor(f))[0].outcome, "needs_action");
  const sid = sends(f).find(m => m.to === caller).sid; Object.assign(messages.get(sid), { status: "delivered", num_segments: "1" });
  const fields = { AccountSid: account, MessageSid: sid, From: job.from, To: job.to, MessageStatus: "delivered" };
  assert.equal((await httpHandler(signed(fields, { path: "/api/managed-sms/status?job=" + encodeURIComponent(job.id) }))).status, 204);
  await advance(f, 60); [job] = await replies(f); assert.equal(job.state, "delivered"); assert.equal(job.providerId, sid); assert.ok(job.replyRecovery.deliveredLaterAt);
  const [lead] = await leadsFor(f); assert.equal(lead.outcome, "resolved"); assert.deepEqual(lead.undeliveredReplies, {}); assert.equal((await ownerAlerts(f)).length, 1, "a second owner email");
  oneTextPerReply(f, 1); const m = await lastAssistant(f); assert.ok(!m.processing, "portal still shows " + m.processing);
});
await scenario("R6b response lost, owner told, callback binds the message as sent, the scheduled receipt read sees delivered: request resolved", async () => {
  const f = await fixture("rv-poll"); mode.lostResponse = 1; await text(f, "Can you look at my water heater?"); mode.lostResponse = 0;
  await advance(f, 40); let [job] = await replies(f); assert.equal(job.replyRecovery?.state, "done");
  const sid = sends(f).find(m => m.to === caller).sid; Object.assign(messages.get(sid), { status: "sent" });
  assert.equal((await httpHandler(signed({ AccountSid: account, MessageSid: sid, From: job.from, To: job.to, MessageStatus: "sent" }, { path: "/api/managed-sms/status?job=" + encodeURIComponent(job.id) }))).status, 204);
  [job] = await replies(f); assert.equal(job.state, "accepted"); assert.equal((await leadsFor(f))[0].outcome, "needs_action");
  Object.assign(messages.get(sid), { status: "delivered", num_segments: "1" }); await advance(f, 20);
  [job] = await replies(f); assert.equal(job.state, "delivered"); assert.equal((await leadsFor(f))[0].outcome, "resolved"); oneTextPerReply(f, 1);
});
await scenario("R7 failed receipt, then a verified delivered callback for the same message: status corrected, request resolved", async () => {
  const f = await fixture("rv-late"); await text(f, "Quote for a new toilet?"); let [job] = await replies(f); assert.ok(job.providerId);
  await receipt(f, job, "undelivered", "1"); await advance(f, 10); [job] = await replies(f); assert.equal(job.state, "failed"); assert.equal(job.replyRecovery?.state, "done");
  await receipt(f, job, "delivered", "1"); [job] = await replies(f); assert.equal(job.state, "delivered");
  assert.equal((await leadsFor(f))[0].outcome, "resolved"); oneTextPerReply(f, 1); assert.ok(!(job.id in await failuresIndex()), "failure index not cleared");
});
await scenario("R8 documented 4xx rejection: failed at once, no text, owner told", async () => {
  const f = await fixture("rv-4xx"); mode.reject4xx = 1; await text(f, "Is anyone there?"); await advance(f, 60);
  oneTextPerReply(f, 0); const [job] = await replies(f); assert.equal(job.state, "failed"); assert.equal(job.reasonCode, "provider_rejected"); assert.equal(job.providerErrorCode, 21610);
  assert.equal((await leadsFor(f)).length, 1); assert.equal((await ownerAlerts(f)).length, 1);
});
await scenario("R9 dedupe: two undelivered replies to one customer the same Houston day give one request and one email", async () => {
  const f = await fixture("rv-dedupe"); const prev = sendStatus; sendStatus = "failed";
  await text(f, "First question"); await advance(f, 20); await text(f, "Second question"); await advance(f, 20); sendStatus = prev;
  oneTextPerReply(f, 2); const leads = await leadsFor(f); assert.equal(leads.length, 1); assert.equal(Object.keys(leads[0].undeliveredReplies).length, 2); assert.equal((await ownerAlerts(f)).length, 1);
});
await scenario("R10 status callback marks a reply failed: the durable sweep alerts the owner, no text", async () => {
  const f = await fixture("rv-callback"); await text(f, "Do you do drain cleaning?"); const [job] = await replies(f);
  await receipt(f, job, "undelivered", "1"); assert.equal((await leadsFor(f)).length, 0); await wave(f, 1);
  assert.equal((await leadsFor(f)).length, 1); oneTextPerReply(f, 1);
});
await scenario("R11 (QA S1) failures from deleted or changed workspaces are marked handled and cannot starve the sweep", async () => {
  const dead = []; const prev = sendStatus; sendStatus = "failed";
  for (let i = 0; i < 27; i++) { const f = await fixture("rv-dead-" + i); await text(f, "Dead " + i); dead.push(f); }
  sendStatus = prev;
  // Make each failure fresh again (no follow-up yet) and remove or change its workspace.
  for (const [i, f] of dead.entries()) { const [job] = await replies(f); const { replyRecovery, ...bare } = job; await store.put("managed_deliveries", job.id, bare);
    await store.atomicUpdate("managed_delivery_pending", "active", v => ({ value: { ...v, failures: { ...v.failures, [job.id]: { state: "failed", at: stamp() } } } }));
    if (i % 2) await store.del("clients", f.c.slug); else await store.put("clients", f.c.slug, { ...(await strictRead("clients", f.c.slug)), onboarding: { version: 1, tenantIdentity: "changed-" + i } }); }
  const live = await fixture("rv-zz-live"); const before = Object.keys(await failuresIndex()); sendStatus = "failed"; await text(live, "Real failure"); sendStatus = prev;
  const [job] = await replies(live); const { replyRecovery, ...bare } = job; await store.put("managed_deliveries", job.id, bare);
  await store.atomicUpdate("managed_delivery_pending", "active", v => ({ value: { ...v, failures: { ...v.failures, [job.id]: { state: "failed", at: stamp() } } } }));
  for (let i = 0; i < 3; i++) await delivery.runManagedDelivery({ limit: 1, discoveryLimit: 0 });
  assert.equal((await strictRead("managed_deliveries", job.id)).replyRecovery?.state, "done", "real failure starved");
  const idx = await failuresIndex(); const open = dead.map(f => Object.keys(idx).find(k => k.startsWith(f.c.slug + "/"))).filter(k => k && !idx[k].followedUp);
  assert.equal(open.length, 0, "dead entries not marked handled: " + open.length); return `index entries before=${before.length}`;
});
await scenario("R12 unverified number: text saved and shown, owner request and email queued, nothing sent, duplicates collapse", async () => {
  const f = await fixture("rv-unverified", { state: "awaiting_test" }); const probe = await sms.pendingMessagingProbe(f.c), toCustomer = () => [...messages.values()].filter(m => m.direction === "outbound-api" && m.from === f.number && !(probe && m.to === probe.to && m.body === probe.body)).length, before = toCustomer();
  const r = await text(f, "Can someone come look at my AC?"); assert.equal(r.status, 200); assert.doesNotMatch(r.twiml, /<Message>/);
  assert.equal(r.row?.state, "held"); assert.equal(r.row.reasonCode, "sender_not_ready");
  assert.equal((await httpHandler(signed(r.fields))).status, 200, "webhook retry"); await text(f, "Hello?"); await wave(f, 2);
  assert.equal(toCustomer(), before, "texted from an unverified sender");
  const rows = (await store.listJSON("managed_sms_inbound", `${f.c.slug}/${f.tenant}/`)).filter(row => row.from === caller); assert.equal(rows.length, 2); assert.ok(rows.every(row => row.state === "held"));
  const leads = await leadsFor(f); assert.equal(leads.length, 1); assert.match(leads[0].issue, /look at my AC/); assert.equal((await ownerAlerts(f)).length, 1);
  const conv = (await managedSMSConversations(f.c)).find(c => c.contact === caller); assert.equal(conv.messages.length, 2); assert.ok(conv.messages.every(m => m.role === "user" && m.processing === "not_answered" && /Saved in your requests/.test(m.processingDetail)));
  assert.deepEqual(await processManagedSMS(r.id), { ok: true, skipped: true }); assert.equal(await historyLen(f), 0);
});
await scenario("R13 gates: with service delivery switched off, nothing is planned or alerted", async () => {
  const f = await fixture("rv-gate"); const prev = sendStatus; sendStatus = "failed"; await text(f, "Can you fix a faucet?"); sendStatus = prev; await advance(f, 10);
  const [job] = await replies(f); assert.equal(job.state, "failed"); const { replyRecovery, ...bare } = job; await store.put("managed_deliveries", job.id, bare);
  for (const l of await leadsFor(f)) await store.del("leads", `${f.c.slug}/${l.id}`);
  process.env.SERVICE_DELIVERY_ENABLED = "false"; try { const out = await delivery.recoverManagedReply(f.c, bare); assert.equal(out.replyRecovery, undefined); assert.equal((await leadsFor(f)).length, 0); } finally { process.env.SERVICE_DELIVERY_ENABLED = "true"; }
  const on = await delivery.recoverManagedReply(f.c, bare); assert.equal(on.replyRecovery?.state, "done", "positive control");
});
await scenario("R14 healthy path unchanged: one text, no recovery field, no alert, index clean", async () => {
  const f = await fixture("rv-healthy"); await text(f, "What are your hours?"); await advance(f, 60); const [job] = await replies(f);
  oneTextPerReply(f, 1); assert.equal(job.replyRecovery, undefined); assert.equal((await ownerAlerts(f)).length, 0); assert.ok(!(job.id in await failuresIndex()));
});
await scenario("R15 paid capacity: 4xx rejection releases the text hold; one model request; no resend", async () => {
  const f = await fixture("rv-paid"); await fundCapacity(f, { voiceMinutes: 3, smsSegments: 4, aiAnswers: 2 }); const fields = inbound(f, "When do you close today?");
  process.env.MC_FAKE_MODEL = "0"; process.env.ANTHROPIC_API_KEY = "offline-capacity-model";
  try {
    assert.equal((await httpHandler(signed(fields))).status, 200); const before = paidModelRequests.length; mode.reject4xx = 1;
    const processed = await processManagedSMS(inboundKey(f, fields)); assert.equal(processed.ok, true, JSON.stringify(processed)); await advance(f, 60);
    assert.equal(paidModelRequests.length, before + 1, "model requests " + JSON.stringify(processed) + " " + JSON.stringify(await strictRead("managed_sms_inbound", inboundKey(f, fields))).slice(0, 400)); oneTextPerReply(f, 0);
    const usage = await capacityUsage.paidUsageStatus(f.c), [job] = await replies(f); assert.equal(job.state, "failed");
    assert.equal(usage.units.smsSegments.held, 0, "sms hold"); assert.equal(usage.units.smsSegments.used, 0); assert.equal(usage.units.aiAnswers.held, 0, "answer hold");
    return `aiAnswers used=${usage.units.aiAnswers.used}`;
  } finally { process.env.MC_FAKE_MODEL = "1"; delete process.env.ANTHROPIC_API_KEY; mode.reject4xx = 0; }
});
await scenario("R17 (QA B9) the undelivered first reply carried the automated intro: the next delivered reply discloses; history marks the turn", async () => {
  const f = await fixture("rv-b9"); const prev = sendStatus; sendStatus = "failed"; const one = await text(f, "Hi, do you fix garage doors?"); sendStatus = prev; await advance(f, 10);
  assert.match(one.row.reply, /^Automated assistant/); const [job] = await replies(f); assert.equal(job.state, "failed"); assert.equal(job.replyRecovery?.state, "done");
  const h = await strictRead("managed_sms_history", `${f.c.slug}/${f.tenant}/${caller}`); assert.ok(!h.disclosedAt, "disclosedAt kept from an undelivered reply");
  assert.ok(h.messages.some(m => m.role === "assistant" && m.content === one.row.reply + "\n[Not delivered: the customer never received this message.]"), "history turn not marked");
  const two = await text(f, "Hello? Are you there?"); await advance(f, 10);
  const b = sentTo(f); oneTextPerReply(f, 2); assert.match(b[1], /^Automated assistant/, "delivered reply lacks the disclosure: " + b[1].slice(0, 60)); assert.equal(b[1], two.row.reply);
  assert.ok((await strictRead("managed_sms_history", `${f.c.slug}/${f.tenant}/${caller}`)).disclosedAt, "disclosedAt not restored by the delivered intro");
});
await scenario("R18 (QA B6) a request resolved by a late delivery reopens when a new reply fails the same day", async () => {
  const f = await fixture("rv-b6"); await text(f, "Quote for a water heater?"); let [job] = await replies(f);
  await receipt(f, job, "undelivered", "1"); await advance(f, 10); await receipt(f, job, "delivered", "1");
  let [lead] = await leadsFor(f); assert.equal(lead.outcome, "resolved"); assert.ok(lead.resolvedAt);
  const h0 = await strictRead("managed_sms_history", `${f.c.slug}/${f.tenant}/${caller}`); assert.ok(!h0.messages.some(m => /\[Not delivered/.test(m.content)), "marker kept after a verified delivery");
  const prev = sendStatus; sendStatus = "failed"; await text(f, "Also, can you come Monday?"); sendStatus = prev; await advance(f, 10);
  [lead] = await leadsFor(f); assert.equal(lead.outcome, "needs_action", "request still shows resolved"); assert.equal(lead.resolvedAt, null); assert.equal(lead.resolution, null);
  assert.equal(Object.keys(lead.undeliveredReplies).length, 1); assert.equal((await leadsFor(f)).length, 1); assert.equal((await ownerAlerts(f)).length, 1, "owner emails"); oneTextPerReply(f, 2);
});
await scenario("R16 global: every customer reply was attempted at most once; every SMS job with a provider id has a provider message", async () => {
  const sms = (await store.listJSON("managed_deliveries", "", 2000)).filter(d => d.channel === "sms");
  for (const d of sms) { if (["reply", "consent_ask"].includes(d.purpose)) assert.ok((d.attempts || 0) <= 1, "reply attempted twice " + d.id); if (d.providerId) assert.ok(messages.has(d.providerId)); }
  assert.ok(!sms.some(d => d.retry), "resend job exists"); return `sms jobs=${sms.length}`;
});
const failed = results.filter(r => !r.pass);
const out = { at: new NativeDate().toISOString(), blocked: report.blocked, results, providerSends: report.providerSends, lists: mode.lists };
console.log(JSON.stringify(out, null, 1)); console.log(`managed-reply-recovery-check: ${results.length - failed.length}/${results.length}`);
if (outPath) writeFileSync(outPath, JSON.stringify(out, null, 1));
process.exitCode = failed.length || report.blocked.length ? 1 : 0; // no process.exit: the composing wrapper removes its temp module
*/
