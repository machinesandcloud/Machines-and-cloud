// PM acceptance runner. Never loads .env or starts a server. All HTTP stays on an explicit loopback URL.
// Generate a synthetic memory-store fixture first; root starts the isolated real-model server.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { newClient } from "../netlify/functions/lib/config.mjs";
import { REASONS } from "../netlify/functions/lib/rubric-eval.mjs";

const argv = process.argv.slice(2);
const option = (name, fallback) => { const i = argv.indexOf(name); return i < 0 ? fallback : argv[i + 1]; };
const OWNER_KEY = "pm-local-owner-key";
const SLUGS = { rubric: "pm-real-model-rubric", growth: "pm-real-model-growth" };
const PHONES = { owner: "+17135550199", rubric: "+17135550101", growth: "+17135550102", customer: "+17135550123" };
const MODELS = ["claude-opus-5-5", "claude-haiku-5-5"];
const dateAhead = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 3 * 86400000));
const plan = {
  prerequisite: "Root confirms isolated loopback port, MC_MEMORY_STORE=1, MC_FAKE_MODEL=0, MC_LOCAL_NO_KEYS=1, explicit local URL, no provider keys, agreed model budget.",
  fixture: "Two synthetic shops, no website crawl or onboarding model call, no Google refresh token.",
  eval: "Set 1: both existing candidates, 50 items each, chunks of five. Set 2: selected Opus candidate, 20 clean items, chunks of five. Save counts/tokens/errors/misses, aggregate combined precision/recall without treating null as 100%.",
  flows: "S7-03 three real nightly-audit classifications (clean, then edited SMS plus test thread); S7-05 one Growth booking through chat; S8-09 done -> nudged review request -> real SMS review classification through phone index.",
  matrix: "Separate follow-up phase after the core check; no fake-model result closes real-model or provider-keyed criteria.",
  logicalModelCallBudget: "120 evaluation calls + 3 audit calls + at most 3 booking iterations + review classifier and at most 3 SMS reply iterations = 130; SDK retries may add network attempts.",
  evidence: "Timestamp, git commit, phase, local URL, requested models, raw local responses, per-reason TP/FP/FN and precision/recall, assertions, failures, cleanup. Never claim phone/email/Calendar delivery.",
};
if (argv.includes("--fixture-out")) {
  const target = option("--fixture-out");
  if (!target || target.startsWith("-")) throw new Error("--fixture-out requires an output path");
  const fixture = { clients: {}, index: {} };
  for (const kind of Object.keys(SLUGS)) {
    const slug = SLUGS[kind];
    const c = newClient({ slug, ownerKey: OWNER_KEY,
      owner: { name: "PM Test Owner", email: `pm-${kind}@example.test`, phone: PHONES.owner },
      business: { name: `PM Test ${kind} HVAC`, website: "", trade: "HVAC", city: "Houston", serviceArea: ["Katy", "Cypress", "Fulshear"], notServed: ["The Woodlands"], hours: "Daily 7 am to 7 pm", spanish: true, licenses: "TACLA 12345", reviewLink: "https://example.test/review" } });
    c.status = "live"; c.liveAt = new Date().toISOString(); c.plan = "growth";
    c.services = ["AC repair", "heating repair", "heat pumps", "maintenance"];
    c.fees = [{ label: "Service call", amount: "$89", note: "goes toward the repair" }];
    c.windows = ["8 to 12", "12 to 5"];
    c.phone = { ...c.phone, businessNumber: "+17135550100", twilioNumber: PHONES[kind], tenDlc: "approved", forwarding: "none" };
    c.build = { status: "done", builtAt: new Date().toISOString(), sourcePages: [] };
    fixture.clients[slug] = c;
    fixture.index[`number:${PHONES[kind]}`] = slug;
    fixture.index[`email:${c.owner.email}`] = slug;
  }
  writeFileSync(target, JSON.stringify(fixture, null, 2) + "\n");
  console.log(JSON.stringify({ fixtureWritten: target, shops: Object.values(SLUGS), syntheticOnly: true }));
  process.exit(0);
}
if (!argv.includes("--run")) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
if (!argv.includes("--confirm-local-real-model")) throw new Error("Root must confirm the isolated server is real-model with provider keys disabled.");
const base = new URL(option("--base", ""));
if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || !base.port || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Use an explicit loopback HTTP origin and port only.");
const phase = option("--phase", "core");
if (!["preflight", "core", "eval", "flows"].includes(phase)) throw new Error("Supported phases: preflight, core, eval, flows");
const outPath = option("--output");
if (!outPath || outPath.startsWith("-")) throw new Error("--output is required for durable evidence.");
const maximumCalls = Number(option("--max-model-calls", "130"));
if (!Number.isInteger(maximumCalls) || maximumCalls < 1 || maximumCalls > 130) throw new Error("Model-call allowance must be 1..130.");
const hash = data => createHash("sha256").update(data).digest("hex");
function codeFingerprint() {
  function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".mjs") ? [`${dir}/${e.name}`] : []); }
  const files = [...walk("netlify/functions"), "scripts/local-server.mjs", "package.json", "package-lock.json"].sort();
  return hash(files.map(path => `${path}\0${hash(readFileSync(path))}\n`).join(""));
}
const evidence = { startedAt: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), relevantCodeSha256: codeFingerprint(), runnerSha256: hash(readFileSync(new URL(import.meta.url))), phase, base: base.origin, modelMode: "real, confirmed from root server startup; no .env access by runner", providerDeliveryTested: false, maximumLogicalModelCalls: maximumCalls, logicalModelCalls: 0, checks: [], requests: [], evaluation: {} };
const save = () => writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n");
function reserve(n) { if (evidence.logicalModelCalls + n > maximumCalls) throw new Error("Logical model-call budget reached before next request."); evidence.logicalModelCalls += n; save(); }
function check(name, pass, actual) { evidence.checks.push({ name, pass: !!pass, ...(actual === undefined ? {} : { actual }) }); save(); if (!pass) throw new Error(`Acceptance failed: ${name}`); }
async function request(path, body, { form = false } = {}) {
  const headers = { "x-admin-key": "local-admin" };
  if (body !== undefined) headers["Content-Type"] = form ? "application/x-www-form-urlencoded" : "application/json";
  const response = await fetch(new URL(path, base), { method: body === undefined ? "GET" : "POST", headers,
    body: body === undefined ? undefined : form ? new URLSearchParams(body) : JSON.stringify(body),
    redirect: "error", signal: AbortSignal.timeout(180000) });
  const raw = await response.text(); let data; try { data = JSON.parse(raw); } catch { data = raw; }
  evidence.requests.push({ at: new Date().toISOString(), path, request: body, status: response.status, response: data }); save();
  if (!response.ok) throw new Error(`Local ${path} returned ${response.status}`);
  return data;
}
const admin = (slug, action, rest = {}) => request("/api/admin", { slug, action, ...rest });
const records = async (slug, kind) => (await admin(slug, "records", { kind })).records;
function aggregate(parts) {
  const counts = Object.fromEntries(REASONS.map(r => [r, { tp: 0, fp: 0, fn: 0 }]));
  const result = { exact: 0, of: 0, errors: 0, inputTokens: 0, outputTokens: 0, perReason: {}, misses: [] };
  for (const p of parts) {
    for (const k of ["exact", "of", "errors", "inputTokens", "outputTokens"]) result[k] += p[k] || 0;
    result.misses.push(...p.misses);
    for (const r of REASONS) for (const k of ["tp", "fp", "fn"]) counts[r][k] += p.perReason[r][k];
  }
  for (const r of REASONS) { const { tp, fp, fn } = counts[r]; result.perReason[r] = { tp, fp, fn, precision: tp + fp ? 100 * tp / (tp + fp) : null, recall: tp + fn ? 100 * tp / (tp + fn) : null }; }
  return result;
}
async function evaluate() {
  const chunks = [[0, 5], [5, 10], [11, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 45], [45, 50]];
  const byModel = {};
  for (const model of MODELS) {
    const parts = [];
    const priorPath = option(model === MODELS[0] ? "--reuse-preflight" : "--reuse-haiku-preflight");
    if (priorPath) {
        const prior = JSON.parse(readFileSync(priorPath, "utf8"));
        const part = prior.preflight;
        check("prior real preflight is same local server and requested model", prior.base === base.origin && prior.phase === "preflight" && part?.model === model && part.result?.of === 1 && part.result.errors === 0 && part.result.inputTokens > 0 && part.result.outputTokens > 0, { path: priorPath, model: part?.model });
        parts.push(part.result); (evidence.preflightsReused ||= []).push(priorPath);
    } else if (model === MODELS[0]) parts.push(await preflight());
    else {
      reserve(1);
      const response = await admin(SLUGS.rubric, "classifier_eval", { models: [model], set: 1, from: 10, to: 11 });
      const part = response.results?.[model];
      check(`candidate ${model} one-item preflight`, part?.of === 1 && part.errors === 0 && part.inputTokens > 0 && part.outputTokens > 0, part);
      parts.push(part);
    }
    for (const [from, to] of chunks) {
      reserve(to - from);
      const response = await admin(SLUGS.rubric, "classifier_eval", { models: [model], set: 1, from, to });
      const part = response.results?.[model];
      check(`set1 ${model} items ${from + 1}-${to}: real usage and no errors`, part && part.of === to - from && part.errors === 0 && part.inputTokens > 0 && part.outputTokens > 0, part);
      parts.push(part); evidence.evaluation[model] = { set1: aggregate(parts) }; save();
      console.log(JSON.stringify({ phase: "eval", model, set: 1, completed: aggregate(parts).of, exact: aggregate(parts).exact }));
    }
    byModel[model] = parts;
  }
  const selected = MODELS[0], second = [];
  for (let from = 0; from < 20; from += 5) {
    reserve(5);
    const response = await admin(SLUGS.rubric, "classifier_eval", { models: [selected], set: 2, from, to: from + 5 });
    const part = response.results?.[selected];
    check(`set2 ${selected} items ${from + 51}-${from + 55}: real usage and no errors`, part && part.of === 5 && part.errors === 0 && part.inputTokens > 0 && part.outputTokens > 0, part);
    second.push(part);
    const combined = aggregate([...byModel[selected], ...second]);
    evidence.evaluation[selected] = { set1: aggregate(byModel[selected]), set2: aggregate(second), combined,
      reasonsBelow80Precision: REASONS.filter(r => combined.perReason[r].precision !== null && combined.perReason[r].precision < 80) };
    save(); console.log(JSON.stringify({ phase: "eval", model: selected, set: 2, completed: second.length * 5 }));
  }
}
async function preflight() {
  const model = option("--model", MODELS[0]);
  if (!MODELS.includes(model)) throw new Error("Only the app's two existing candidate model aliases are permitted.");
  reserve(1);
  const response = await admin(SLUGS.rubric, "classifier_eval", { models: [model], set: 1, from: 10, to: 11 });
  const part = response.results?.[model];
  check("ONE real-model classifier preflight: positive price flag, usage present and no API error", part?.of === 1 && part.errors === 0 && part.exact === 1 && part.perReason?.price_not_listed?.tp === 1 && part.inputTokens > 0 && part.outputTokens > 0, part);
  evidence.preflight = { model, result: part }; save();
  console.log(JSON.stringify({ phase: "preflight", model, result: part }));
  return part;
}
async function flows() {
  const slug = SLUGS.rubric;
  const clean = [{ role: "user", content: "Book my AC visit for tomorrow 8 to 12 at 12 Oak St Katy. Lee Park, 713-555-0123." }, { role: "assistant", content: "Booked for tomorrow, 8 to 12, at 12 Oak St Katy. The service call is $89 and goes toward the repair." }];
  await admin(slug, "put_conversation", { channel: "sms", contact: "pm-audit", messages: clean });
  reserve(1); const first = await admin(slug, "autoflag", { debug: true });
  check("S7-03 clean real audit has no classifier errors", first.raws?.length === 1 && first.raws.every(x => !x.error), first);
  let conv = (await records(slug, "conversations")).find(v => v.contact === "pm-audit");
  check("S7-03 clean thread stamped for today with no reasons", conv?.autoFlag?.day === new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date()) && conv.autoFlag.reasons.length === 0 && conv.autoFlag.test === false, conv?.autoFlag);
  const bad = [...clean, { role: "user", content: "What does a capacitor replacement cost?" }, { role: "assistant", content: "A capacitor replacement is $250 installed." }];
  await admin(slug, "put_conversation", { channel: "sms", contact: "pm-audit", messages: bad });
  await admin(slug, "put_conversation", { channel: "test", contact: "pm-audit-test", messages: bad });
  reserve(2); const second = await admin(slug, "autoflag", { debug: true });
  check("S7-03 edited SMS and test thread real audits have no classifier errors", second.raws?.length === 2 && second.raws.every(x => !x.error), second);
  const convs = await records(slug, "conversations");
  for (const [contact, isTest] of [["pm-audit", false], ["pm-audit-test", true]]) {
    conv = convs.find(v => v.contact === contact);
    check(`S7-03 ${contact} detects unpublished price`, conv?.autoFlag?.reasons.includes("price_not_listed") && conv.autoFlag.test === isTest, conv?.autoFlag);
  }
  const events = (await records(slug, "events")).filter(e => e.type === "auto_flag");
  check("S7-03 test event marked and customer event separate", events.length === 2 && events.filter(e => e.data?.test).length === 1, events);
  const full = await request("/api/admin?full=1");
  check("S7-03 Needs-me count excludes test audit", full.clients.find(c => c.slug === slug)?.autoFlags7d === 1);
  const digest = await admin(slug, "digest");
  check("S7-03 Steve digest excludes test audit", /Nightly check flagged 1:/.test(digest.steveNote) && !digest.steveNote.includes("pm-audit-test"), digest.steveNote);
  if (argv.includes("--verify-weak-exclusion")) {
    // Inject saved historical events to check actionable counts without another model call.
    // This checks count policy; it does not pretend injected labels are new model predictions.
    await admin(slug, "log_event", { type: "auto_flag", data: { channel: "sms", contact: "pm-weak-only", reasons: ["no_address"], test: false } });
    let rows = await request("/api/admin?full=1");
    check("S8-05 historical weak-only flag excluded from Needs-me count", rows.clients.find(c => c.slug === slug)?.autoFlags7d === 1);
    let note = (await admin(slug, "digest")).steveNote;
    check("S8-05 historical weak-only flag excluded from actionable digest", /Nightly check flagged 1:/.test(note) && !note.includes("pm-weak-only"), note);
    await admin(slug, "log_event", { type: "auto_flag", data: { channel: "sms", contact: "pm-mixed", reasons: ["no_address", "price_not_listed"], test: false } });
    rows = await request("/api/admin?full=1");
    check("S8-05 mixed strong+weak flag counts once", rows.clients.find(c => c.slug === slug)?.autoFlags7d === 2);
    note = (await admin(slug, "digest")).steveNote;
    check("S8-05 mixed flag remains in actionable digest", /Nightly check flagged 2:/.test(note) && note.includes("pm-mixed") && !note.includes("pm-weak-only"), note);
  }

  const growth = SLUGS.growth;
  reserve(3); // runAgent has at most three iterations; reserve conservatively.
  const chat = await request("/api/chat", { client: growth, key: OWNER_KEY, channel: "test", contact: "pm-growth-booking", stream: false,
    messages: [{ role: "user", content: `Please book an AC repair visit for ${dateAhead()}, 8 to 12. My name is Lee Park, phone 713-555-0123, address 12 Oak St, Katy, TX 77494. I agree to receive the appointment texts.` }] });
  check("S7-05 real Growth chat records a booking tool event", chat.events?.some(e => e.type === "booking"), chat);
  const bookings = await records(growth, "bookings");
  const booking = bookings.find(b => b.phone === PHONES.customer);
  check("S7-05 one Growth booking stored for the customer", bookings.length === 1 && booking?.id && booking.date === dateAhead(), bookings);
  let tasks = (await admin(growth, "tasks")).tasks;
  const types = tasks.filter(t => t.data?.bookingId === booking.id).map(t => t.type);
  check("S7-05 Growth has 24h, 1h and visit-check tasks on that booking", ["reminder_24h", "reminder_1h", "visit_check"].every(type => types.includes(type)), types);
  await request("/api/sms", { From: PHONES.owner, To: PHONES.growth, Body: `done ${booking.id}` }, { form: true });
  tasks = (await admin(growth, "tasks")).tasks;
  const review = tasks.find(t => t.type === "review_request" && t.data?.bookingId === booking.id);
  check("S8-09 done creates review-request task", !!review, tasks);
  await admin(growth, "nudge_task", { id: review.id });
  await admin(growth, "run_scheduler", { force_hour: 12 });
  const asked = (await records(growth, "bookings")).find(b => b.id === booking.id);
  check("S8-09 review request processed and timestamped in logged-send mode", !!asked?.reviewAskedAt && asked.status === "done", asked);
  reserve(4); // review classifier + up to three background reply iterations.
  await request("/api/sms", { From: PHONES.customer, To: PHONES.growth, Body: "Great job, thanks!" }, { form: true });
  const replied = (await records(growth, "bookings")).find(b => b.id === booking.id);
  check("S8-09 real SMS classifier reaches asked booking through phone index", replied?.reviewReply?.sentiment === "positive" && replied.reviewReply.text === "Great job, thanks!", replied?.reviewReply);
  check("S8-09 positive review cancels review nudge", !(await admin(growth, "tasks")).tasks.some(t => t.type === "review_nudge" && t.data?.bookingId === booking.id));
}
try {
  const initial = await request("/api/admin");
  check("isolated synthetic shops present", Object.values(SLUGS).every(s => initial.clients.some(c => c.slug === s)) && initial.clients.every(c => Object.values(SLUGS).includes(c.slug)), initial.clients.map(c => ({ slug: c.slug, name: c.name })));
  if (phase === "preflight") await preflight();
  if (["core", "eval"].includes(phase)) await evaluate();
  if (["core", "flows"].includes(phase)) await flows();
  evidence.result = "requested local real-model checks passed; provider-keyed acceptance remains pending";
} catch (error) {
  evidence.result = "incomplete or failed"; evidence.failure = String(error?.message || error); process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString(); evidence.finishedRelevantCodeSha256 = codeFingerprint(); evidence.relevantCodeChangedDuringRun = evidence.relevantCodeSha256 !== evidence.finishedRelevantCodeSha256; save();
  console.log(JSON.stringify({ result: evidence.result, failure: evidence.failure, evidence: outPath, checks: evidence.checks.length, logicalModelCallsReserved: evidence.logicalModelCalls }));
}
