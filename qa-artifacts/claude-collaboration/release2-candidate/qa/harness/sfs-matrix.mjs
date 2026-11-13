// Sec-Fetch-Site matrix against the local server (loopback only). Every request is sent explicitly with or without the header.
const B = "http://127.0.0.1:9853", MB = "http://127.0.0.1:9854", O = B;
const out = []; let n = 0;
const rec = (id, ok, detail) => { out.push({ id, ok, ...detail }); console.log((ok ? "PASS " : "FAIL ") + id + " " + JSON.stringify(detail)); };
function h(extra = {}, site) { const x = { "Content-Type": "application/json", Origin: O, ...extra }; if (site !== undefined && site !== null) x["Sec-Fetch-Site"] = site; return x; }
const cookieOf = (res, name) => { for (const c of res.headers.getSetCookie()) if (c.startsWith(name + "=")) return c.split(";")[0]; return ""; };
async function link(email) {
  const r = await fetch(B + "/api/access", { method: "POST", headers: h({ "x-nf-client-connection-ip": "10.9." + (++n) + ".1" }, "same-origin"), body: JSON.stringify({ action: "request_link", email }) });
  if (r.status !== 202) throw new Error("request_link " + r.status + " " + await r.text());
  const box = await (await fetch(MB + "/outbox?email=" + encodeURIComponent(email))).json();
  return /#verify=([a-f0-9]{64})/.exec(box.link)[1];
}
async function exchange(email, { site, probe = true, transport = "cookie", legacy = false }) {
  const token = await link(email);
  let probeCookie = "", probeValue;
  if (probe) { const p = await fetch(B + "/api/access", { method: "POST", headers: h({}, site), body: JSON.stringify({ action: "cookie_probe" }) }); probeValue = (await p.json()).probe; probeCookie = cookieOf(p, "mc_cookie_probe"); }
  const body = legacy ? { action: "exchange", token } : { action: "exchange", token, transport, ...(probeValue ? { probe: probeValue } : {}), persistent: false };
  const r = await fetch(B + "/api/access", { method: "POST", headers: h(probeCookie ? { Cookie: probeCookie } : {}, site), body: JSON.stringify(body) });
  const j = await r.json(); return { status: r.status, j, session: cookieOf(r, "mc_owner"), probeCookie };
}
async function state(bearer, cookie, site) {
  const headers = { Authorization: "Bearer " + bearer }; if (cookie) headers.Cookie = cookie; if (site) headers["Sec-Fetch-Site"] = site;
  const r = await fetch(B + "/api/access", { headers }); return r.status;
}
const SITES = [["same-origin", "same-origin"], ["missing", null], ["same-site", "same-site"], ["cross-site", "cross-site"], ["none", "none"], ["garbage", "Same-Origin"]];
for (const [label, site] of SITES.filter(([l]) => (process.env.ONLY || "").split(",").includes(l) || !process.env.ONLY)) {
  const email = `sfs-${label}@example.test`;
  const e = await exchange(email, { site });
  const expectCookie = label === "same-origin";
  rec(`X-${label} exchange succeeds`, e.status === 200 && e.j.ok === true, { status: e.status, transport: e.j.transport, hasSecret: !!e.j.session, hasHandle: !!e.j.handle, setCookie: !!e.session });
  rec(`X-${label} transport ${expectCookie ? "cookie" : "tab (fallback)"}`, e.j.transport === (expectCookie ? "cookie" : "tab"), { transport: e.j.transport });
  if (e.j.transport === "tab") {
    // A per-tab session must work whatever the follow-up label is.
    for (const [l2, s2] of SITES) { const st = await state(e.j.session, "", s2); rec(`X-${label} tab session follow-up ${l2} -> 200`, st === 200, { status: st }); }
  } else {
    for (const [l2, s2] of SITES) { const st = await state(e.j.handle, e.session, s2); rec(`X-${label} cookie session follow-up ${l2} -> ${l2 === "same-origin" ? "200" : "401 (refused)"}`, l2 === "same-origin" ? st === 200 : st === 401, { status: st }); }
    const st = await state(e.j.handle, "", "same-origin"); rec(`X-${label} handle without cookie -> 401`, st === 401, { status: st });
  }
}
// Cookies silently dropped: probe cookie not returned -> per-tab.
if (!process.env.SKIP_EXTRA) { const token = await link("sfs-dropped@example.test");
  const p = await fetch(B + "/api/access", { method: "POST", headers: h({}, "same-origin"), body: JSON.stringify({ action: "cookie_probe" }) }); const pv = (await p.json()).probe;
  const r = await fetch(B + "/api/access", { method: "POST", headers: h({}, "same-origin"), body: JSON.stringify({ action: "exchange", token, transport: "cookie", probe: pv }) }); const j = await r.json();
  rec("D-cookies dropped -> tab fallback with secret", r.status === 200 && j.transport === "tab" && /^[a-f0-9]{64}$/.test(j.session || ""), { status: r.status, transport: j.transport }); }
// Legacy client (cached old onboard.js): no transport field, header missing.
if (!process.env.SKIP_EXTRA) { const e = await exchange("sfs-legacy@example.test", { site: null, probe: false, legacy: true });
  rec("L-legacy exchange (no transport) returns session, no cookie", e.status === 200 && /^[a-f0-9]{64}$/.test(e.j.session || "") && !e.session && e.j.transport === undefined, { status: e.status, transport: e.j.transport ?? null });
  rec("L-legacy session follow-up without header -> 200", await state(e.j.session, "", null) === 200, {}); }
// Owner routes: cookie session read without the header on /api/client is refused the same way (mixed state).
console.log(JSON.stringify({ total: out.length, passed: out.filter(r => r.ok).length }));
import { writeFileSync } from "node:fs"; writeFileSync(process.argv[2], JSON.stringify({ at: new Date().toISOString(), base: B, results: out }, null, 1));
