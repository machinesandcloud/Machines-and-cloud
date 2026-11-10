// Independent QA probe (sms-correction-followup). Run from the worktree root, no --output (the harness then writes nothing):
//   env -i HOME="$HOME" PATH="$PATH" node qa-artifacts/claude-collaboration/sms-correction-followup/qa/probes/qa-sms-correction-probe.mjs <shots-dir>
// Observations are printed as JSON lines prefixed OBS. Screenshots go to <shots-dir>.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const shots = process.argv[2]; if (!shots) throw new Error('shots dir required');
const { harness, ACCOUNT_SID } = await import('../../sms-harness.mjs');
const h = await harness({ name: 'smsfix-qa', watched: ['desk-connections.js', 'netlify/functions/lib/messaging-activation.mjs'], qualifications: 'QA probe' });
const { store, fixture, check, until, tabTo, active, report, lib } = h;
const sms = await import(lib('netlify/functions/lib/messaging-activation.mjs'));
const { strictRead } = await import(lib('netlify/functions/lib/accounts.mjs'));
const hash = v => createHash('sha256').update(v).digest('hex');
const obs = (name, value) => { console.log('OBS ' + JSON.stringify({ name, value })); report.observations.push({ name, value }); };
const original = () => ({ legalName: 'Fixture Plumbing LLC', ein: '92-1234567', businessType: 'llc', businessIndustry: 'CONSTRUCTION', street: '123 Fixture Street', street2: '', city: 'Houston', state: 'TX', zip: '77057', website: 'https://shop.example.com', representative: { firstName: 'Alex', lastName: 'Fixture', email: 'alex.rep@example.com', phone: '+17135550198', title: 'Owner', jobPosition: 'CEO' } });
async function correctionFixture(width, issues, extra = {}) {
  const x = await fixture({ width, configure: async c => {
    c.phone.forwarding = 'none';
    const identity = hash(JSON.stringify([c.slug, c.ownerKey, c.owner.email.toLowerCase()])), intentId = c.slug + '/' + hash('first-phone-acquisition:' + identity), at = new Date().toISOString();
    await store.put('phone_activation_intents', intentId, { id: intentId, version: 1, slug: c.slug, tenantIdentity: identity, resourceAccountHash: hash(ACCOUNT_SID), state: 'number_acquired', resource: { id: 'PN' + hash(c.slug).slice(0, 32), number: '+17135550111' }, correlationId: hash('fixture-phone:' + c.slug), dependencies: {}, createdAt: at, updatedAt: at });
  } });
  const current = await strictRead('clients', x.slug), status = await sms.messagingActivationStatus(current);
  const created = await sms.requestMessagingActivation(current, { expectedRevision: h.setup.configurationRevision(current), submissionId: 'a'.repeat(32), actor: { role: 'owner', email: current.owner.email }, offerVersion: status.offer.version, offerDigest: status.offer.digest, programDigest: status.program.digest, authority: true, acceptedCosts: true, attestLegalAccuracy: true, attestConsent: true, testPhoneConsent: true, legal: original() });
  await store.atomicUpdate('messaging_activation', created.id, old => ({ value: { ...old, state: 'needs_action', reasonCode: 'registration_correction_required', issues, ...extra } }));
  await x.page.reload(); await x.page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return x;
}
async function openCorrection(x) {
  const { page } = x;
  await tabTo(page, 'button[data-guide-service="sms"]'); await page.keyboard.press('Enter');
  await page.locator('#connectorStart').waitFor(); await tabTo(page, '#connectorStart'); await page.keyboard.press('Enter');
  await page.locator('#setupGuideContinue').waitFor(); await tabTo(page, '#setupGuideContinue'); await page.keyboard.press('Enter');
  const form = page.locator('dialog#connectionDialog[open] #connectionForm'); await form.waitFor(); await page.waitForTimeout(150);
  return form;
}
const snapshot = page => page.evaluate(() => {
  const d = document.querySelector('dialog#connectionDialog[open]'), s = d.querySelector('#smsIssueSummary');
  return { heading: s?.querySelector('h3')?.textContent, summaryText: s?.innerText, items: [...(s?.querySelectorAll('li') || [])].map(li => ({ text: li.textContent, href: li.querySelector('a')?.getAttribute('href') || null })),
    elementsInSummary: [...(s?.querySelectorAll('*') || [])].map(n => n.tagName).filter((t, i, a) => a.indexOf(t) === i),
    injected: { img: d.querySelectorAll('img,svg[onload],script').length, flags: [window.__xc, window.__xf, window.__xe, window.__xs] },
    flagged: [...d.querySelectorAll('[aria-invalid="true"]')].map(i => ({ name: i.name, label: i.closest('label')?.firstChild?.textContent, note: (i.getAttribute('aria-describedby') || '').split(' ').map(id => document.getElementById(id)?.textContent).join(' | ') })),
    submit: { text: d.querySelector('button[type="submit"]')?.innerText, enabled: !d.querySelector('button[type="submit"]')?.disabled } };
});

for (const width of [390, 1440]) await check(width + ' P1 escaping: <img onerror> in code and field is inert text', async () => {
  const x = await correctionFixture(width, [{ code: '<img src=x onerror="window.__xc=1">', field: '<img src=x onerror="window.__xf=1">' }, { code: '<svg onload=window.__xe=1>', field: 'ein' }, { code: 'invalid', field: '"><script>window.__xs=1</script>' }]);
  await openCorrection(x); await x.page.waitForTimeout(300); const s = await snapshot(x.page); obs('P1-' + width, s);
  assert.equal(s.injected.img, 0); assert.deepEqual(s.injected.flags, [null, null, null, null].map(() => undefined));
  assert.ok(s.summaryText.includes('<img src=x onerror="window.__xf=1">')); assert.ok(s.flagged[0].note.includes('<svg onload=window.__xe=1>'));
  await x.page.screenshot({ path: shots + '/p1-escaping-' + width + '.png' });
});

