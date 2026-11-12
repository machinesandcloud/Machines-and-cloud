// QA-RC probe: does operator erasure (18 + 18-C1) remove customer_visit_requests rows written by
// customer-visit-changes r3 (lib/customer-visits.mjs, key `${slug}/${tenant}/<hash>`, holds phone + customer details)?
// Usage (cwd = copy root): node erasure-cvr-probe.mjs. Memory store, networking denied.
import net from 'node:net'; import http from 'node:http'; import https from 'node:https'; import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
const deny = () => { throw new Error('probe denies networking'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports(); globalThis.fetch = async () => deny();
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', URL: 'http://127.0.0.1:8942', ADMIN_EMAILS: 'op@example.test' });
const L = pathToFileURL(process.cwd() + '/netlify/functions/lib/').href;
const store = await import(L + 'store.mjs'), erasure = await import(L + 'data-erasure.mjs');
const { newClient } = await import(L + 'config.mjs'), { workspaceTenant } = await import(L + 'workspace-identity.mjs');
const { createHash } = await import('node:crypto'); const h = v => createHash('sha256').update(v).digest('hex');
const out = { registered: Object.hasOwn(erasure.ERASURE_REGISTRY, 'customer_visit_requests'), cases: [] };
async function shop(slug) {
  const c = newClient({ slug, ownerKey: 'k-' + slug, owner: { name: 'O', email: slug + '@example.invalid', phone: '+17135550140' }, business: { name: 'Shop ' + slug, trade: 'HVAC', city: 'Houston', hours: 'Mon-Sun 7am-7pm' } });
  Object.assign(c, { status: 'cancelled', onboarding: { version: 1, verifiedEmail: c.owner.email } }); await store.saveClient(c); await store.indexClient(c);
  return { c: await store.getClient(slug), T: workspaceTenant(c) };
}
// The exact row shape customer-visits.mjs requestCustomerVisitChange() writes.
const row = (T, phone) => ({ version: 1, tenant: T, visitId: 'bk_1', phone, channel: 'sms', action: 'cancel', date: '', window: '', managedActionId: 'm1',
  lead: { customer_name: 'CANARY Jane Homeowner', phone, address: '12 CANARY Street, Katy', issue: 'Customer asked by verified text to CANCEL visit bk_1.' }, visitFacts: 'r1', createdAt: new Date().toISOString() });
// 1. workspace erasure
{ const { c, T } = await shop('cvr-ws'); const key = `${c.slug}/${T}/${h(T + ':sub1')}`; await store.put('customer_visit_requests', key, row(T, '+17135550199'));
  const r = await erasure.eraseWorkspace({ slug: c.slug, client: c, actor: 'qa', reason: 'owner request', requireClosed: true });
  const left = await store.get('customer_visit_requests', key);
  out.cases.push({ case: 'workspace erasure', erasureState: r?.state || r?.status || Object.keys(r || {}).join(','), rowRemains: !!left, leftoverPII: left ? JSON.stringify(left).includes('CANARY') : false }); }
// 2. per-contact erasure
{ const { c, T } = await shop('cvr-contact'); c.status = 'live'; await store.saveClient(c);
  const key = `${c.slug}/${T}/${h(T + ':sub2')}`, other = `${c.slug}/${T}/${h(T + ':sub3')}`;
  await store.put('customer_visit_requests', key, row(T, '+17135550199')); await store.put('customer_visit_requests', other, row(T, '+17135550188'));
  const r = await erasure.eraseContact({ client: await store.getClient(c.slug), phone: '+17135550199', actor: 'qa', reason: 'customer request' });
  const left = await store.get('customer_visit_requests', key), kept = await store.get('customer_visit_requests', other);
  out.cases.push({ case: 'contact erasure (+17135550199)', erasureState: r?.state || '', rowRemains: !!left, leftoverPII: left ? JSON.stringify(left).includes('CANARY') : false, unrelatedContactRowKept: !!kept }); }
out.defect = out.cases.some(c => c.rowRemains);
console.log(JSON.stringify(out, null, 1));
process.exit(out.defect ? 1 : 0);
