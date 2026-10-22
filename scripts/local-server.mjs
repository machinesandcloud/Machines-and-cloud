// Local server for the whole product with zero Netlify usage: serves the static site and routes every
// function by its config.path to the same modules production runs, against the in-memory store
// (MC_MEMORY_STORE=1). Model calls go to Anthropic with ANTHROPIC_API_KEY from .env (gitignored);
// without it, the deterministic fake model runs unless MC_FAKE_MODEL=0.
//   node scripts/local-server.mjs            -> http://localhost:8888, admin key "local-admin"
//   MC_MEMORY_FILE=.local-store.json         -> store snapshot saved on exit and restored on start
// Provider APIs are disabled by default; MC_LOCAL_NO_KEYS=0 explicitly enables them for a keyed pass.
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { extname, join, normalize } from "node:path";

const root = new URL("../", import.meta.url).pathname;
// .env: KEY=value lines, never committed.
if (existsSync(join(root, ".env"))) for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2].replace(/(^|\s+)#.*$/, "") && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/(^|\s+)#.*$/, "").replace(/^["']|["']$/g, ""); }
// This server is always isolated from production storage and background dispatch.
process.env.MC_MEMORY_STORE = "1";
// Always the local key, never the production one that .env may hold.
process.env.ADMIN_KEY = process.env.LOCAL_ADMIN_KEY || "local-admin";
// No Anthropic key: the deterministic fake model stands in so every flow still runs (MC_FAKE_MODEL=0 to refuse instead).
if (!process.env.ANTHROPIC_API_KEY && process.env.MC_FAKE_MODEL !== "0") process.env.MC_FAKE_MODEL = "1";
const PORT = Number(process.env.PORT) || 8888;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT must be between 1 and 65535");
process.env.URL = `http://127.0.0.1:${PORT}`;
if (process.env.MC_LOCAL_NO_KEYS !== "0") {
  for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "VAPI_PUBLIC_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY"]) {
    // Narrow opt-in for an explicitly bounded browser-voice rehearsal. No other provider is enabled.
    if (["VAPI_API_KEY", "VAPI_PUBLIC_KEY"].includes(k) && process.env.MC_LOCAL_VOICE === "1") continue;
    delete process.env[k];
  }
  process.env.VAPI_WEBHOOK_SECRET = process.env.LOCAL_VAPI_WEBHOOK_SECRET || "local-vapi-secret";
}

const fnDir = join(root, "netlify/functions");
const routes = []; const byName = {};
for (const f of readdirSync(fnDir)) {
  if (!f.endsWith(".mjs")) continue;
  const mod = await import(pathToFileURL(join(fnDir, f)).href);
  const name = f.replace(/\.mjs$/, ""); byName[name] = mod;
  const paths = mod.config?.path ? [].concat(mod.config.path) : [];
  for (const p of paths) routes.push({ path: p, mod, name });
}
const store = await import(pathToFileURL(join(fnDir, "lib/store.mjs")).href);
if (process.env.MC_MEMORY_FILE && existsSync(join(root, process.env.MC_MEMORY_FILE))) { const snap = JSON.parse(readFileSync(join(root, process.env.MC_MEMORY_FILE), "utf8")); let n = 0; for (const [kind, entries] of Object.entries(snap)) for (const [k, v] of Object.entries(entries)) { await store.put(kind, store.unsafe(k), v); n++; } console.log(`restored ${n} records from ${process.env.MC_MEMORY_FILE}`); }

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".txt": "text/plain", ".json": "application/json", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2" };
function staticFile(pathname) {
  let p = normalize(decodeURIComponent(pathname)).replace(/^\/+/, "");
  if (p.split(/[\\/]/).some((part) => part.startsWith("."))) return null;
  if (!p || p.endsWith("/")) p += "index.html";
  let full = join(root, p);
  if (!full.startsWith(root)) return null;
  if (!existsSync(full) && existsSync(full + ".html")) full += ".html";
  if (!existsSync(full) || statSync(full).isDirectory()) return null;
  return { body: readFileSync(full), type: TYPES[extname(full)] || "application/octet-stream" };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, process.env.URL);
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const headers = {}; for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
  let handler = null;
  const bg = url.pathname.match(/^\/\.netlify\/functions\/([a-z0-9-]+)$/);
  if (bg && byName[bg[1]]) handler = byName[bg[1]].default;
  else { const r = routes.find((x) => x.path === url.pathname); if (r) handler = r.mod.default; }
  try {
    if (handler) {
      const request = new Request(url.toString(), { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
      const out = await handler(request, { ip: req.socket.remoteAddress || "127.0.0.1" });
      res.writeHead(out.status, Object.fromEntries(out.headers.entries()));
      if (out.body) { const reader = out.body.getReader(); for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); } }
      res.end(); return;
    }
    const f = staticFile(url.pathname);
    if (f) { res.writeHead(200, { "Content-Type": f.type }); res.end(f.body); return; }
    const nf = staticFile("/404.html"); res.writeHead(404, { "Content-Type": "text/html" }); res.end(nf ? nf.body : "not found");
  } catch (err) { console.error(req.method, url.pathname, err); res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "local_server", message: String(err?.message || err) })); }
});
server.listen(PORT, "127.0.0.1", () => console.log(`local front desk at ${process.env.URL} (${routes.length} routes, admin key ${process.env.ADMIN_KEY}, model ${process.env.MC_FAKE_MODEL === "1" ? "FAKE (deterministic rules; add ANTHROPIC_API_KEY to .env for the real one)" : process.env.ANTHROPIC_API_KEY ? "real" : "off"}, provider APIs ${process.env.MC_LOCAL_NO_KEYS === "0" ? "enabled" : process.env.MC_LOCAL_VOICE === "1" ? "voice practice only" : "disabled"})`));
async function snapshot() { if (!process.env.MC_MEMORY_FILE) return; const out = {}; for (const kind of ["clients", "index", "conversations", "bookings", "leads", "alerts", "events", "tasks", "usage", "customers", "optouts", "health", "accounts", "access_tokens", "access_sessions", "onboarding_drafts", "access_outbox", "access_rate", "owner_tests", "self_service_ai"]) { out[kind] = {}; for (const k of await store.list(kind, "")) out[kind][k] = await store.get(kind, k); } writeFileSync(join(root, process.env.MC_MEMORY_FILE), JSON.stringify(out)); console.log("store saved"); }
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await snapshot(); process.exit(0); });
