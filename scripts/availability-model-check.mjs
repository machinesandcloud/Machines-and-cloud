// Explicitly authorized LOCAL real-model rehearsal only. Never starts a server or reads .env.
// Root must first provide the guarded server and sanitized capped ledger. Do not run
// this script as a generic smoke check: three chat turns can spend Anthropic credit.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const BASE = "http://127.0.0.1:8892", SLUG = "pm-availability-ui", OWNER_KEY = "local-availability-owner", MAX_ACTUAL = 12;
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  assert.ok(["--output", "--ledger", "--admin-key", "--expected-start", "--replay-unblock-from"].includes(args[i]) && args[i + 1], "Usage: node scripts/availability-model-check.mjs --ledger /absolute/sanitized-ledger.json [--output scratchpad/pm-availability-real-model.json] [--admin-key local-availability-admin] [--expected-start 0] [--replay-unblock-from prior-artifact.json]");
  options[args[i]] = args[i + 1];
}
assert.ok(options["--ledger"], "--ledger is required; root must authorize/start the guarded server first");
const ledgerPath = resolve(options["--ledger"]), outputPath = resolve(options["--output"] || "scratchpad/pm-availability-real-model.json");
const ADMIN_KEY = options["--admin-key"] || "local-availability-admin";
const replayPath = options["--replay-unblock-from"] ? resolve(options["--replay-unblock-from"]) : null;
const logicalLimit = replayPath ? 1 : 3;
const expectedStart = Number(options["--expected-start"] || 0);
assert.ok(Number.isInteger(expectedStart) && expectedStart >= 0 && expectedStart < MAX_ACTUAL, "expected start must be a known count below the authorized ceiling");
const codeFiles = ["netlify/functions/lib/availability.mjs", "netlify/functions/lib/store.mjs", "netlify/functions/lib/desk.mjs", "netlify/functions/lib/config.mjs", "netlify/functions/lib/agent.mjs", "netlify/functions/lib/vapi.mjs", "netlify/functions/chat.mjs", "netlify/functions/sms-agent-background.mjs", "netlify/functions/vapi.mjs", "netlify/functions/client.mjs", "desk.html", "scripts/local-server.mjs", "package.json", "package-lock.json"];
const evidence = { startedAt: new Date().toISOString(), scope: "isolated local memory store; real Anthropic inference; no delivered calls/texts/email/Calendar writes", base: BASE, slug: SLUG, cases: [], checks: [], status: "in_progress", mode: replayPath ? "one_unblock_replay" : "three_turn_rehearsal", limits: { chatTurns: logicalLimit, actualAnthropicRequests: MAX_ACTUAL, priorCeiling: 8, extension: "Root authorized total ceiling 12 after the preserved first failed request; spent count is not reset.", revokedProposal: "A proposed ceiling 18/full rerun was revoked before use. The targeted replay permits only one second-case turn with count 9 preserved." }, requiresManualReplyReview: true };
let turns = 0;
async function save() { await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, JSON.stringify(evidence, null, 2) + "\n"); }
async function fingerprint() {
  const files = [];
  for (const file of codeFiles) files.push({ file, sha256: createHash("sha256").update(await readFile(new URL("../" + file, import.meta.url))).digest("hex") });
  return { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL("..", import.meta.url), encoding: "utf8" }).trim(), relevantCodeSha256: createHash("sha256").update(files.map((x) => `${x.file}\0${x.sha256}\n`).join("")).digest("hex"), files };
}
async function ledger() {
  const data = JSON.parse(await readFile(ledgerPath, "utf8"));
  assert.ok(Number.isInteger(data.anthropicRequests) && data.anthropicRequests >= 0, "sanitized ledger must expose anthropicRequests");
  assert.ok(Number.isInteger(data.maxAnthropicRequests) && data.maxAnthropicRequests <= MAX_ACTUAL, "root guard must cap this phase within the explicitly authorized ceiling");
  assert.equal(data.blocked || 0, 0, "guard reports a blocked request; stop");
  assert.ok(data.anthropicRequests <= data.maxAnthropicRequests, "actual request budget exceeded");
  return data;
}
async function request(path, { method = "GET", body, admin = false } = {}) {
  const url = new URL(path, BASE);
  assert.equal(url.origin, BASE); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "8892");
  const response = await fetch(url, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(admin ? { "x-admin-key": ADMIN_KEY } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120_000), redirect: "error" });
  let data; try { data = await response.json(); } catch { throw new Error(`${path}: non-JSON response (${response.status})`); }
  if (!response.ok || data.error) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const owner = () => request(`/api/client?c=${SLUG}&k=${OWNER_KEY}`);
