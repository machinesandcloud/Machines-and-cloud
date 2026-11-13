// Polish-fix wrapper: real local server for COPY plus a loopback control port (mailbox + seed), same process/store.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
const C = process.env.COPY; const imp = p => import(pathToFileURL(C + '/' + p).href);
await imp('scripts/local-server.mjs');
const store = await imp('netlify/functions/lib/store.mjs');
const { accessHash } = await imp('netlify/functions/lib/access.mjs');
const desk = await imp('netlify/functions/lib/desk.mjs');
const day = n => { let d = new Date(Date.now() + n * 864e5); while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 864e5); return d.toISOString().slice(0, 10); };
createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1'); const out = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (u.pathname === '/mail') return out(await store.get('access_outbox', accessHash(u.searchParams.get('email'))));
    if (u.pathname === '/seed') {
      const c = await store.getClient(u.searchParams.get('slug')); const r = [];
      r.push(await desk.flagLead(c, { customer_name: 'Maria Gonzalez', phone: '7135550181', address: '1420 Westheimer Rd, Houston', issue: 'AC blowing warm air, house is 84 degrees', reason: 'lead', wanted: 'Visit this week' }, { channel: 'web', contact: 'w1' }));
      r.push(await desk.flagLead(c, { customer_name: 'Derrick Thompson', phone: '2815550142', address: '22 Mason Rd, Katy', issue: 'Smells gas near the furnace closet', reason: 'emergency', urgency: 'emergency' }, { channel: 'web', contact: 'w2' }));
      r.push(await desk.flagLead(c, { customer_name: 'Priya Natarajan', phone: '8325550199', issue: 'Asking price for a new 3-ton system', reason: 'wants_call' }, { channel: 'web', contact: 'w3' }));
      r.push(await desk.flagLead(c, { customer_name: 'Tom Becker', phone: '7135550123', issue: 'Do you service Cypress?', reason: 'lead' }, { channel: 'web', contact: 'w4' }));
      r.push(await desk.bookVisit(c, { customer_name: 'Linda Carter', phone: '7135550166', address: '901 Heights Blvd, Houston', issue: 'Annual AC tune-up', date: day(2), window: '8 am to 12 pm' }, { channel: 'web', contact: 'w5' }));
      return out(r.map(x => ({ id: x.id, full: x.full, message: x.message })));
    }
    out({ error: 'nf' }, 404);
  } catch (e) { out({ error: String(e?.stack || e) }, 500); }
}).listen(Number(process.env.CTRL_PORT), '127.0.0.1');
