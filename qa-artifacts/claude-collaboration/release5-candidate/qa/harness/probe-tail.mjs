// ---- Independent release-4/5 QA probe (appended to managed-sms-qa-check setup; same file runs on prod and candidate) ----
process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT = "500";
const PHASE = process.env.QA_PHASE || "transcript", OUT = process.env.QA_OUT;
const wire = []; const prior = globalThis.fetch; const mode = { throwPost: 0, reject: null, status5xx: 0, rejectAll: null, hangOp: 0 };
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = String(init.method || "GET").toUpperCase();
  if (url.origin === "https://api.twilio.com" && url.pathname.endsWith("/Messages.json") && method === "POST") {
    const p = new URLSearchParams(init.body); wire.push({ kind: "sms", to: p.get("To"), from: p.get("From"), body: p.get("Body"), cb: p.get("StatusCallback")?.replace(/job=[^&]+/, "job=*") });
    if (mode.throwPost > 0) { mode.throwPost--; throw new TypeError("fetch failed (qa double)"); }
    if (mode.rejectAll) return Response.json({ code: mode.rejectAll.code, message: "qa account rejection" }, { status: mode.rejectAll.status });
    if (mode.reject) { const r = mode.reject; mode.reject = null; return Response.json({ code: r.code, message: "qa rejection" }, { status: r.status }); }
    if (mode.status5xx > 0) { mode.status5xx--; return Response.json({ code: 20500, message: "qa 5xx" }, { status: 500 }); }
  }
  if (url.origin === "https://api.resend.com" && method === "POST") { const d = JSON.parse(init.body); wire.push({ kind: "email", to: d.to, subject: d.subject, text: d.text, html: d.html ? hash(d.html) : null, at: clock });
    if (mode.hangOp > 0 && /^Texting is down/.test(d.subject || "")) { mode.hangOp--; const t0 = performance.now(); const w = wire.at(-1), keep = setTimeout(() => { w.neverAborted = true; }, 30000); return new Promise((_, rej) => init.signal?.addEventListener("abort", () => { clearTimeout(keep); w.abortedAfterMs = Math.round(performance.now() - t0); rej(init.signal.reason); })); } }
  return prior(input, init);
};
const out = { phase: PHASE, results: [] };
async function sc(name, fn) { try { const note = await fn(); out.results.push({ name, pass: true, ...(note !== undefined ? { note } : {}) }); } catch (e) { out.results.push({ name, pass: false, error: String(e?.stack || e).slice(0, 900), diag: globalThis.__hr }); } }
const jobs = async f => store.listJSON("managed_deliveries", f.c.slug + "/");
const custSends = (f, phone) => [...messages.values()].filter(r => r.direction === "outbound-api" && r.from === f.number && (!phone || r.to === phone));
async function refresh(f) { await store.atomicUpdate("messaging_activation", f.row.id, r => ({ value: { ...r, lastVerifiedAt: stamp() } })); }
async function wave(fs, n = 1) { for (let i = 0; i < n; i++) { for (const f of [].concat(fs)) await refresh(f); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 }); } }
async function advance(fs, minutes, step = 5) { for (let m = 0; m < minutes; m += step) { clock += step * 60000; await wave(fs, 1); } }
async function text(f, body, from = caller, extra = {}) {
  clock += 2000; const fields = inbound(f, body, { from }); fields.From = from; Object.assign(fields, extra);
  const res = await httpHandler(signed(fields)), twiml = await res.text(), id = inboundKey(f, fields);
  if ((await strictRead("managed_sms_inbound", id))?.state === "queued") await processManagedSMS(id);
  await wave(f, 1); return { status: res.status, twiml, id, row: await strictRead("managed_sms_inbound", id) };
}
function emailPolicyFor(fs, limit) {
  const p = { version: "qa_r4_email_" + (++serial), expiresAt: new Date(clock + 30 * 86400000).toISOString(), mode: "cohort", providerCredentialHash: hash(process.env.RESEND_API_KEY), senderHash: hash(process.env.FROM_EMAIL), accountLimit: 1000, tenantLimit: limit, tenants: fs.map(f => ({ slug: f.c.slug, identity: f.tenant, emailHash: hash(f.c.owner.email) })) };
  process.env.MANAGED_EMAIL_BUDGET_POLICY_JSON = JSON.stringify(p); process.env.MANAGED_EMAIL_BUDGET_APPROVED_VERSION = p.version;
}
async function ownerMail(f) { f.c = await strictRead("clients", f.c.slug); f.c.onboarding.verifiedEmail = f.c.owner.email; await store.put("clients", f.c.slug, f.c); }