await check('P2 prototype-named keys: field "constructor", code "toString"/"constructor"', async () => {
  const x = await correctionFixture(1440, [{ code: 'toString', field: 'constructor' }, { code: 'constructor', field: 'ein' }]);
  await openCorrection(x); const s = await snapshot(x.page); obs('P2', { ...s, pageErrors: report.pageErrors.slice() });
  await x.page.screenshot({ path: shots + '/p2-proto-1440.png', fullPage: false });
});

await check('P3 ambiguous email: which form field does field "email"/"Email" mark?', async () => {
  for (const field of ['email', 'Email']) { const x = await correctionFixture(1440, [{ code: 'invalid', field }]); await openCorrection(x); obs('P3-' + field, await snapshot(x.page)); await x.context.close(); }
});

await check('P3b profile-level object fields (FriendlyName, IsoCountry, address_sids, business_identity) stay unmarked', async () => {
  const x = await correctionFixture(1440, ['FriendlyName', 'IsoCountry', 'address_sids', 'business_identity', 'business_registration_identifier', 'CustomerName', 'website_url', 'StreetSecondary', 'PostalCode', 'business_title', 'job_position', 'phone_number'].map(field => ({ code: 'invalid', field })));
  await openCorrection(x); const s = await snapshot(x.page); obs('P3b', s);
});

for (const width of [390, 1440]) await check(width + ' P4 exhausted: submissionRevision 2 with maxResubmissions 1 — what the owner sees and what save does', async () => {
  const x = await correctionFixture(width, [{ code: 'invalid', field: 'ein' }], { submissionRevision: 2 }), page = x.page, form = await openCorrection(x);
  const s = await snapshot(page); obs('P4-open-' + width, s);
  for (const n of ['authority', 'costs', 'accuracy', 'consumerConsent', 'testConsent']) await form.locator('[name="' + n + '"]').check().catch(() => {});
  await form.locator('button[type="submit"]').click();
  await until(() => x.state.requests.some(r => r.action === 'correct_messaging_activation' && r.status), 'correction posted');
  await page.waitForTimeout(400);
  const req = x.state.requests.find(r => r.action === 'correct_messaging_activation');
  obs('P4-save-' + width, { sent: { authority: req.body.authority, acceptedCosts: req.body.acceptedCosts, attestLegalAccuracy: req.body.attestLegalAccuracy, attestConsent: req.body.attestConsent, testPhoneConsent: req.body.testPhoneConsent, expectedSubmissionRevision: req.body.expectedSubmissionRevision }, status: req.status, response: req.response, dialogText: (await page.locator('dialog#connectionDialog[open]').innerText().catch(() => '')).slice(0, 400), focus: await active(page) });
  await page.screenshot({ path: shots + '/p4-exhausted-' + width + '.png' });
});

for (const width of [390, 1440]) await check(width + ' P5 reading order and mouse link activation', async () => {
  const x = await correctionFixture(width, [{ code: 'invalid', field: 'email' }, { code: 'invalid', field: 'businessType' }]), page = x.page; await openCorrection(x);
  const order = await page.evaluate(() => { const d = document.querySelector('dialog#connectionDialog[open]'); return [...d.querySelectorAll('h2,h3,p,li,label,[data-sms-issue]')].slice(0, 14).map(n => n.tagName + ':' + n.textContent.trim().slice(0, 60)); });
  const focus = await active(page), before = await page.evaluate(() => location.href);
  await page.locator('#smsIssueSummary a[data-sms-issue-field="businessType"]').click(); await page.waitForTimeout(150);
  const after = await active(page), href = await page.evaluate(() => location.href);
  const sel = await page.evaluate(() => { const i = document.querySelector('dialog#connectionDialog[open] [name="businessType"]'), n = document.getElementById('smsIssue-businessType'); return { noteAfterLabel: i.closest('label').nextElementSibling === n, describedBy: i.getAttribute('aria-describedby') }; });
  obs('P5-' + width, { order, focusOnOpen: focus, afterClick: after, routeUnchanged: before === href, sel });
  assert.equal(after.name, 'businessType'); assert.equal(before, href);
  await page.screenshot({ path: shots + '/p5-order-' + width + '.png' });
});

await check('P6 lost response on the correction: focus and summary after the unknown outcome', async () => {
  const x = await correctionFixture(1440, [{ code: 'invalid', field: 'ein' }]), page = x.page, form = await openCorrection(x);
  for (const n of ['authority', 'costs', 'accuracy', 'consumerConsent', 'testConsent']) await form.locator('[name="' + n + '"]').check().catch(() => {});
  x.state.faults.push({ match: item => item.action === 'correct_messaging_activation', kind: 'lost' });
  await form.locator('button[type="submit"]').click();
  await until(() => x.state.requests.some(r => r.lostAfterEffect), 'lost'); await page.waitForTimeout(800);
  obs('P6', { focus: await active(page), summaryPresent: await page.locator('dialog#connectionDialog[open] #smsIssueSummary').count(), submitEnabled: await page.locator('dialog#connectionDialog[open] button[type="submit"]').isEnabled().catch(() => null), corrections: x.state.requests.filter(r => r.action === 'correct_messaging_activation').length });
  await page.screenshot({ path: shots + '/p6-lost-1440.png' });
});
await h.finish();
