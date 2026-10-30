// Both fixed Netlify routes share validation; the endpoint chooses the environment.
// A provider or customer query parameter can never choose another callback target.
import { completeThumbtackConnection } from './thumbtack-connection.mjs';
import { thumbtackRedirectURI } from './thumbtack-environment.mjs';

const privateHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const failurePage = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Check your Thumbtack connection</title><body><main><h1>Your Thumbtack connection needs another look.</h1><p>Return to your workspace to review this connection and continue. Your saved requests are kept.</p><a href="https://machinesandcloud.com/onboard.html">Return to your workspace</a></main></body></html>';

export function thumbtackCallback(environment) {
  const expected = new URL(thumbtackRedirectURI(environment));
  return async req => {
    if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: privateHeaders });
    const url = new URL(req.url);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash ||
        [...url.searchParams.keys()].some(key => !['state','code','error','error_description','scope'].includes(key)) ||
        ['state','code','error'].some(key => url.searchParams.getAll(key).length > 1)) {
      return new Response('Invalid authorization response', { status: 400, headers: privateHeaders });
    }
    try {
      const result = await completeThumbtackConnection({ endpointEnvironment: environment,
        state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: url.searchParams.get('error') });
      return new Response(null, { status: 303, headers: { ...privateHeaders,
        Location: `https://machinesandcloud.com/desk?c=${encodeURIComponent(result.slug)}&connection=thumbtack#setup` } });
    } catch {
      return new Response(failurePage, { status: 409, headers: { ...privateHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'" } });
    }
  };
}
