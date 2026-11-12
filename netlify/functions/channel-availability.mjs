// Public, tenant-free availability for the homepage and onboarding. It reads only
// configuration gates (see lib/channel-availability.mjs) and is CDN-cached, so a
// page view does not reach a provider, the store or a customer record.
import { currentChannelAvailability } from './lib/channel-availability.mjs';

export const config = { path: '/api/channel-availability' };

export default async req => {
  if (!['GET', 'HEAD'].includes(req.method)) return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { Allow: 'GET, HEAD', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const view = await currentChannelAvailability();
  const body = JSON.stringify({ version: view.version, channels: view.channels.map(({ id, label, state, status, note, detail }) => ({ id, label, state, status, note, detail })) });
  return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'Netlify-CDN-Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
    'X-Content-Type-Options': 'nosniff',
  } });
};
