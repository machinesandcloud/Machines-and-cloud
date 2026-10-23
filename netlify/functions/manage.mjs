import { AccessError, accessOriginAllowed, requestAccessLink, exchangeAccessToken, getAccessSession, revokeAccessSession } from './lib/access.mjs';
import { normalizeAccountEmail, strictRead } from './lib/accounts.mjs';
import { OperatorError, operatorEmails, requireOperator, customerPage, customerView, supportAction, operatorProviderStates } from './lib/operator.mjs';
import { prospectAudience, prospectsCSV } from './lib/intake.mjs';
import { platformSMSView } from './lib/platform-sms.mjs';

export const config = { path: '/api/manage' };
const headers = { 'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex', Vary: 'Authorization, Origin' };
const reply = (body, status = 200) => Response.json(body, { status, headers });
export default async (req, context) => {
  try {
    const url = new URL(req.url);
    if (url.pathname !== config.path) return reply({ error: 'not_found' }, 404);
    if (!['GET','POST'].includes(req.method)) return reply({ error: 'method_not_allowed' }, 405);
    const origin = req.headers.get('origin');
    if (req.method === 'POST' && !accessOriginAllowed(origin) || origin && !accessOriginAllowed(origin)) return reply({ error: 'forbidden' }, 403);
    if (req.method === 'POST') {
      if (url.search || !(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return reply({ error: 'invalid_request' }, 400);
      const raw = await req.text(); if (Buffer.byteLength(raw) > 12000) return reply({ error: 'too_large' }, 413);
      let body; try { body = JSON.parse(raw); } catch { return reply({ error: 'bad_json' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'invalid_request' }, 400);
      if (body.action === 'request_link') {
        if (Object.keys(body).some(k => !['action','email'].includes(k))) return reply({ error: 'invalid_request' }, 400);
        const allowed = operatorEmails(), email = normalizeAccountEmail(body.email);
        if (!email) return reply({ error: 'invalid_email', message: 'Enter your work email.' }, 400);
        if (!allowed.has(email)) return reply({ ok: true, message: 'If this email has operator access, a sign-in link will arrive shortly.' }, 202);
        return reply(await requestAccessLink(email, context?.ip || req.headers.get('x-nf-client-connection-ip'), undefined, undefined, 'operator'), 202);
      }
      if (body.action === 'exchange') {
        if (Object.keys(body).some(k => !['action','token'].includes(k))) return reply({ error: 'invalid_request' }, 400);
        operatorEmails();
        const result = await exchangeAccessToken(body.token, context?.ip || req.headers.get('x-nf-client-connection-ip'), 'operator');
        if (!operatorEmails().has(result.email)) { await revokeAccessSession(await getAccessSession(new Request(req.url, { headers: { authorization: 'Bearer ' + result.session } }), 'operator')); return reply({ error: 'forbidden' }, 403); }
        return reply(result);
      }
      const session = await requireOperator(req);
      if (body.action === 'sign_out') {
        if (Object.keys(body).some(k => k !== 'action')) return reply({ error: 'invalid_request' }, 400);
        return reply(await revokeAccessSession(session));
      }
      return reply(await supportAction(session, body));
    }
    const session = await requireOperator(req);
    if ([...url.searchParams.keys()].some(k => !['c','cursor','export'].includes(k)) || [...url.searchParams.keys()].length > 1) return reply({ error: 'invalid_request' }, 400);
    if (url.searchParams.has('export')) {
      const audience = url.searchParams.get('export'); if (!['all','eligible'].includes(audience)) return reply({ error: 'invalid_request' }, 400);
      return new Response(prospectsCSV(await prospectAudience(audience)), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${audience === 'eligible' ? 'marketing-contacts' : 'all-inquiries'}.csv"` } });
    }
    if (url.searchParams.has('c')) {
      const slug = url.searchParams.get('c'); if (!/^[a-z0-9-]{1,40}$/.test(slug || '')) return reply({ error: 'invalid_request' }, 400);
      const c = await strictRead('clients', slug); return c ? reply({ ok: true, customer: await customerView(c, true) }) : reply({ error: 'not_found' }, 404);
    }
    const page = await customerPage(url.searchParams.get('cursor') || '');
    const scheduler = await strictRead('health', 'scheduler:lastRun');
    const age = scheduler?.at ? Math.floor((Date.now() - Date.parse(scheduler.at)) / 60000) : null;
    return reply({ ok: true, operator: { email: session.email, expiresAt: session.expiresAt }, ...page, inquiries: await prospectAudience('all'), platformSMS: await platformSMSView(), system: { scheduler: { at: scheduler?.at || null, healthy: age !== null && age < 25 && scheduler?.ok === true, minutesAgo: age, blocks: Object.entries(scheduler?.blocks || {}).map(([name, row]) => ({ name, ok: row.ok === true, queued: row.queued, failed: row.failed, uncertain: row.uncertain, openFailures: row.openFailures, pending: row.pending, unresolved: row.unresolved, cleanupPending: row.cleanupPending, inspected: row.inspected, reasonCode: row.reasonCode })) }, providerStates: operatorProviderStates() } });
  } catch (error) {
    if (error instanceof OperatorError || error instanceof AccessError || Number.isInteger(error?.status) && error?.code) return reply({ error: error.code, message: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) }, error.status);
    return reply({ error: 'management_unavailable', message: 'We could not confirm this operation. Refresh to check the saved state before retrying.' }, 503);
  }
};