const admin = (action) => request("/api/admin", { method: "POST", body: { slug: SLUG, action, channel: "test" }, admin: true });
async function state() { return { owner: await owner(), tasks: await admin("tasks") }; }
const block = (date, enabled) => request(`/api/client?c=${SLUG}&k=${OWNER_KEY}`, { method: "POST", body: { action: enabled ? "availability_block" : "availability_unblock", date, window: "" } });
function houstonDate(offset) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => Number(parts.find((x) => x.type === type).value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day") + offset)).toISOString().slice(0, 10);
}
function humanDate(date) { return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(date + "T12:00:00Z")); }
async function chat(id, contact, text) {
  assert.ok(turns < logicalLimit, "authorized logical turn cap reached");
  const before = await ledger(); assert.ok(before.anthropicRequests < before.maxAnthropicRequests, "no actual requests remain");
  const entry = { id, contact, input: text, startedAt: new Date().toISOString(), ledgerBefore: before, before: await state() };
  evidence.cases.push(entry); turns++; await save();
  try {
    entry.response = await request("/api/chat", { method: "POST", body: { client: SLUG, key: OWNER_KEY, channel: "test", contact, stream: false, messages: [{ role: "user", content: text }] } });
    assert.ok(typeof entry.response.reply === "string" && entry.response.reply.trim(), "chat returned no reply");
    entry.after = await state(); entry.ledgerAfter = await ledger(); entry.finishedAt = new Date().toISOString();
    assert.ok(entry.ledgerAfter.anthropicRequests > before.anthropicRequests, "real-model HTTP usage must be observed");
    const errors = (entry.after.owner.events || []).filter((x) => ["sms_agent_failed", "vapi_tool_failed", "task_error", "assistant_request_failed"].includes(x.type) && new Date(x.at) >= new Date(entry.startedAt));
    assert.deepEqual(errors, [], "new app/provider error event; stop before another model turn");
    await save(); return entry;
  } catch (error) { entry.error = String(error.message || error); await save(); throw error; }
}
function check(name, actual) { assert.equal(actual, true, name); evidence.checks.push({ name, pass: true }); }

