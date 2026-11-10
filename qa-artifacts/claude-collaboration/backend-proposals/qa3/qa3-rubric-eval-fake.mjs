// QA3: classifierEval over LABELLED and LABELLED_2 with the fake model (MC_FAKE_MODEL=1), offline.
import { resolve } from "node:path"; import { pathToFileURL } from "node:url";
const repo = resolve(process.argv[process.argv.indexOf("--repo") + 1]);
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test" });
const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const desk = await import(F("lib/desk.mjs")); const cfg = await import(F("lib/config.mjs"));
const c = cfg.newClient({ slug: "re", ownerKey: "k", owner: { name: "Dana" }, business: { name: "Bayou Air", trade: "HVAC" } });
for (const set of [1, 2]) { const r = await desk.classifierEval(c, ["claude-opus-5-5"], 0, 100, set); const m = r["claude-opus-5-5"]; console.log(JSON.stringify({ set, exact: m.exact, of: m.of, ncw: m.perReason.no_callback_window, misses: m.misses })); }
