// Sandbox canary (revision 3). Run under offline.sh before any harness. Every non-loopback path, DNS included, must fail;
// loopback must work. Nothing here can leave the machine when the sandbox is in force: the OS refuses the connect.
import net from "node:net"; import dns from "node:dns/promises"; import dgram from "node:dgram"; import { execFileSync } from "node:child_process";
const out = []; const say = (k, v) => { out.push([k, v]); console.log(k.padEnd(34), v); };
const tcp = (h, p) => new Promise(r => { const s = net.connect({ host: h, port: p, timeout: 3000 }); s.on("connect", () => { s.destroy(); r("CONNECTED"); }); s.on("error", e => r("ERR " + e.code)); s.on("timeout", () => { s.destroy(); r("TIMEOUT"); }); });
const unix = p => new Promise(r => { const s = net.connect({ path: p }); s.on("connect", () => { s.destroy(); r("CONNECTED"); }); s.on("error", e => r("ERR " + e.code)); });
const udp = (h, p) => new Promise(r => { const s = dgram.createSocket("udp4"); s.on("error", e => { s.close(); r("ERR " + e.code); }); s.send(Buffer.from([0]), p, h, e => { s.close(); r(e ? "ERR " + e.code : "SENT"); }); });
const srv = net.createServer(c => c.end()).listen(0, "127.0.0.1"); await new Promise(r => srv.on("listening", r));
say("loopback tcp 127.0.0.1", await tcp("127.0.0.1", srv.address().port));
say("tcp 1.1.1.1:443", await tcp("1.1.1.1", 443));
say("tcp 8.8.8.8:53", await tcp("8.8.8.8", 53));
say("udp 8.8.8.8:53", await udp("8.8.8.8", 53));
say("unix /var/run/mDNSResponder", await unix("/var/run/mDNSResponder"));
try { say("dns.lookup example.com", JSON.stringify(await dns.lookup("example.com"))); } catch (e) { say("dns.lookup example.com", "ERR " + e.code); }
try { say("dns.resolve4 example.com", JSON.stringify(await dns.resolve4("example.com"))); } catch (e) { say("dns.resolve4 example.com", "ERR " + e.code); }
try { const r = await fetch("https://1.1.1.1/", { signal: AbortSignal.timeout(4000) }); say("fetch https://1.1.1.1", String(r.status)); } catch (e) { say("fetch https://1.1.1.1", "ERR " + (e.cause?.code || e.name)); }
try { execFileSync("/usr/bin/curl", ["-sS", "-m", "4", "-o", "/dev/null", "https://example.com/"], { stdio: "pipe" }); say("curl https://example.com", "OK"); } catch (e) { say("curl https://example.com", "ERR " + String(e.stderr || e.message).trim().slice(0, 60)); }
srv.close();
const leaks = out.filter(([k, v]) => !k.startsWith("loopback") && !/^ERR|^TIMEOUT/.test(v));
const ok = out[0][1] === "CONNECTED" && leaks.length === 0;
console.log(ok ? "CANARY PASS: loopback only, DNS denied" : "CANARY FAIL: " + JSON.stringify(leaks)); process.exit(ok ? 0 : 1);
