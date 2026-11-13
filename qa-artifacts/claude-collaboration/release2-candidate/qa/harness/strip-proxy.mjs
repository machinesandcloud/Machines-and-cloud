// QA proxy: 127.0.0.1:P2 -> 127.0.0.1:P1. Rewrites Origin/Host to P1 (as a CDN would present the site origin) and,
// when strip is on, removes every Sec-Fetch-* request header (simulates Netlify/browser omitting it). Toggle: /__qa/strip?on=0|1
import http from "node:http";
const P1 = Number(process.argv[2]), P2 = Number(process.argv[3]); let strip = process.argv[4] !== "0"; const seen = [];
http.createServer((req, res) => {
  if (req.url.startsWith("/__qa/strip")) { strip = new URL(req.url, "http://x").searchParams.get("on") === "1"; res.end(JSON.stringify({ strip })); return; }
  if (req.url.startsWith("/__qa/seen")) { res.end(JSON.stringify(seen)); return; }
  const headers = { ...req.headers, host: "127.0.0.1:" + P1 };
  if (process.argv[5] !== "norewrite" && headers.origin === "http://127.0.0.1:" + P2) headers.origin = "http://127.0.0.1:" + P1;
  if (process.argv[5] !== "norewrite" && headers.referer) headers.referer = headers.referer.replace(":" + P2, ":" + P1);
  if (req.url.startsWith("/api/")) seen.push({ path: req.url.split("?")[0], method: req.method, sfs: req.headers["sec-fetch-site"] || null, stripped: strip });
  if (strip) for (const k of Object.keys(headers)) if (k.startsWith("sec-fetch-")) delete headers[k];
  const up = http.request({ host: "127.0.0.1", port: P1, method: req.method, path: req.url, headers }, r => { const h = { ...r.headers }; if (h.location) h.location = h.location.replace("127.0.0.1:" + P1, "127.0.0.1:" + P2); res.writeHead(r.statusCode, h); r.pipe(res); });
  up.on("error", e => { res.writeHead(502); res.end(String(e)); }); req.pipe(up);
}).listen(P2, "127.0.0.1", () => console.log("strip proxy", P2, "->", P1, "strip", strip));
