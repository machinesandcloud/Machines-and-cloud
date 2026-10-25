export const bearer = 'synthetic_owner_session_1234567890_abcdef';
export const slug = 'synthetic-owned-workspace';
export const environment = { MC_WORKSPACE_URL: `https://machinesandcloud.com/desk?c=${slug}#setup`, MC_OWNER_BEARER: bearer };
export const privateStrings = [bearer, 'Synthetic Owner Person', 'owner-private@example.invalid', '+17135550129', '982 Synthetic Private Road', 'synthetic-key-private-abc', 'provider_secret_abcdefghijklmnop12345678'];
export function fixture() {
  const guide = id => ({
    overview: `Review ${id} using your saved business rules.`, automationSummary: 'Approved setup continues in the workspace; permissions remain yours.',
    steps: [
      { id: 'provider-opaque-id-never-project', label: 'Review business details', detail: 'Check the shared business details first.', state: 'current', actor: 'customer', focus: 'business' },
      { id: 'next', label: 'Provider review', detail: 'Wait for the provider decision before a connection is active.', state: 'upcoming', actor: 'provider', focus: 'connection' }
    ]
  });
  const row = id => ({ id, label: 'Upstream label must not replace the known label', status: 'needs_action', requested: true, retained: false, active: false, detail: 'Your choice is saved; this service is not active.', nextStep: 'Review the next step.', guide: guide(id), endpoint: 'https://private.invalid/secret', accountId: 'private-account-id' });
  return {
    client: { slug, name: privateStrings[1], email: privateStrings[2], phone: privateStrings[3], address: privateStrings[4], key: privateStrings[5] },
    connections: { token: privateStrings[6], ownerBearer: bearer },
    leadConnections: { thumbtack: { webhookURL: 'https://private.invalid/secret', businessId: 'private-business-id' } },
    leads: [{ customer_name: 'Never Project Customer', phone: '+17135550139', issue: 'Private customer record' }],
    conversations: [{ messages: [{ content: 'Never project customer conversation' }] }],
    setup: { key: privateStrings[5], connectionJourney: {
      summary: 'Review the next shared setup step before connecting services.',
      nextAction: { kind: 'route', target: 'know', label: 'Review business details' },
      channels: ['web','voice','sms','calendar'].map(row), leadSources: ['thumbtack','angi'].map(row),
      discovery: ['google_local_services_ads','yelp','meta_messaging','houzz','nextdoor','porch'].map(id => ({ id, label: 'Untrusted label', fit: 'Explore this source if you already use it.', connectionMode: id === 'yelp' ? 'partner_api_or_bridge' : 'external_handoff', availability: id === 'yelp' ? 'partner_required' : 'research', providerURL: 'https://provider.invalid/not-returned', detail: 'This discovery option is not an active M&C connection.' }))
    } }
  };
}
export const jsonResponse = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
