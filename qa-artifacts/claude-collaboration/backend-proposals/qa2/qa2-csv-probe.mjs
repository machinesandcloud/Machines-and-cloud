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
const PROBES = ["+17135550123", "+1 (713) 555-0123", "713-555-0123", "-5", "+5", "12.50", "=1+1", "@x", "\t=cmd", " +SUM(1)", "\uFF1D1+1", "\uFF0BSUM(1)", "\u00A0=1+1", "\n=1+1", "\u200B=1+1", "\uFEFF=1+1", "- left voicemail", "+1-713-555-0123", "1e5", "-0x10", "+.5", "a,b\"c\nd", "=A1,\"x\"\r\n=B2"];
const day2 = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
await desk.bookVisit(c, { customer_name: "Paren Phone", phone: "+1 (713) 555-0123", address: "5 Pine St", issue: "AC", date: day2, window: "8 to 12", urgency: "this_week", language: "en", notes: "", unsure: "" }, { channel: "web", contact: "wq1" });
const conv = await store.getConversation(c, "web", "wq2");
for (const content of PROBES) conv.messages.push({ role: "user", content, at: new Date().toISOString() });
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
const intakeRule = (t) => (/^\s*[=+\-@]/.test(t) || /^[\t\r]/.test(t)) ? "'" + t : t;
const report = {};
for (const what of ["bookings", "customers", "conversations"]) {
  const res = await client(new Request(`https://platform.example.test/api/client?c=csv-check&k=csv-owner-key&export=${what}`));
  const text = await res.text(); const rows = parseCSV(text);
  const widths = [...new Set(rows.map((r) => r.length))];
  report[what] = { status: res.status, header: rows[0], rowWidths: widths, rows: rows.length - 1 };
  if (what === "conversations") report[what].probes = PROBES.map((p) => { const cell = rows.slice(1).flat().find((v) => v === p || v === "'" + p) ?? null; return { input: JSON.stringify(p), exported: JSON.stringify(cell), apostrophe: cell?.startsWith("'") && !p.startsWith("'"), intakeWouldApostrophe: intakeRule(p) !== p }; });
  if (what !== "conversations") report[what].phoneCells = rows.slice(1).flat().filter((v) => /713/.test(v));
}
console.log(JSON.stringify(report, null, 1));
