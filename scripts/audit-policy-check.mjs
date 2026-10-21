// S8-05 acceptance: weak-only findings stay recorded without inflating Steve's attention counts.
import assert from "node:assert/strict";
const RealDate = globalThis.Date;
let clock = RealDate.parse("2026-10-22T23:00:00Z"); // 6 pm Houston.
class CheckDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
globalThis.Date = CheckDate;
process.env.MC_MEMORY_STORE = "1";
process.env.ADMIN_KEY = "audit-check-admin";
for (const key of ["ANTHROPIC_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY"]) delete process.env[key];
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Audit policy check must not access the network"); };
try {
const { newClient } = await import("../netlify/functions/lib/config.mjs");
const store = await import("../netlify/functions/lib/store.mjs");
const { dailyDigest, day7Draft } = await import("../netlify/functions/lib/desk.mjs");
const { actionableAuditReasons } = await import("../netlify/functions/lib/audit-policy.mjs");
const { default: admin } = await import("../netlify/functions/admin.mjs");
const c = newClient({ slug: "audit-policy-check", ownerKey: "local", owner: { name: "Test Owner", email: "owner@example.test", phone: "+17135550199" }, business: { name: "Test HVAC", trade: "HVAC" } });
await store.saveClient(c);
const conversation = await store.getConversation(c.slug, "sms", "weak-only");
conversation.autoFlag = { at: new Date().toISOString(), reasons: ["no_address"], test: false };
await store.saveConversation(conversation);
const cases = [
  { contact: "weak-only", reasons: ["no_address"], test: false },
  { contact: "strong-only", reasons: ["price_not_listed"], test: false },
  { contact: "mixed", reasons: ["no_address", "price_not_listed"], test: false },
  { contact: "question", reasons: ["question_unanswered"], test: false },
  { contact: "test-thread", reasons: ["tier0_missed"], test: true },
];
for (const data of cases) await store.logEvent(c.slug, "auto_flag", { channel: data.test ? "test" : "sms", ...data });
const response = await admin(new Request("http://local.test/api/admin?full=1", { headers: { "x-admin-key": "audit-check-admin" } }));
assert.equal(response.status, 200);
assert.equal((await response.json()).clients[0].autoFlags7d, 3, "weak-only and test findings must not inflate Needs-me");
const digest = await dailyDigest(c);
assert.match(digest.steveNote, /Nightly check flagged 3:/);
assert.doesNotMatch(digest.steveNote, /weak-only|test-thread/);
assert.match(digest.steveNote, /mixed/);
assert.match(digest.steveNote, /question/);
assert.equal((await store.listRecords("events", c.slug)).filter(e => e.type === "auto_flag").length, 5, "all raw audit findings must remain recorded");
assert.deepEqual((await store.getConversation(c.slug, "sms", "weak-only")).autoFlag.reasons, ["no_address"]);
assert.deepEqual(actionableAuditReasons({ reasons: ["no_address", "question_unanswered"] }), ["question_unanswered"]);
const draft = await day7Draft(c);
assert.match(draft, /2 price not listed/);
assert.match(draft, /1 question unanswered/);
assert.doesNotMatch(draft, /no address|tier0 missed/, "day-7 summary excludes weak reasons even in mixed findings, and all test findings");

// The 9 pm audit must survive midnight and reach the next 6 pm digest. The DST
// dates also reject a rolling-24h approximation: these digest windows are 25h/23h.
const windows = [
  { name: "midnight", now: "2026-10-22T05:30:00Z", cutoff: "2026-10-21T23:00:00Z", audit: "2026-10-22T02:00:00Z" },
  { name: "next-evening", now: "2026-10-22T23:00:00Z", cutoff: "2026-10-21T23:00:00Z", audit: "2026-10-22T02:00:00Z" },
  { name: "fall-back", now: "2026-11-02T00:00:00Z", cutoff: "2026-10-31T23:00:00Z", audit: "2026-11-01T02:00:00Z" },
  { name: "spring-forward", now: "2027-03-14T23:00:00Z", cutoff: "2027-03-14T00:00:00Z", audit: "2027-03-14T03:00:00Z" },
];
for (const w of windows) {
  clock = RealDate.parse(w.now);
  const shop = newClient({ slug: "audit-" + w.name, ownerKey: "local", owner: { name: "Test Owner", email: "owner@example.test" }, business: { name: "Test " + w.name, trade: "HVAC" } });
  await store.saveClient(shop);
  const cutoff = RealDate.parse(w.cutoff);
  const findings = [
    { contact: "too-old", at: new Date(cutoff - 1).toISOString() },
    { contact: "prior-digest-boundary", at: w.cutoff },
    { contact: "after-cutoff", at: new Date(cutoff + 1).toISOString() },
    { contact: "prior-night", at: w.audit },
    { contact: "weak-only", at: w.audit, reasons: ["no_address"] },
    { contact: "test-thread", at: w.audit, test: true },
    { contact: "future-finding", at: new Date(clock + 1).toISOString() },
  ];
  for (const [i, f] of findings.entries()) await store.put("events", `${shop.slug}/${f.at}_${i}`, { id: String(i), slug: shop.slug, at: f.at, type: "auto_flag", data: { channel: f.test ? "test" : "sms", contact: f.contact, reasons: f.reasons || ["price_not_listed"], test: !!f.test } });
  // Customer activity remains limited to today's Houston day, while the audit
  // section carries the prior night. These fixtures cross midnight in every case.
  for (const [label, createdAt] of [["previous-day", w.audit], ["current-day", w.now]]) {
    await store.put("bookings", `${shop.slug}/${label}`, { id: label, slug: shop.slug, createdAt, customer_name: label, date: "2027-04-01", window: "8 to 12", issue: "AC repair", status: "booked" });
    await store.put("leads", `${shop.slug}/${label}`, { id: label, slug: shop.slug, createdAt, outcome: "needs_action", status: "open", issue: label });
    const v = await store.getConversation(shop.slug, "sms", label); v.flag = { at: createdAt, note: label }; await store.saveConversation(v);
  }
  const result = await dailyDigest(shop);
  assert.match(result.steveNote, /Nightly check flagged 2:/, w.name);
  assert.match(result.steveNote, /after-cutoff/);
  assert.match(result.steveNote, /prior-night/);
  assert.doesNotMatch(result.steveNote, /too-old|prior-digest-boundary|weak-only|test-thread|future-finding/);
  assert.match(result.text, /today: 1 booked.*1 leads need action.*Flagged: 1/, w.name + ": ordinary stats stay on today's Houston day");
  assert.doesNotMatch(result.email, /previous-day/);
  const supplied = await dailyDigest(shop, await store.listRecords("events", shop.slug, 1000));
  assert.equal(supplied.steveNote, result.steveNote, "supplied-event and stored-event digest paths agree");
  assert.equal((await store.listRecords("events", shop.slug, 1000)).length, findings.length, "summary filtering never deletes raw findings");
}
console.log("AUDIT POLICY CHECK OK: raw stamps retained, actionable counts and day-7 reasons, prior-night digest across midnight and both DST changes, today's shop stats preserved");
} finally {
  globalThis.Date = RealDate;
  globalThis.fetch = realFetch;
}
