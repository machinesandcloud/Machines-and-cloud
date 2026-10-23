import { json } from './lib/agent.mjs';
import { strictRead } from './lib/accounts.mjs';
import { isSupportedSelfServiceClient } from './lib/setup.mjs';
import { publicWebsiteCheck, WebsiteInstallationError, exactWebsiteOrigin } from './lib/website-installation.mjs';
export const config = { path: '/api/website-installation' };
const cors = origin => exactWebsiteOrigin(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {};
export default async req => {
  const origin = req.headers.get('origin') || '', headers = { ...cors(origin), 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, headers);
  if (!exactWebsiteOrigin(origin) || req.headers.has('authorization')) return json({ error: 'website_check_origin', message: 'Use this check from the selected external website.' }, 403, headers);
  let body; try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400, headers); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 1500 || !/^[a-z0-9-]{1,40}$/.test(body.client || '')) return json({ error: 'invalid_website_check' }, 400, headers);
  try {
    const c = await strictRead('clients', body.client);
    if (!isSupportedSelfServiceClient(c)) return json({ error: 'website_check_unavailable' }, 404, headers);
    return json(await publicWebsiteCheck(c, body, origin), 200, headers);
  } catch (error) {
    if (error instanceof WebsiteInstallationError) return json({ error: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) }, error.status, headers);
    return json({ error: 'website_check_unavailable', message: 'The check status could not be confirmed. Return to your workspace before trying again.' }, 503, headers);
  }
};