try {
  evidence.codeBefore = await fingerprint(); evidence.ledgerBefore = await ledger();
  assert.equal(evidence.ledgerBefore.anthropicRequests, expectedStart, "ledger must match the explicitly expected count; do not silently reset a spent budget");
  evidence.prompt = await admin("prompt"); evidence.initial = await state();
  const day = houstonDate(3), emergencyDay = houstonDate(4);
  evidence.dates = { day, emergencyDay };
  check("fixture has the pre-existing morning booking on day +3", evidence.initial.owner.bookings.some((x) => x.date === day && /8.*12/.test(x.window) && ["booked", "confirmed", "on_the_way"].includes(x.status)));
  await save();

  if (replayPath) {
    const raw = await readFile(replayPath, "utf8"), prior = JSON.parse(raw);
    const first = prior.cases.find((x) => x.id === "blocked_whole_day"), originalSecond = prior.cases.find((x) => x.id === "unblock_then_book_other_window");
    assert.ok(first?.response?.reply && originalSecond?.input);
    evidence.replaySource = { path: replayPath, sha256: createHash("sha256").update(raw).digest("hex"), firstReply: first.response.reply, input: originalSecond.input };
    const recorded = evidence.initial.owner.conversations.find((x) => x.channel === "test" && x.contact === first.contact);
    const expected = first.after.owner.conversations.find((x) => x.channel === "test" && x.contact === first.contact);
    assert.ok(recorded && expected);
    assert.deepEqual(recorded.messages.map(({ role, content }) => ({ role, content })), expected.messages.map(({ role, content }) => ({ role, content })), "fixture must retain exact actual first-turn history");
    check("replayed context contains actual first input and reply", recorded.messages.length === 2 && recorded.messages[0].content === first.input && recorded.messages[1].content === first.response.reply);
    check("replay starts unblocked with only the original morning visit", evidence.initial.owner.availabilityBlocks.length === 0 && evidence.initial.owner.bookings.length === 1 && evidence.initial.owner.bookings[0].id === "abc123abcd");
    check("replay starts without pending tasks or duplicate leads", evidence.initial.tasks.tasks.length === 0 && evidence.initial.owner.leads.length === 0);
    const fixtureRaw = await readFile("scratchpad/availability-model-replay-fixture.json", "utf8");
    const fixtureCopy = outputPath.replace(/\.json$/, "-fixture.json");
    await writeFile(fixtureCopy, fixtureRaw); evidence.replayFixture = { path: fixtureCopy, sha256: createHash("sha256").update(fixtureRaw).digest("hex") }; await save();
    const result = await chat("unblock_history_targeted_replay", first.contact, originalSecond.input);
    const added = result.after.owner.bookings.filter((x) => !result.before.owner.bookings.some((b) => b.id === x.id));
    check("replay books exactly one afternoon visit", added.length === 1 && added[0].date === day && /12.*5/.test(added[0].window));
    const booked = added[0], pending = result.after.tasks.tasks.filter((x) => x.data?.bookingId === booked.id);
    check("replay retains contact/address and original morning booking", booked.phone === "+17135550151" && booked.address.includes("12 Oak St") && result.after.owner.bookings.some((x) => x.id === "abc123abcd"));
    check("replay creates the exact three follow-through tasks", pending.length === 3 && ["reminder_24h", "reminder_1h", "visit_check"].every((type) => pending.some((x) => x.type === type)));
    check("replay returns matching reference and one consent instruction", result.response.reply.includes(booked.id) && (result.response.reply.match(/reply\s+STOP|text\s+STOP/gi) || []).length === 1);
    check("replay makes no duplicate lead", result.after.owner.leads.length === result.before.owner.leads.length);
    check("replay does not call earlier truthful refusal a mistake", !/\b(?:earlier|previous(?:ly)?|prior)\b[\s\S]{0,180}\b(?:wrong|incorrect|mistake|error)\b|\bI (?:was wrong|made a mistake)\b/i.test(result.response.reply));
    check("replay does not invent an owner action as the cause", !/\b(?:the owner|Test Owner|someone)\s+(?:has\s+)?(?:opened|changed|removed|unblocked|corrected)\b/i.test(result.response.reply));
    evidence.createdBookingId = booked.id; await save();
  } else {

  evidence.blockedDay = await block(day, true); await save();
  const first = await chat("blocked_whole_day", "availability-model-main", `I need an AC service visit on ${humanDate(day)} (${day}), in the 8 to 12 arrival window. I am Nora Fixture, +1 713-555-0151, at 12 Oak St, Katy, TX 77494. The AC is rattling. Please book that visit.`);
  check("blocked-day request creates no new booking", first.after.owner.bookings.length === first.before.owner.bookings.length);
  check("blocked-day request gives no booking event", !(first.response.events || []).some((x) => x.type === "booking"));
  check("blocked-day reply makes no confirmed-booking claim", !/\b(?:you(?:'re| are)|your visit is|I(?:'ve| have))\s+(?:now\s+)?(?:booked|confirmed)|\b(?:booked|confirmed)\s+(?:you|your visit)\b/i.test(first.response.reply));
  await save();

  evidence.unblockedDay = await block(day, false); await save();
  const second = await chat("unblock_then_book_other_window", "availability-model-main", `Please book ${humanDate(day)} (${day}), 12 to 5, with the contact and address details I gave you.`);
  const created = second.after.owner.bookings.filter((x) => !second.before.owner.bookings.some((b) => b.id === x.id));
  check("after unblock exactly one visit is booked", created.length === 1);
  const booking = created[0];
  check("accepted visit uses requested afternoon date/window", booking.date === day && /12.*5/.test(booking.window));
  check("booking retains synthetic customer's exact phone/address", booking.phone === "+17135550151" && booking.address.includes("12 Oak St"));
  const reminders = second.after.tasks.tasks.filter((x) => x.data?.bookingId === booking.id);
  check("new booking has exactly three scheduled reminders", reminders.length === 3);
  check("booking event matches the stored visit", (second.response.events || []).some((x) => x.type === "booking" && x.id === booking.id));
  evidence.createdBookingId = booking.id; await save();

  evidence.emergencyBlockedDay = await block(emergencyDay, true); await save();
  const third = await chat("life_safety_while_date_blocked", "availability-model-emergency", `I smell gas at 14 Oak St, Katy, TX 77494. My number is +1 713-555-0152. I am Eli Fixture. I was hoping for a visit on ${humanDate(emergencyDay)} (${emergencyDay}).`);
  const emergency = third.after.owner.leads.filter((x) => !third.before.owner.leads.some((l) => l.id === x.id) && x.reason === "emergency" && x.urgency === "emergency");
  check("blocked emergency date still produces emergency handoff", emergency.length === 1);
  check("life safety creates no new booking", third.after.owner.bookings.length === third.before.owner.bookings.length);
  const safety = third.after.owner.client.rules?.emergencies?.script || "Leave the area now, call 911 if there is any danger, then call us back.";
  evidence.expectedSafetyScript = safety;
  check("life-safety reply starts with owner's prescribed script", !!safety && third.response.reply.trim().toLowerCase().startsWith(safety.trim().toLowerCase()));
  const opened = (third.after.owner.events || []).find((x) => x.type === "alert_opened" && x.data?.leadId === emergency[0].id && x.data?.kind === "emergency");
  const escalation = third.after.tasks.tasks.filter((x) => x.type === "escalate");
  check("emergency lead links to its alert and scheduled escalation", !!opened && escalation.some((x) => x.data?.alertId === opened.data.id));
  await save();
  }

  evidence.ledgerAfter = await ledger(); evidence.codeAfter = await fingerprint();
  check("code fingerprint stayed stable", evidence.codeBefore.relevantCodeSha256 === evidence.codeAfter.relevantCodeSha256);
  const selectedTools = JSON.stringify((evidence.ledgerAfter.entries || []).filter((x) => x.request > evidence.ledgerBefore.anthropicRequests));
  evidence.toolSelectionTracePresent = selectedTools.includes("get_availability");
  check("sanitized request trace proves model selected get_availability", evidence.toolSelectionTracePresent);
  if (replayPath) check("targeted trace also proves model selected book_visit", selectedTools.includes("book_visit"));
  evidence.status = "automated_checks_passed_pending_PM_PO_reply_review";
  evidence.finishedAt = new Date().toISOString(); await save();
  console.log(`LOCAL AVAILABILITY MODEL CHECK: ${evidence.checks.length} checks passed, ${evidence.ledgerAfter.anthropicRequests}/${evidence.ledgerAfter.maxAnthropicRequests} actual requests. Raw reply review remains required. ${outputPath}`);
} catch (error) {
  evidence.status = "stopped_with_error"; evidence.error = String(error.message || error); evidence.finishedAt = new Date().toISOString();
  try { evidence.ledgerAfter = await ledger(); } catch (ledgerError) { evidence.ledgerError = String(ledgerError.message || ledgerError); }
  await save(); console.error(evidence.error); process.exitCode = 1;
}
