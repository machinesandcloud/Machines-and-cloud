// Preload: refuse any outbound transport that is not loopback; log attempts.
import net from 'node:net'; import http from 'node:http'; import https from 'node:https'; import { syncBuiltinESMExports } from 'node:module';
const ok = h => /^(127\.0\.0\.1|localhost|::1)$/.test(String(h||'').replace(/^\[|\]$/g,''));
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => { const u = new URL(typeof input === 'string' ? input : input.url); if (!ok(u.hostname)) { console.error('[egress-blocked] fetch', u.origin + u.pathname); throw new TypeError('egress blocked: ' + u.hostname); } return realFetch(input, init); };
for (const [m, k] of [[http,'request'],[http,'get'],[https,'request'],[https,'get']]) { const orig = m[k]; m[k] = function (a, ...r) { const h = typeof a === 'string' ? new URL(a).hostname : a?.hostname || a?.host; if (!ok(h)) { console.error('[egress-blocked]', k, h); throw new Error('egress blocked'); } return orig.call(this, a, ...r); }; }
const oc = net.connect; net.connect = net.createConnection = function (a, ...r) { const h = typeof a === 'object' ? a.host : r[0]; if (h && !ok(h)) { console.error('[egress-blocked] net', h); throw new Error('egress blocked'); } return oc.call(this, a, ...r); };
syncBuiltinESMExports();
