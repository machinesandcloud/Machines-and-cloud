const r = {};
for (const u of ['https://api.twilio.com/','https://example.com/','http://1.1.1.1/']) {
  try { const x = await fetch(u, { signal: AbortSignal.timeout(5000) }); r[u] = 'REACHED ' + x.status; } catch (e) { r[u] = 'blocked: ' + (e.cause?.code || e.message); }
}
import net from 'node:net';
await new Promise(res => { const s = net.createServer().listen(0, '127.0.0.1', () => { const c = net.connect(s.address().port, '127.0.0.1', () => { r.loopback = 'ok'; c.end(); s.close(); res(); }); c.on('error', e => { r.loopback = 'fail ' + e.code; s.close(); res(); }); }); });
console.log(JSON.stringify(r));
