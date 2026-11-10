// QA2 probe for proposal 05: the nightly audit rubric (desk.mjs RUBRIC, audit-policy ACTIONABLE) still requires a callback window.
import { resolve } from "node:path"; import { pathToFileURL } from "node:url";
const repo = resolve(process.argv[process.argv.indexOf("--repo") + 1]);
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test" });
const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const desk = await import(F("lib/desk.mjs")); const ap = await import(F("lib/audit-policy.mjs")); const cfg = await import(F("lib/config.mjs"));
const c = cfg.newClient({ slug: "au", ownerKey: "k", owner: { name: "Ray" }, business: { name: "Bayou Air", trade: "HVAC" } });
const transcript = "Customer: Can I talk to a person?\nDesk: I am the front desk assistant. I have sent your request to Ray; Ray will get your details and follow up. What is the best number?\nCustomer: 713-555-0101";
const r = await desk.rubricClassify(c, transcript);
console.log(JSON.stringify({ repo: repo.split("/").pop(), rubricOut: r.out, reasons: r.reasons, actionable: ap.actionableAuditReasons({ reasons: r.reasons }) }));
