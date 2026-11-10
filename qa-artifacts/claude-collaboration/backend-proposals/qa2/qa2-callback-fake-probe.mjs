// QA2 probe for proposal 05: what the legacy prompt tells the model and what the MC_FAKE_MODEL desk says to "Can I talk to a person?".
import { resolve } from "node:path"; import { pathToFileURL } from "node:url";
const repo = resolve(process.argv[process.argv.indexOf("--repo") + 1]);
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test" });
const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const cfg = await import(F("lib/config.mjs")); const { fakeClient } = await import(F("lib/fake-model.mjs")); const vapi = await import(F("lib/vapi.mjs"));
const c = cfg.newClient({ slug: "cb", ownerKey: "k", owner: { name: "Ray", phone: "", email: "" }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Sun 12am-11:59pm" } });
c.rules.callbackHours = "within 15 minutes";
const sys = cfg.buildSystemPrompt(c, "web");
const fm = fakeClient(); const msgs = [{ role: "user", content: "Can I talk to a person? 713-555-0101" }];
const s = fm.beta.messages.stream({ system: [{ type: "text", text: sys }], messages: msgs, tools: [] }); const fin = await s.finalMessage();
const line = sys.split("\n").find((l) => l.includes("asks for a person"));
console.log(JSON.stringify({ repo: repo.split("/").pop(), promptLine: line, fakeReply: fin.content.map((b) => b.text || `[tool ${b.name}]`).join(" "), voiceHasTimedPromise: /within \d+ minutes|by 8 am/.test(vapi.voicePrompt(c)) }, null, 1));
