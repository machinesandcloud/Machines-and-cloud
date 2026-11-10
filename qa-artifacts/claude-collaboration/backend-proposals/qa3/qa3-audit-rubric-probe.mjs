// QA3 probe for proposal 05: fake audit classifier on person-request transcripts (MC_FAKE_MODEL=1, memory store, offline).
import { resolve } from "node:path"; import { pathToFileURL } from "node:url";
const repo = resolve(process.argv[process.argv.indexOf("--repo") + 1]);
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test" });
const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const desk = await import(F("lib/desk.mjs")); const cfg = await import(F("lib/config.mjs")); const rub = await import(F("lib/rubric-eval.mjs"));
const c = cfg.newClient({ slug: "au3", ownerKey: "k", owner: { name: "Ray" }, business: { name: "Bayou Air", trade: "HVAC" } });
const T = (d1, d2 = "") => `Customer: Can I talk to a person?\nDesk: ${d1}\nCustomer: 713-555-0101${d2 ? "\nDesk: " + d2 : ""}`;
const cases = [
  ["defect", "ignored entirely", T("What is the address for the visit?", "Thanks. What day works?")],
  ["defect", "ignored, offers booking", T("I can book you a visit. What day works?")],
  ["defect", "vague: someone will call you back", T("Someone will call you back. What is your number?", "Got it.")],
  ["defect", "vague: sent your request", T("I have sent your request to Ray.")],
  ["defect", "timed: shortly", T("Ray will call you back shortly. What is your number?")],
  ["defect", "timed: today", T("Ray will call you today. What is your number?")],
  ["defect", "timed: reach out in 20 min", T("Ray will reach out in 20 minutes. What is your number?")],
  ["defect", "timed: es pronto", "Customer: Quiero hablar con una persona.\nDesk: Claro, Ray le llamará pronto. ¿Cuál es su número?\nCustomer: 713-555-0108"],
  ["defect", "timed: es en 15 minutos", "Customer: Quiero hablar con una persona.\nDesk: Claro, Ray le llamará en 15 minutos. ¿Cuál es su número?\nCustomer: 713-555-0108"],
  ["clean", "compliant", T("I am the front desk assistant. Ray will get your details and follow up. What is the best number?", "Thanks, Ray has your number and will follow up.")],
  ["clean", "compliant es", "Customer: Quiero hablar con una persona.\nDesk: Claro, soy la asistente. Ray recibirá sus datos y le dará seguimiento. ¿Cuál es su número?\nCustomer: 713-555-0108"],
  ["clean", "compliant + closed", T("I am the front desk assistant. Ray will get your details and follow up (the shop is closed and opens at 7 am this morning). What is the best number?")],
];
const rows = [];
for (const [want, label, t] of cases) { const r = await desk.rubricClassify(c, t); const flagged = (r.reasons || []).includes("no_callback_window"); rows.push({ want, label, flagged, ok: (want === "defect") === flagged }); }
const set = [...(rub.LABELLED || []), ...(rub.LABELLED_2 || [])];
const ncw = set.filter((x) => x.labels.includes("no_callback_window")).map((x) => ({ id: x.id, desk: x.text.filter((l) => /^Desk:/.test(l)).join(" | ") }));
for (const r of rows) console.log(`${r.ok ? "ok  " : "MISS"} want=${r.want.padEnd(6)} flagged=${String(r.flagged).padEnd(5)} ${r.label}`);
console.log(JSON.stringify({ repo: repo.split("/").pop(), misses: rows.filter((r) => !r.ok).length, labelledNoCallbackWindow: ncw }, null, 1));
