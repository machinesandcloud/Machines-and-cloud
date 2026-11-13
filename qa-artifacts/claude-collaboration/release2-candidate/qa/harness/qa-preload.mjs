// QA preload for local-server.mjs: deny non-loopback fetch (logged) and expose the fake outbox on a separate loopback port.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
const root = process.env.QA_ROOT, MB = Number(process.env.QA_MB_PORT);
const denied = []; const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => { const u = new URL(typeof input === "string" ? input : input.url ?? String(input)); if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) { denied.push({ at: new Date().toISOString(), origin: u.origin }); throw new Error("qa: network denied " + u.origin); } return realFetch(input, init); };
const H = v => createHash("sha256").update(v).digest("hex");
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1"); const store = await import("file://" + root + "/netlify/functions/lib/store.mjs");
  const j = o => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (url.pathname === "/outbox") { const r = await store.get("access_outbox", H(url.searchParams.get("email").toLowerCase())); return j(r ? { link: r.link, createdAt: r.createdAt } : null); }
  if (url.pathname === "/denied") return j({ denied });
  if (url.pathname === "/get") return j(await store.get(url.searchParams.get("kind"), url.searchParams.get("key")));
  if (url.pathname === "/list") return j(await store.list(url.searchParams.get("kind"), url.searchParams.get("prefix") || ""));
  if (url.pathname === "/seed") {
    // Test-only: real desk.mjs record paths for one synthetic workspace (no provider; keys are removed by local-server).
    const desk = await import("file://" + root + "/netlify/functions/lib/desk.mjs");
    const c = await store.get("clients", url.searchParams.get("slug")); if (!c) return j({ error: "no client" });
    const out = {}; const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(Date.now() + 2 * 864e5));
    try { out.lead1 = await desk.flagLead(c, { customer_name: "Maria Lopez", phone: "+17135550142", reason: "wants_call", summary: "AC not cooling upstairs, wants a callback today", issue: "AC not cooling", address: "12 Elm St, Katy" }, { channel: "web" }); } catch (e) { out.lead1 = "ERR " + e.message; }
    try { out.lead2 = await desk.flagLead(c, { customer_name: "Dan Wu", phone: "+12815550177", reason: "quote", summary: "Quote for a new water heater", issue: "Water heater quote" }, { channel: "web" }); } catch (e) { out.lead2 = "ERR " + e.message; }
    try { out.visit = await desk.bookVisit(c, { customer_name: "Maria Lopez", phone: "+17135550142", issue: "AC not cooling", address: "12 Elm St, Katy", date: day, window: (c.windows || ["8 to 12"])[0] }, { channel: "web" }); } catch (e) { out.visit = "ERR " + e.message; }
    return j(JSON.parse(JSON.stringify(out, (k, v) => typeof v === "string" && v.length > 200 ? v.slice(0, 200) : v)));
  }
  if (url.pathname === "/expire") { // Test-only: end every active owner session (simulates expiry) without touching anything else.
    const keys = await store.list("access_sessions", ""); let n = 0;
    for (const k of keys) { const row = await store.get("access_sessions", k); if (row?.scope === "onboarding" && row.status === "active") { await store.put("access_sessions", k, { ...row, expiresAt: new Date(Date.now() - 1000).toISOString() }); n++; } }
    return j({ expired: n });
  }
  res.writeHead(404); res.end();
}).listen(MB, "127.0.0.1", () => console.log("qa mailbox on", MB));
// Test-only: present the site at the stripping proxy's origin (as Netlify presents the public origin), after local-server sets URL.
if (process.env.QA_URL_OVERRIDE) setTimeout(() => { process.env.URL = process.env.QA_URL_OVERRIDE; console.log("qa: URL presented as", process.env.URL); }, 0);