if (PHASE === "transcript") {
  // Same steps on production and candidate; every outbound wire request and every TwiML body is recorded.
  await sc("T healthy transcript", async () => {
    const f = await fixture("tx"); await ownerMail(f); emailPolicyFor([f], 50); const t = [];
    for (const body of ["What are your hours?", "Can someone come look at a leaking pipe tomorrow morning?", "HELP", "AYUDA", "STOP", "hello are you there", "START", "Thanks, what about Monday?"]) { const r = await text(f, body); t.push({ in: body, status: r.status, twiml: r.twiml, state: r.row?.state ?? null, reply: r.row?.reply ?? null }); }
    for (const j of await jobs(f)) if (j.channel === "sms" && j.providerId) await receipt(f, j, "delivered", "1");
    await advance(f, 60);
    const js = (await jobs(f)).map(j => ({ channel: j.channel, purpose: j.purpose, state: j.state, body: j.body, recovery: j.replyRecovery ?? null })).sort((a, b) => (a.purpose + a.body).localeCompare(b.purpose + b.body));
    const conv = (await managedSMSConversations(await strictRead("clients", f.c.slug))).map(c => c.messages.map(m => ({ role: m.role, content: m.content, processing: m.processing ?? null, detail: m.processingDetail ?? null })));
    out.transcript = { steps: t, wire, jobs: js, conversation: conv, leads: (await store.listJSON("leads", f.c.slug + "/")).map(l => ({ reason: l.reason, issue: l.issue, outcome: l.outcome ?? null })) };
  });
} else if (PHASE === "outage") {
  const isCustReply = j => j.channel === "sms" && ["reply", "consent_ask"].includes(j.purpose);
  const opMails = () => wire.filter(w => w.kind === "email" && /^Texting is down/.test(w.subject || ""));
  const ownerOutage = f => wire.filter(w => w.kind === "email" && /^Texting is temporarily unavailable/.test(w.subject || "") && [].concat(w.to).includes(f.c.owner.email));
  const smsPosts = f => wire.filter(w => w.kind === "sms" && w.from === f.number).length;
  let fs;
  await sc("O1 account-wide 401/20003: 3 shops x 4 customers -> 1 operator email, 1 owner outage email per shop, 12 requests, 1 POST per reply, nothing resent over 26h", async () => {
    fs = [await fixture("oa"), await fixture("ob"), await fixture("oc")]; for (const f of fs) await ownerMail(f); emailPolicyFor(fs, 50);
    const p0 = fs.map(smsPosts); mode.rejectAll = { status: 401, code: 20003 };
    for (let i = 0; i < 12; i++) { const f = fs[i % 3]; await text(f, "Need help with my AC " + i, "+1281555" + String(4000 + i)); }
    await advance(fs, 120, 10);
    const posts = fs.map((f, i) => smsPosts(f) - p0[i]);
    const replies = (await Promise.all(fs.map(jobs))).flat().filter(isCustReply);
    assert.equal(replies.length, 12); assert.ok(replies.every(j => j.state === "failed" && j.reasonCode === "provider_rejected" && j.providerScope === "account" && (j.attempts || 0) <= 1), JSON.stringify(replies.map(j => [j.state, j.reasonCode, j.providerScope, j.attempts])));
    assert.deepEqual(posts, [4, 4, 4], "POSTs " + posts);
    assert.equal(opMails().length, 1, "operator mails " + opMails().length);
    assert.deepEqual(fs.map(f => ownerOutage(f).length), [1, 1, 1]);
    const leads = (await Promise.all(fs.map(f => store.listJSON("leads", f.c.slug + "/")))).flat();
    assert.equal(leads.length, 12); assert.ok(leads.every(l => /Texting is temporarily unavailable on our side/.test(l.issue) && l.replyOutage?.day));
    const otherOwnerMails = wire.filter(w => w.kind === "email" && fs.some(f => [].concat(w.to).includes(f.c.owner.email)) && !/^Texting is temporarily unavailable/.test(w.subject || ""));
    const health = await strictRead("health", "managedSMS:accountOutage");
    const p1 = fs.map(smsPosts); await advance(fs, 26 * 60, 60); const resent = fs.map((f, i) => smsPosts(f) - p1[i]);
    assert.deepEqual(resent, [0, 0, 0], "resent " + resent);
    return { posts, operator: opMails().map(m => ({ to: m.to, subject: m.subject, text: m.text })), ownerOutageEmail: ownerOutage(fs[0])[0], otherOwnerMails: otherOwnerMails.map(m => m.subject), health, sampleLeadIssue: leads[0].issue };
  });
  await sc("O2 next Houston day: one more operator email and one more owner email per affected shop", async () => {
    const op0 = opMails().length, ow0 = fs.map(f => ownerOutage(f).length);
    for (const f of fs) await text(f, "day two question", "+17135559911"); await advance(fs, 60, 10);
    assert.equal(opMails().length - op0, 1); assert.deepEqual(fs.map((f, i) => ownerOutage(f).length - ow0[i]), [1, 1, 1]);
    return { day2Health: await strictRead("health", "managedSMS:accountOutage") };
  });
  await sc("O3 operator email hangs: aborted within ~5 s, run continues, recorded as timeout; no retry inside 15 min; retried after 15 min", async () => {
    clock += 24 * 3600000; for (const f of fs) await refresh(f); mode.hangOp = 1; const op0 = opMails().length; const t0 = performance.now();
    const hr = await text(fs[0], "hang test", "+17135559912"); globalThis.__hr = { state: hr.row?.state, reason: hr.row?.reasonCode, jobs: (await jobs(fs[0])).filter(j => j.to === "+17135559912").map(j => [j.purpose, j.state, j.reasonCode, j.providerScope]), health: await strictRead("health", "managedSMS:accountOutage"), lastWire: wire.slice(-3).map(w => [w.kind, w.subject || w.body?.slice(0, 40), w.abortedAfterMs]) }; const ms = Math.round(performance.now() - t0);
    const h1 = await strictRead("health", "managedSMS:accountOutage");
    assert.equal(opMails().length - op0, 1); assert.ok(opMails().at(-1).abortedAfterMs <= 5500, "aborted after " + opMails().at(-1).abortedAfterMs); assert.equal(h1.lastError, "timeout"); assert.ok(!h1.emailedAt);
    clock += 5 * 60000; await refresh(fs[1]); await text(fs[1], "within 15", "+17135559913"); assert.equal(opMails().length - op0, 1, "retried too soon");
    clock += 11 * 60000; await refresh(fs[2]); await text(fs[2], "after 15", "+17135559914"); const h2 = await strictRead("health", "managedSMS:accountOutage");
    assert.equal(opMails().length - op0, 2, "no retry after 15"); assert.ok(h2.emailedAt);
    clock += 30 * 60000; await refresh(fs[0]); await text(fs[0], "after success", "+17135559915"); assert.equal(opMails().length - op0, 2, "sent again after success");
    return { textCallMs: ms, abortedAfterMs: opMails().at(-2).abortedAfterMs, h1, h2: await strictRead("health", "managedSMS:accountOutage") };
  });
  await sc("O4 non-account rejection (400/21610) keeps the per-customer path: no outage email, no providerScope, no operator email", async () => {
    mode.rejectAll = null; clock += 24 * 3600000; const f = await fixture("od"); await ownerMail(f); emailPolicyFor([...fs, f], 50); const op0 = opMails().length;
    mode.reject = { status: 400, code: 21610 }; await text(f, "price check", "+17135559920"); await advance(f, 60, 10);
    const [j] = (await jobs(f)).filter(isCustReply); assert.equal(j.state, "failed"); assert.ok(!j.providerScope); assert.equal(opMails().length, op0); assert.equal(ownerOutage(f).length, 0);
    const lead = (await store.listJSON("leads", f.c.slug + "/"))[0]; assert.ok(!lead.replyOutage); return { issue: lead.issue, ownerSubjects: wire.filter(w => w.kind === "email" && [].concat(w.to).includes(f.c.owner.email)).map(w => w.subject) };
  });
  await sc("O5 classifier table (401 by status; 10001/20003/20005 by code)", async () => {
    const { accountWideSMSRejection } = await import("../netlify/functions/lib/managed-delivery.mjs");
    return { "401/null": accountWideSMSRejection(401, null), "400/20005": accountWideSMSRejection(400, 20005), "403/20003": accountWideSMSRejection(403, 20003), "400/21610": accountWideSMSRejection(400, 21610), "429/20429": accountWideSMSRejection(429, 20429) };
  });
} else {
  const isCustReply = j => j.channel === "sms" && ["reply", "consent_ask"].includes(j.purpose);
  const ownerAlerts = async f => (await jobs(f)).filter(j => j.channel === "email" && j.purpose === "owner_lead");
  await sc("F1 failed receipt: exactly one customer text, never resent over 26h, job failed (not delivered/accepted), owner request", async () => {
    const f = await fixture("f1"); sendStatus = "failed"; await text(f, "Do you fix water heaters?"); sendStatus = "sent"; await advance(f, 26 * 60, 30);
    const s = custSends(f, caller); assert.equal(s.length, 1); const r = (await jobs(f)).filter(isCustReply); assert.equal(r.length, 1); assert.equal(r[0].state, "failed"); assert.ok(!r[0].deliveredAt);
    assert.equal((await store.listJSON("leads", f.c.slug + "/")).length, 1); return { attempts: r[0].attempts };
  });
  await sc("F2 network throw before provider: zero texts reach provider, job uncertain not sent, no second POST in 26h", async () => {
    const f = await fixture("f2"); const w0 = wire.filter(w => w.kind === "sms" && w.from === f.number).length; mode.throwPost = 1; await text(f, "Need a drain cleaned"); await advance(f, 26 * 60, 30);
    const posts = wire.filter(w => w.kind === "sms" && w.from === f.number).length - w0; assert.equal(posts, 1, "POST attempts " + posts); assert.equal(custSends(f, caller).length, 0);
    const [j] = (await jobs(f)).filter(isCustReply); assert.equal(j.state, "uncertain"); assert.ok(!j.providerId); assert.equal(j.replyRecovery?.state, "done");
    const conv = (await managedSMSConversations(await strictRead("clients", f.c.slug)))[0].messages.filter(m => m.role === "assistant").at(-1); assert.equal(conv.processing, "not_delivered");
  });
  for (const [label, rej] of [["401 auth (code 20003)", { status: 401, code: 20003 }], ["400 unsubscribed (21610)", { status: 400, code: 21610 }], ["429 rate limit", { status: 429, code: 20429 }]]) {
    await sc("F3 " + label + ": no text, never retried, state", async () => {
      const f = await fixture("f3" + rej.status); const w0 = wire.filter(w => w.kind === "sms" && w.from === f.number).length; mode.reject = rej; await text(f, "Quote for a faucet?"); await advance(f, 120, 10);
      const posts = wire.filter(w => w.kind === "sms" && w.from === f.number).length - w0; const [j] = (await jobs(f)).filter(isCustReply);
      assert.equal(posts, 1, "POSTs " + posts); assert.notEqual(j.state, "delivered"); assert.notEqual(j.state, "accepted"); return { state: j.state, reason: j.reasonCode, leads: (await store.listJSON("leads", f.c.slug + "/")).length };
    });
  }
  await sc("F4 5xx with code: no retry, uncertain", async () => {
    const f = await fixture("f4"); const w0 = wire.filter(w => w.kind === "sms" && w.from === f.number).length; mode.status5xx = 1; await text(f, "Hi there"); await advance(f, 120, 10);
    const [j] = (await jobs(f)).filter(isCustReply); assert.equal(wire.filter(w => w.kind === "sms" && w.from === f.number).length - w0, 1); assert.equal(j.state, "uncertain"); return { recovery: j.replyRecovery?.state };
  });
  await sc("E1 owner email cap: 8 customers fail same day with tenantLimit 3 -> 3 emails sent, rest held, none marked sent; 8 requests saved", async () => {
    const f = await fixture("cap"); await ownerMail(f); emailPolicyFor([f], 3); const e0 = wire.filter(w => w.kind === "email").length;
    sendStatus = "failed"; for (let i = 0; i < 8; i++) await text(f, "Question number " + i, "+1713555" + String(3000 + i)); sendStatus = "sent"; await advance(f, 120, 10);
    const al = await ownerAlerts(f), sent = al.filter(j => j.providerId), emails = wire.filter(w => w.kind === "email").length - e0;
    assert.equal(emails, 3, "emails on wire " + emails); assert.equal(sent.length, 3); assert.ok(al.filter(j => !j.providerId).every(j => !["delivered", "accepted"].includes(j.state)));
    assert.equal((await store.listJSON("leads", f.c.slug + "/")).length, 8); return { alerts: al.length, states: al.map(j => j.state + ":" + (j.reasonCode || "")) };
  });
  await sc("E2 same customer, 5 failed replies same day = 1 email; next Houston day = 1 more", async () => {
    const f = await fixture("day"); const _t = text; const text2 = async (...a) => { await refresh(f); return _t(...a); }; await ownerMail(f); emailPolicyFor([f], 50); sendStatus = "failed";
    for (let i = 0; i < 5; i++) { await text(f, "again " + i); await advance(f, 10); } const day1 = (await ownerAlerts(f)).length;
    clock += 24 * 3600000; await text2(f, "next day"); await advance(f, 30); sendStatus = "sent"; const day2 = (await ownerAlerts(f)).length;
    const rj=(await jobs(f)).filter(isCustReply).map(j=>j.state+":"+(j.reasonCode||"")); assert.equal(day1, 1); assert.equal(day2, 2); return { sends: custSends(f, caller).length, replyJobs: rj, inbound: (await store.listJSON("managed_sms_inbound", f.c.slug + "/")).map(r=>r.state+":"+(r.reasonCode||""))};
  });
  await sc("L1 sweep under load: 60 callback-failed replies over 3 shops; every run touches <=25; all alerted, zero extra customer texts", async () => {
    const fs = [await fixture("l1a"), await fixture("l1b"), await fixture("l1c")]; const pending = [];
    for (let i = 0; i < 60; i++) { const f = fs[i % 3], phone = "+1832555" + String(1000 + i); await text(f, "load " + i, phone); const j = (await jobs(f)).filter(j => isCustReply(j) && j.to === phone)[0]; pending.push([f, j]); }
    await wave(fs, 4); for (const p of pending) p[1] = await strictRead("managed_deliveries", p[1].id);
    const noPid = pending.filter(([,j]) => !j?.providerId); if (noPid.length) return { noProviderId: noPid.length, sample: noPid.slice(0,3).map(([f,j]) => j ? j.state+":"+j.reasonCode : "nojob"), inboundStates: [...new Set((await store.listJSON("managed_sms_inbound", fs[0].c.slug + "/")).map(r=>r.state+":"+(r.reasonCode||"")))] };
    const textsBefore = fs.map(f => custSends(f).length);
    for (const [f, j] of pending) await receipt(f, j, "undelivered", "1");
    const perRun = [];
    for (let r = 0; r < 6; r++) { const before = (await Promise.all(fs.map(async f => (await jobs(f)).filter(j => isCustReply(j) && j.replyRecovery?.state === "done").length))).reduce((a, b) => a + b, 0);
      for (const f of fs) await refresh(f); clock += 600000; await delivery.runManagedDelivery({ limit: 3, discoveryLimit: 0 });
      const after = (await Promise.all(fs.map(async f => (await jobs(f)).filter(j => isCustReply(j) && j.replyRecovery?.state === "done").length))).reduce((a, b) => a + b, 0); perRun.push(after - before); }
    const done = (await Promise.all(fs.map(async f => (await jobs(f)).filter(j => isCustReply(j) && j.replyRecovery?.state === "done").length))).reduce((a, b) => a + b, 0);
    assert.ok(perRun.every(n => n <= 25), "a run exceeded 25: " + perRun); assert.equal(done, 60, "alerted " + done + " runs " + perRun);
    assert.deepEqual(fs.map(f => custSends(f).length), textsBefore, "extra customer texts"); const leads = (await Promise.all(fs.map(f => store.listJSON("leads", f.c.slug + "/")))).flat().length; assert.equal(leads, 60);
    return { perRun };
  });
  await sc("L2 25 stale failure-index keys whose delivery rows were deleted (sorted first) must not starve a real failure", async () => {
    await store.atomicUpdate("managed_delivery_pending", "active", v => { const failures = { ...(v?.failures || {}) }; for (let i = 0; i < 30; i++) failures["aaa-erased-" + String(i).padStart(2, "0") + "/" + "0".repeat(64)] = { state: "failed", at: stamp() }; return { value: { ...v, failures } }; });
    const f = await fixture("l2"); await text(f, "real one"); const [j] = (await jobs(f)).filter(isCustReply); await receipt(f, j, "undelivered", "1");
    for (let r = 0; r < 4; r++) { await refresh(f); clock += 600000; await delivery.runManagedDelivery({ limit: 3, discoveryLimit: 0 }); }
    const now = await strictRead("managed_deliveries", j.id), idx = (await strictRead("managed_delivery_pending", "active")).failures; const staleOpen = Object.keys(idx).filter(k => k.startsWith("aaa-erased-") && !idx[k].followedUp).length;
    return { realAlerted: now.replyRecovery?.state === "done", staleStillOpen: staleOpen };
  });
  await sc("S1 STOP after a failed reply: no confirmation suppressed incorrectly, no later customer text, opt-out honoured", async () => {
    const f = await fixture("s1"); sendStatus = "failed"; await text(f, "price for a toilet"); sendStatus = "sent"; const r = await text(f, "STOP"); await advance(f, 120, 10); const r2 = await text(f, "one more question");
    const s = custSends(f, caller); return { stopTwiml: r.twiml.slice(0, 200), afterStopState: r2.row?.state ?? null, customerTextsViaApi: s.length };
  });
  await sc("H1 unverified sender: STOP/HELP/START and a normal text; nothing sent via API; held rows; one request", async () => {
    const f = await fixture("h1", { state: "awaiting_test" }); const probe = await sms.pendingMessagingProbe(f.c); const n0 = custSends(f).filter(m => !(probe && m.to === probe.to)).length; const tw = [];
    for (const b of ["Is anyone there?", "HELP", "STOP", "START", "Still need help"]) { const r = await text(f, b); tw.push({ b, twiml: r.twiml.slice(0, 160), state: r.row?.state ?? null }); }
    await wave(f, 3); assert.equal(custSends(f).filter(m => !(probe && m.to === probe.to)).length, n0, "API text from unverified sender");
    return { tw, leads: (await store.listJSON("leads", f.c.slug + "/")).length };
  });
  await sc("G1 global: no customer reply attempted twice; no reply job delivered without provider message", async () => {
    const all = (await store.listJSON("managed_deliveries", "", 5000)).filter(isCustReply);
    for (const d of all) { assert.ok((d.attempts || 0) <= 1, "attempted twice " + d.id); if (d.state === "delivered" || d.state === "accepted") assert.ok(d.providerId && messages.has(d.providerId), "marked sent without message " + d.id); }
    return { replyJobs: all.length };
  });
}
out.blocked = report.blocked; const { writeFileSync: wf } = await import("node:fs"); if (OUT) wf(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.results.map(r => [r.name.slice(0, 60), r.pass, r.note ?? r.error?.slice(0, 300)]), null, 1)); console.log("blocked:", report.blocked.length);
