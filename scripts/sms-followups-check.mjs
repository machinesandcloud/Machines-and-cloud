// sms-followups (release 4 QA follow-ups 1 and 2): orphaned failure-index entries cannot starve the owner-alert
// sweep, and an account-wide Twilio rejection alerts the operator once a day and each shop owner at most once a
// day, while every affected reply is still marked not delivered and saved as its own request.
// Reuses the fixture/provider-double setup of managed-sms-qa-check.mjs (everything before its first check).
// Real handlers, installed SDK CAS, fake model, zero external network.
// Usage: node scripts/sms-followups-check.mjs [--output scratchpad/x.json]
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)), self = readFileSync(fileURLToPath(import.meta.url), "utf8");
const setup = readFileSync(join(here, "managed-sms-qa-check.mjs"), "utf8"), cut = setup.indexOf("\nawait check(");
if (cut < 0) throw new Error("managed-sms-qa-check setup marker not found");
const tail = self.slice(self.indexOf("\n// ---TAIL---") + 1, self.lastIndexOf("*/"));
const temp = join(here, `.sms-followups-${process.pid}.mjs`);
writeFileSync(temp, setup.slice(0, cut).replace(/^const outputIndex = .*$/m, "const outputIndex = -1, output = null;") + "\n" + tail);
process.on("exit", () => rmSync(temp, { force: true }));
try { await import(pathToFileURL(temp).href); } finally { rmSync(temp, { force: true }); }
/*
// ---TAIL---
process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT = "500";
process.env.ADMIN_EMAILS = "ops@example.test";
const outAt = process.argv.indexOf("--output"), outPath = outAt < 0 ? null : process.argv[outAt + 1];
// Provider double extensions: Twilio account-level 401 (code 20003), a per-message 400 (21610), and a failing
// Resend response for the operator mailbox. Every Resend POST is recorded (recipient and subject only).
// rev 2: a hanging operator mailbox (answers only by honouring the abort signal) and a hook that runs once when a
// given delivery record is read (to change the index between the sweep's read and its removal).
const mode = { reject401: 0, reject4xx: 0, operatorEmailFails: 0, operatorHangs: 0, onRecordRead: null }, mail = []; const priorFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = String(init.method || "GET").toUpperCase();
  if (mode.onRecordRead && method === "GET" && decodeURIComponent(url.pathname).includes(mode.onRecordRead.key)) { const hook = mode.onRecordRead; mode.onRecordRead = null; await hook.run(); }
  if (url.origin === "https://api.twilio.com" && url.pathname === `/2010-04-01/Accounts/${account}/Messages.json` && method === "POST") {
    if (mode.reject401 > 0) { mode.reject401--; return Response.json({ code: 20003, message: "Authenticate", status: 401 }, { status: 401 }); }
    if (mode.reject4xx > 0) { mode.reject4xx--; return Response.json({ code: 21610, message: "Attempt to send to unsubscribed recipient", status: 400 }, { status: 400 }); }
  }
  if (url.origin === "https://api.resend.com" && url.pathname === "/emails" && method === "POST") {
    const data = JSON.parse(init.body); mail.push({ to: data.to, subject: data.subject });
    if (mode.operatorHangs > 0 && data.to.includes("ops@example.test")) { mode.operatorHangs--; return new Promise((_, reject) => { if (!init.signal) return; init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }); }); }
    if (mode.operatorEmailFails > 0 && data.to.includes("ops@example.test")) { mode.operatorEmailFails--; return Response.json({ message: "fixture failure" }, { status: 500 }); }
  }
  return priorFetch(input, init);
};
const results = [];
async function scenario(name, fn) { try { const note = await fn(); results.push({ name, pass: true, ...(note ? { note } : {}) }); } catch (error) { results.push({ name, pass: false, error: String(error?.message || error).slice(0, 600) }); } }
const jobs = async f => store.listJSON("managed_deliveries", f.c.slug + "/");
const replies = async f => (await jobs(f)).filter(j => j.channel === "sms" && j.purpose === "reply");
const outageEmails = async f => (await jobs(f)).filter(j => j.channel === "email" && /^Texting is temporarily unavailable/.test(j.body));
const perCustomerEmails = async f => (await jobs(f)).filter(j => j.channel === "email" && j.purpose === "owner_lead" && !/^Texting is temporarily unavailable/.test(j.body));
const leads = async f => store.listJSON("leads", f.c.slug + "/");
const operatorMail = () => mail.filter(m => m.to.includes("ops@example.test"));
const customerTexts = f => [...messages.values()].filter(m => m.direction === "outbound-api" && m.from === f.number).length;
const failuresIndex = async () => (await strictRead("managed_delivery_pending", "active"))?.failures || {};
async function refresh(f) { await store.atomicUpdate("messaging_activation", f.row.id, r => ({ value: { ...r, lastVerifiedAt: stamp() } })); }
async function text(f, body, from) {
  clock += 2000; await refresh(f); const fields = inbound(f, body, { from }); fields.From = from;
  const response = await httpHandler(signed(fields)), id = inboundKey(f, fields);
  if ((await strictRead("managed_sms_inbound", id))?.state === "queued") await processManagedSMS(id);
  await refresh(f); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  return { status: response.status, id };
}
const phone = (shop, n) => "+1832555" + String(1000 + shop * 100 + n).slice(-4);

await scenario("F1 orphaned failure-index entries: 30 orphans plus 1 real failure, the real failure is alerted within 2 runs", async () => {
  // The real failure arrives by status callback, so only the durable sweep can alert the owner.
  const f = await fixture("zz-real"); await text(f, "Can you fix a leaking pipe?", caller); let [job] = await replies(f);
  await receipt(f, job, "undelivered", "1"); [job] = await replies(f); assert.equal(job.state, "failed"); assert.equal(job.replyRecovery, undefined); assert.equal((await leads(f)).length, 0);
  const orphans = Array.from({ length: 30 }, (_, i) => `sms-qa-aaa-orphan-${String(i).padStart(2, "0")}/${hash("orphan" + i)}`);
  await store.atomicUpdate("managed_delivery_pending", "active", v => ({ value: { ...v, failures: { ...v.failures, ...Object.fromEntries(orphans.map(k => [k, { state: "failed", at: stamp() }])), [job.id]: { state: "failed", at: stamp() } } } }));
  const idx0 = await failuresIndex(), open = Object.keys(idx0).filter(k => !idx0[k].followedUp).sort(); assert.ok(open.indexOf(job.id) >= 30, "real failure must sort after the orphans");
  for (let i = 0; i < 2; i++) await delivery.runManagedDelivery({ limit: 1, discoveryLimit: 0 });
  const after = await strictRead("managed_deliveries", job.id); assert.equal(after.replyRecovery?.state, "done", "real failure starved by orphaned entries");
  assert.equal((await leads(f)).length, 1, "owner request not saved"); assert.match((await leads(f))[0].issue, /was not delivered/);
  const idx = await failuresIndex(); assert.equal(orphans.filter(k => k in idx).length, 0, "orphans left in the index");
  assert.ok(job.id in idx, "real failure health signal kept"); assert.equal(customerTexts(f), 1, "resent");
});
await scenario("F2 an orphan whose pending entry still carries a snapshot is left for snapshot restore, not dropped", async () => {
  const key = `sms-qa-aab-snap/${hash("snap")}`;
  await store.atomicUpdate("managed_delivery_pending", "active", v => ({ value: { ...v, entries: { ...v.entries, [key]: { dueAt: new Date(clock + 86400000).toISOString(), createdAt: stamp(), snapshot: { id: key, state: "queued" } } }, failures: { ...v.failures, [key]: { state: "uncertain", at: stamp() } } } }));
  await delivery.runManagedDelivery({ limit: 1, discoveryLimit: 0 });
  assert.ok(key in await failuresIndex(), "snapshot-backed failure dropped");
  await store.atomicUpdate("managed_delivery_pending", "active", v => { const { [key]: _e, ...entries } = v.entries, { [key]: _f, ...failures } = v.failures; return { value: { ...v, entries, failures } }; });
});
await scenario("F2b (rev 2, QA N1) an orphan whose failure entry changes after the sweep read it is kept", async () => {
  const key = `sms-qa-aac-race/${hash("race")}`, first = { state: "failed", at: new Date(clock - 60000).toISOString() }, newer = { state: "failed", at: stamp() };
  await store.atomicUpdate("managed_delivery_pending", "active", v => ({ value: { ...v, failures: { ...v.failures, [key]: first } } }));
  mode.onRecordRead = { key, run: () => store.atomicUpdate("managed_delivery_pending", "active", v => ({ value: { ...v, failures: { ...v.failures, [key]: newer } } })) };
  await delivery.runManagedDelivery({ limit: 1, discoveryLimit: 0 }); assert.equal(mode.onRecordRead, null, "sweep never read the record");
  assert.deepEqual((await failuresIndex())[key], newer, "newer failure entry removed");
  await delivery.runManagedDelivery({ limit: 1, discoveryLimit: 0 }); assert.ok(!(key in await failuresIndex()), "unchanged orphan not removed on the next run");
});
await scenario("F3 classification: account-level by HTTP 401 or Twilio code 10001/20003/20005 only", async () => {
  const k = delivery.accountWideSMSRejection; assert.equal(typeof k, "function");
  assert.equal(k(401, 20003), true); assert.equal(k(401, 99999), true); assert.equal(k(403, 20005), true); assert.equal(k(400, 10001), true);
  assert.equal(k(400, 21610), false); assert.equal(k(400, 21211), false); assert.equal(k(403, 21612), false); assert.equal(k(404, 20404), false);
});
const shops = [];
await scenario("F4 account-wide 401 across 3 shops x 4 customers: 1 operator email, 1 owner email per shop, 12 requests, every reply not delivered", async () => {
  for (let s = 0; s < 3; s++) shops.push(await fixture("storm" + s));
  const before = operatorMail().length; mode.reject401 = 1000;
  for (const [s, f] of shops.entries()) for (let n = 0; n < 4; n++) await text(f, `Customer ${n} at shop ${s}: can you come today?`, phone(s, n));
  for (const f of shops) { await refresh(f); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 }); }
  assert.equal(operatorMail().length - before, 1, "operator emails " + (operatorMail().length - before));
  for (const [s, f] of shops.entries()) {
    const r = await replies(f); assert.equal(r.length, 4); assert.equal(customerTexts(f), 0, "a customer text went out");
    for (const j of r) { assert.equal(j.state, "failed"); assert.equal(j.reasonCode, "provider_rejected"); assert.equal(j.providerScope, "account"); assert.equal(j.attempts, 1); assert.equal(j.replyRecovery?.state, "done"); }
    const ls = await leads(f); assert.equal(ls.length, 4, "one request per affected customer"); assert.deepEqual(new Set(ls.map(l => l.phone)), new Set([0, 1, 2, 3].map(n => phone(s, n))));
    for (const l of ls) { assert.match(l.issue, /Texting is temporarily unavailable on our side/); assert.match(l.issue, /It was not sent again/); assert.match(l.issue, /can you come today/); assert.ok(l.replyOutage?.day); }
    assert.equal((await outageEmails(f)).length, 1, "outage owner emails for shop " + s); assert.equal((await perCustomerEmails(f)).length, 0, "per-customer owner emails for shop " + s);
    const [email] = await outageEmails(f); assert.equal(email.to, f.c.owner.email); assert.match(email.body, /not reaching your customers/); assert.match(email.body, /call or text them yourself/); assert.ok(!/\+1832/.test(email.body), "customer number in the shared email");
    const conv = await managedSMSConversations(await strictRead("clients", f.c.slug));
    for (let n = 0; n < 4; n++) { const m = conv.find(c => c.contact === phone(s, n)).messages.filter(x => x.role === "assistant").at(-1); assert.equal(m.processing, "not_delivered", "portal for customer " + n); }
  }
  const health = await strictRead("health", "managedSMS:accountOutage"); assert.equal(health.count, 12); assert.equal(health.status, 401); assert.equal(health.code, 20003); assert.ok(health.emailedAt);
  const run = await delivery.runManagedDelivery({ limit: 1, discoveryLimit: 0 }); assert.equal(run.ok, false);
});
await scenario("F5 later the same Houston day (+3 h): more failures add requests, but no second operator or owner email", async () => {
  clock += 3 * 3600000; const op = operatorMail().length;
  for (const [s, f] of shops.entries()) { await text(f, "Another customer, same day", phone(s, 9)); await text(f, "Follow-up from an earlier customer", phone(s, 0)); }
  assert.equal(operatorMail().length, op, "operator re-alerted the same day");
  for (const [s, f] of shops.entries()) { assert.equal((await leads(f)).length, 5); assert.equal((await outageEmails(f)).length, 1); assert.equal((await perCustomerEmails(f)).length, 0); assert.equal(customerTexts(f), 0);
    const repeat = (await leads(f)).find(l => l.phone === phone(s, 0)); assert.equal(Object.keys(repeat.undeliveredReplies).length, 2, "second undelivered reply not recorded on the customer's request"); }
  // Discovery backfill re-reads every lead: still one owner email per shop.
  for (let i = 0; i < 3; i++) await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  for (const f of shops) assert.equal((await outageEmails(f)).length, 1, "backfill queued another outage email");
});
await scenario("F6 next Houston day: one new operator email and one new owner email per shop", async () => {
  clock += 24 * 3600000; const op = operatorMail().length;
  for (const [s, f] of shops.entries()) { await text(f, "Next day question", phone(s, 1)); await text(f, "Next day, another", phone(s, 2)); }
  assert.equal(operatorMail().length - op, 1);
  for (const f of shops) { assert.equal((await outageEmails(f)).length, 2); assert.equal((await perCustomerEmails(f)).length, 0); }
});
await scenario("F7 the operator email itself fails: no retry within 15 minutes, retried after, then deduped", async () => {
  clock += 24 * 3600000; mode.operatorEmailFails = 1; const op = operatorMail().length, [f] = shops;
  await text(f, "Day three first", phone(0, 3)); assert.equal(operatorMail().length - op, 1);
  let h = await strictRead("health", "managedSMS:accountOutage"); assert.equal(h.emailedAt, null);
  clock += 5 * 60000; await text(f, "Day three +5 min", phone(0, 4)); assert.equal(operatorMail().length - op, 1, "retried within 15 minutes");
  clock += 15 * 60000; await text(f, "Day three +20 min", phone(0, 5)); assert.equal(operatorMail().length - op, 2, "not retried after 15 minutes");
  h = await strictRead("health", "managedSMS:accountOutage"); assert.ok(h.emailedAt);
  clock += 30 * 60000; await text(f, "Day three +50 min", phone(0, 6)); assert.equal(operatorMail().length - op, 2, "re-alerted after a confirmed send");
});
await scenario("F7b (rev 2, QA R1) hanging operator mailbox: the run returns promptly, another shop's reply is delivered, the timeout is retried", async () => {
  clock += 24 * 3600000; const a = await fixture("hang-a"), b = await fixture("hang-b"), op = operatorMail().length;
  mode.reject401 = 0; mode.operatorHangs = 1;
  const queue = async (f, body, from) => { clock += 2000; await refresh(f); const fields = inbound(f, body, { from }); fields.From = from; await httpHandler(signed(fields)); const id = inboundKey(f, fields); if ((await strictRead("managed_sms_inbound", id))?.state === "queued") await processManagedSMS(id); };
  await queue(a, "Shop A customer during the outage", phone(7, 1)); await queue(b, "Shop B customer", phone(8, 1));
  await refresh(a); await refresh(b); mode.reject401 = 1; // the first Twilio POST (shop A sorts first) is the account-level 401
  const t0 = NativeDate.now(); let timer;
  const result = await Promise.race([delivery.runManagedDelivery({ limit: 50, discoveryLimit: 0 }), new Promise(r => { timer = setTimeout(() => r("HUNG"), 12000); })]); clearTimeout(timer);
  const ms = NativeDate.now() - t0; assert.notEqual(result, "HUNG", "run still blocked after 12 s"); assert.ok(ms < 7500, "run took " + ms + " ms");
  const [ja] = await replies(a), [jb] = await replies(b); assert.equal(ja.state, "failed"); assert.equal(ja.providerScope, "account"); assert.equal(ja.replyRecovery?.state, "done", "shop A owner not told");
  assert.ok(["accepted", "delivered"].includes(jb.state), "shop B reply state " + jb.state); assert.equal(customerTexts(b), 1); assert.equal(customerTexts(a), 0);
  assert.equal(operatorMail().length - op, 1, "operator send attempted once");
  let h = await strictRead("health", "managedSMS:accountOutage"); assert.equal(h.emailedAt, null); assert.equal(h.lastError, "timeout"); assert.ok(h.attemptAt);
  clock += 20 * 60000; mode.reject401 = 1000; await text(a, "Shop A, 20 minutes later", phone(7, 2));
  h = await strictRead("health", "managedSMS:accountOutage"); assert.ok(h.emailedAt, "timeout not retried after 15 minutes"); assert.equal(h.lastError, null); assert.equal(operatorMail().length - op, 2);
  return `run ${ms} ms`;
});
await scenario("F7c (rev 2, QA R1) the send cap also respects a run with less than 5 s left", async () => {
  clock += 24 * 3600000; const a = await fixture("hang-c"), op = operatorMail().length; mode.reject401 = 0; mode.operatorHangs = 1;
  clock += 2000; await refresh(a); const fields = inbound(a, "Short run customer", { from: phone(9, 1) }); fields.From = phone(9, 1); await httpHandler(signed(fields)); const id = inboundKey(a, fields); if ((await strictRead("managed_sms_inbound", id))?.state === "queued") await processManagedSMS(id);
  await refresh(a); mode.reject401 = 1; const t0 = NativeDate.now(); let timer;
  const result = await Promise.race([delivery.runManagedDelivery({ limit: 50, discoveryLimit: 0, budgetMs: 2000 }), new Promise(r => { timer = setTimeout(() => r("HUNG"), 12000); })]); clearTimeout(timer);
  const ms = NativeDate.now() - t0; assert.notEqual(result, "HUNG"); assert.ok(ms < 3500, "run took " + ms + " ms with a 2 s budget");
  assert.equal(operatorMail().length - op, 1); const h = await strictRead("health", "managedSMS:accountOutage"); assert.equal(h.emailedAt, null); assert.ok(["timeout", "no_time_left"].includes(h.lastError), h.lastError);
  const [j] = await replies(a); assert.equal(j.state, "failed"); assert.equal(j.providerScope, "account"); mode.reject401 = 0;
  return `run ${ms} ms`;
});
await scenario("F8 control: a per-message 400 (21610) is not account-wide: per-customer owner email, no operator email", async () => {
  mode.reject401 = 0; clock += 24 * 3600000; const f = await fixture("msg400"), op = operatorMail().length; mode.reject4xx = 1;
  await text(f, "Is anyone there?", caller); mode.reject4xx = 0;
  const [j] = await replies(f); assert.equal(j.state, "failed"); assert.equal(j.providerErrorCode, 21610); assert.equal(j.providerScope, undefined);
  assert.equal((await perCustomerEmails(f)).length, 1); assert.equal((await outageEmails(f)).length, 0); assert.equal(operatorMail().length, op); assert.ok(!(await leads(f))[0].replyOutage);
});
await scenario("F9 control: healthy path after the outage: one text, no recovery, no alert", async () => {
  const f = await fixture("healthy"), op = operatorMail().length; await text(f, "What are your hours?", caller);
  const [j] = await replies(f); assert.equal(customerTexts(f), 1); assert.equal(j.replyRecovery, undefined); assert.equal(j.providerScope, undefined); assert.equal((await leads(f)).length, 0); assert.equal(operatorMail().length, op);
});
await scenario("F10 global: no customer reply attempted twice", async () => {
  const sms = (await store.listJSON("managed_deliveries", "", 4000)).filter(d => d.channel === "sms" && d.purpose === "reply");
  for (const d of sms) assert.ok((d.attempts || 0) <= 1, "reply attempted twice " + d.id); return `reply jobs=${sms.length}`;
});
const failed = results.filter(r => !r.pass);
const out = { at: new NativeDate().toISOString(), blocked: report.blocked, results, providerSends: report.providerSends, emailPosts: mail.length, operatorEmails: operatorMail().length };
console.log(JSON.stringify(out, null, 1)); console.log(`sms-followups-check: ${results.length - failed.length}/${results.length}`);
if (outPath) writeFileSync(outPath, JSON.stringify(out, null, 1));
process.exitCode = failed.length || report.blocked.length ? 1 : 0;
*/
