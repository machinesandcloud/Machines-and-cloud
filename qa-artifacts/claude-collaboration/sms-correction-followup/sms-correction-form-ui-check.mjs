// sms-correction-followup copy of the coverage map's sms-correction-form-ui-check.mjs. The first 14 checks are the
// original ones, unchanged except for paths and receipt names. Added after them (C1 follow-up): the flagged EIN is marked
// and described at 390 and 1440, the summary takes focus on open and its link moves keyboard focus to the field
// (390, 1440), several issues on two fields, and issue fields that match no form field.
// QA notes (added after them): an email issue names no field (390, 1440); with no correction left the form is read-only
// without a save (390, 1440); built-in property names such as "constructor" are treated as unknown text.
// Coverage lost in suite-refresh-2 (REFRESH-2.md, "Coverage the refresh does not keep", item 1): the editable
// registration form. At dfb0ae78 it is reachable only when the carrier asks for a correction:
// - messaging-activation.mjs:98 view(): state needs_action gives customerAction 'correct_registration';
// - connection-journey.mjs:110 makes the texting row's action review_sms "Review registration details";
// - desk-connections.js:390 loads the private registration (?service_intake=1), then :433-441 renders
//   registrationFields(client, editable = !!sms.operation) (:72-76) with "Save corrected details" and posts
//   correct_messaging_activation with operationId and expectedSubmissionRevision;
// - client.mjs:395 calls correctMessagingActivation (messaging-activation.mjs:133-151).
// Fixture: a number_acquired phone row and a texting registration created in-process with the real
// requestMessagingActivation(), then moved to needs_action with one carrier issue on the EIN, as the carrier review
// does (messaging-activation.mjs:213/230). Everything after that runs through the browser and the actual handler.
// Run from the worktree root:
//   env -i HOME="$HOME" PATH="$PATH" node qa-artifacts/claude-collaboration/sms-correction-followup/sms-correction-form-ui-check.mjs --output scratchpad/claude-smsfix-<name>.json
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const { harness, ACCOUNT_SID } = await import('./sms-harness.mjs');
const h = await harness({
  name: 'smsfix-correct',
  watched: ['desk.html', 'desk.js', 'desk-connections.js', 'desk-service-intake.js', 'desk-setup-guide.js', 'netlify/functions/client.mjs', 'netlify/functions/lib/service-intake.mjs', 'netlify/functions/lib/messaging-activation.mjs', 'netlify/functions/lib/connection-journey.mjs', 'qa-artifacts/claude-collaboration/sms-correction-followup/sms-correction-form-ui-check.mjs'],
  qualifications: 'Self-service workspace with a synthetic acquired number and a real texting registration row moved to needs_action (carrier correction requested, issue on the EIN). Actual /api/client handler, memory store, fake model, synthetic open gates, no provider transport. Lost responses: route.abort after the handler committed.',
});
const { store, fixture, check, shot, noHorizontalScroll, until, tabTo, active, report, lib } = h;
const sms = await import(lib('netlify/functions/lib/messaging-activation.mjs'));
const { serviceIntakeView } = await import(lib('netlify/functions/lib/service-intake.mjs'));
const { strictRead } = await import(lib('netlify/functions/lib/accounts.mjs'));
const { openPrivate } = await import(lib('netlify/functions/lib/private-encryption.mjs'));
const hash = v => createHash('sha256').update(v).digest('hex');
const original = () => ({ legalName: 'Fixture Plumbing LLC', ein: '92-1234567', businessType: 'llc', businessIndustry: 'CONSTRUCTION', street: '123 Fixture Street', street2: '', city: 'Houston', state: 'TX', zip: '77057', website: 'https://shop.example.com', representative: { firstName: 'Alex', lastName: 'Fixture', email: 'alex.rep@example.com', phone: '+17135550198', title: 'Owner', jobPosition: 'CEO' } });
const unseal = row => JSON.parse(openPrivate(row.privateData, { family: 'platform', purpose: 'messaging-registration', aad: row.id, legacyAAD: row.id, legacyFormat: 'registration' }));
const corrections = x => x.state.requests.filter(r => r.action === 'correct_messaging_activation');

async function correctionFixture(width = 1440, issues = [{ code: 'invalid', field: 'ein' }], extra = {}) {
  const x = await fixture({ width, configure: async c => {
    c.phone.forwarding = 'none';
    const identity = hash(JSON.stringify([c.slug, c.ownerKey, c.owner.email.toLowerCase()])), intentId = c.slug + '/' + hash('first-phone-acquisition:' + identity), at = new Date().toISOString();
    await store.put('phone_activation_intents', intentId, { id: intentId, version: 1, slug: c.slug, tenantIdentity: identity, resourceAccountHash: hash(ACCOUNT_SID), state: 'number_acquired', resource: { id: 'PN' + hash(c.slug).slice(0, 32), number: '+17135550111' }, correlationId: hash('fixture-phone:' + c.slug), dependencies: {}, createdAt: at, updatedAt: at });
  } });
  const current = await strictRead('clients', x.slug), status = await sms.messagingActivationStatus(current);
  const created = await sms.requestMessagingActivation(current, { expectedRevision: h.setup.configurationRevision(current), submissionId: 'a'.repeat(32), actor: { role: 'owner', email: current.owner.email }, offerVersion: status.offer.version, offerDigest: status.offer.digest, programDigest: status.program.digest, authority: true, acceptedCosts: true, attestLegalAccuracy: true, attestConsent: true, testPhoneConsent: true, legal: original() });
  await store.atomicUpdate('messaging_activation', created.id, old => ({ value: { ...old, state: 'needs_action', reasonCode: 'registration_correction_required', issues, ...extra, history: [...old.history, { at: new Date().toISOString(), type: 'carrier_correction_requested' }] } }));
  x.operationId = created.id;
  await x.page.reload(); await x.page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return x;
}
// Keyboard path: Connections > Text messaging > Continue setup > Review registration details.
async function openCorrection(x) {
  const { page } = x;
  await tabTo(page, 'button[data-guide-service="sms"]'); await page.keyboard.press('Enter');
  await page.locator('#connectorStart').waitFor(); await tabTo(page, '#connectorStart'); await page.keyboard.press('Enter');
  await page.locator('#setupGuideContinue').waitFor(); assert.equal(await page.locator('#setupGuideContinue').innerText(), 'Review registration details');
  await tabTo(page, '#setupGuideContinue'); await page.keyboard.press('Enter');
  const form = page.locator('dialog#connectionDialog[open] #connectionForm'); await form.waitFor();
  return form;
}
const inputs = form => form.evaluate(node => Object.fromEntries([...node.querySelectorAll('input:not([type=checkbox]), select')].map(i => [i.name, i.value])));
async function setField(form, name, text) { const el = form.locator('[name="' + name + '"]'); if (await el.evaluate(n => n.tagName) === 'SELECT') await el.selectOption(text); else await el.fill(text); }
async function acceptAll(form) { for (const box of await form.locator('input[type="checkbox"]').all()) await box.check(); }
const submit = form => form.locator('button[type="submit"]').click();
const dialogMessage = page => page.locator('#connectionDialogMessage');
const settle = async (x, count) => until(async () => corrections(x).length >= count && corrections(x).at(-1).status !== undefined && !(await x.page.locator('#connectionForm button[type="submit"][disabled]').count()), 'correction response ' + count);

for (const width of [390, 1440]) await check(width + ': A carrier correction opens the editable registration form, prefilled from the saved registration, with fresh unchecked approvals', async () => {
  const x = await correctionFixture(width), form = await openCorrection(x), page = x.page;
  assert.equal(await page.locator('#connectionTitle').innerText(), 'Set up customer texting');
  assert.equal(await form.locator('button[type="submit"]').innerText(), 'Save corrected details');
  assert.deepEqual(await inputs(form), { legalName: 'Fixture Plumbing LLC', ein: '921234567', businessType: 'llc', businessIndustry: 'CONSTRUCTION', street: '123 Fixture Street', street2: '', city: 'Houston', state: 'TX', zip: '77057', website: 'https://shop.example.com', firstName: 'Alex', lastName: 'Fixture', email: 'alex.rep@example.com', phone: '+17135550198', title: 'Owner', jobPosition: 'CEO' });
  for (const name of ['legalName', 'ein', 'businessType', 'businessIndustry', 'street', 'city', 'state', 'zip', 'website', 'firstName', 'lastName', 'email', 'phone', 'title', 'jobPosition']) assert.equal(await form.locator('[name="' + name + '"]').evaluate(n => n.required && !n.disabled && !n.readOnly), true, name + ' editable and required');
  assert.equal(await form.locator('[name="street2"]').evaluate(n => n.required), false);
  assert.equal(await form.locator('input[type="checkbox"][required]').count(), 5); assert.equal(await form.locator('input[type="checkbox"]:checked').count(), 0);
  assert.equal(await form.locator('[data-connection="edit_sms_intake"]').count(), 0, 'not the read-only summary');
  assert.equal(x.state.requests.filter(r => r.query.includes('service_intake=1')).length, 1, 'one private registration read');
  assert.deepEqual(x.state.requests.filter(r => r.method === 'POST'), []);
  await noHorizontalScroll(page); await shot(page, 'correction-form-' + width);
});

await check('The correction form identifies the detail the carrier flagged', async () => {
  const x = await correctionFixture(), form = await openCorrection(x);
  const view = await sms.messagingActivationStatus(await strictRead('clients', x.slug));
  assert.deepEqual(view.operation.issues, [{ code: 'invalid', field: 'ein' }]); assert.match(view.operation.detail, /Review the highlighted business details/);
  const flagged = await form.locator('[aria-invalid="true"]').evaluateAll(nodes => nodes.map(n => n.name));
  const text = await x.page.locator('dialog#connectionDialog').innerText();
  report.observations.push({ check: 'flagged-field', operationDetail: view.operation.detail, ariaInvalid: flagged, mentionsCorrection: /correct/i.test(text.replace(/Save corrected details/, '')) });
  assert.ok(flagged.includes('ein') || /(carrier|correction)[^.]*\bEIN\b|\bEIN\b[^.]*(carrier|correction)/i.test(text), 'The server says "Review the highlighted business details" and sends issues [{field:"ein"}], but the form marks no field and never says which detail the carrier rejected.');
});

{
  const x = await correctionFixture(), page = x.page; let form, validated = false, submitted = false;
  await check('Validation: an emptied required field blocks submit in the browser and focuses that field', async () => {
    form = await openCorrection(x); await acceptAll(form); await setField(form, 'ein', '');
    await submit(form); await page.waitForTimeout(300);
    assert.equal(corrections(x).length, 0, 'no POST');
    assert.equal((await active(page)).name, 'ein', 'native validation focuses the empty field');
    assert.equal(await form.locator('[name="ein"]').evaluate(n => n.validity.valueMissing), true);
    validated = true;
  });
  await check('Validation: a server-refused EIN keeps the dialog and input, announces the server reason, and stores nothing', async () => {
    assert.ok(validated);
    await setField(form, 'ein', '12345'); await setField(form, 'street', '500 Corrected Avenue'); await submit(form); await settle(x, 1);
    assert.equal(corrections(x)[0].status, 400); assert.equal(corrections(x)[0].response.error, 'invalid_legal_details');
    await until(async () => (await dialogMessage(page).innerText()) === 'Check the EIN field.', 'server message');
    assert.equal(await dialogMessage(page).getAttribute('role'), 'status'); assert.equal(await dialogMessage(page).getAttribute('aria-live'), 'polite');
    assert.equal(await page.locator('dialog#connectionDialog[open]').count(), 1);
    const kept = await inputs(form); assert.equal(kept.ein, '12345'); assert.equal(kept.street, '500 Corrected Avenue');
    assert.equal(await form.locator('input[type="checkbox"]:checked').count(), 5, 'approvals stay checked');
    assert.equal(await form.locator('button[type="submit"]').isEnabled(), true, 'the owner can fix and resubmit');
    const row = await strictRead('messaging_activation', x.operationId); assert.equal(row.state, 'needs_action'); assert.equal(row.submissionRevision, 1); assert.equal(unseal(row).legal.street, '123 Fixture Street');
  });
  await check('Validation: after a server refusal keyboard focus stays in the dialog on a visible control', async () => {
    const focus = await page.evaluate(() => ({ inDialog: document.getElementById('connectionDialog').contains(document.activeElement), tag: document.activeElement?.tagName }));
    report.observations.push({ check: 'focus-after-400', ...focus });
    assert.equal(focus.inDialog, true, 'focus fell to ' + focus.tag + ' after the request disabled the focused submit button (desk-connections.js:318); a keyboard user loses their place');
  }, { expectedChange: '161cf80e (definite 4xx: server message shown with focus kept)' });
  await check('Validation: an unsupported state is refused with the server reason', async () => {
    await setField(form, 'ein', '92-1234567'); await setField(form, 'state', 'ZZ'); await submit(form); await settle(x, 2);
    assert.equal(corrections(x)[1].status, 400);
    await until(async () => /Use a supported US registered business/.test(await dialogMessage(page).innerText()), 'state message');
    assert.equal((await strictRead('messaging_activation', x.operationId)).submissionRevision, 1);
  });
  await check('Editing and submitting sends one correction with the edited, normalized registration and the operation fence', async () => {
    await setField(form, 'state', 'tx'); await setField(form, 'businessIndustry', 'PROFESSIONAL_SERVICES'); await setField(form, 'title', 'Managing member'); await setField(form, 'email', 'Alex.Rep@Example.com');
    await submit(form); await settle(x, 3);
    const sent = corrections(x)[2]; assert.equal(sent.status, 202);
    const body = sent.body; assert.equal(body.operationId, x.operationId); assert.equal(body.expectedSubmissionRevision, 1);
    for (const k of ['acceptedCosts', 'authority', 'attestLegalAccuracy', 'attestConsent', 'testPhoneConsent']) assert.equal(body[k], true, k);
    assert.match(body.submissionId, /^[a-f0-9]{32}$/);
    assert.deepEqual(body.legal, { legalName: 'Fixture Plumbing LLC', ein: '92-1234567', businessType: 'llc', businessIndustry: 'PROFESSIONAL_SERVICES', street: '500 Corrected Avenue', street2: '', city: 'Houston', state: 'TX', zip: '77057', website: 'https://shop.example.com', representative: { firstName: 'Alex', lastName: 'Fixture', email: 'Alex.Rep@Example.com', phone: '+17135550198', title: 'Managing member', jobPosition: 'CEO' } });
    await page.locator('dialog#connectionDialog[open]').waitFor({ state: 'detached' }).catch(() => {}); await until(async () => !(await page.locator('dialog#connectionDialog[open]').count()), 'dialog closed');
    await until(async () => (await page.locator('#serviceConnectionMessage').textContent()) === 'Your change is saved. Its current status is shown above.', 'saved message');
    assert.equal(await page.locator('[data-connection="review_sms"]').count(), 0, 'no further correction offered while queued');
    assert.equal(corrections(x).length, 3);
    submitted = true;
  });
  await check('The server stores the correction sealed and normalized, once, and the private registration read returns it', async () => {
    assert.ok(submitted);
    const row = await strictRead('messaging_activation', x.operationId);
    assert.equal(row.state, 'queued'); assert.equal(row.submissionRevision, 2); assert.equal(row.reasonCode, null); assert.deepEqual(row.issues, []);
    assert.equal(row.history.filter(e => e.type === 'customer_corrected').length, 1); assert.equal(row.history.at(-1).actorEmail, x.c.owner.email);
    const raw = JSON.stringify(row); for (const secret of ['921234567', '500 Corrected Avenue', 'alex.rep@example.com']) assert.equal(raw.includes(secret), false, secret + ' stored in plaintext');
    const legal = unseal(row).legal;
    assert.deepEqual(legal, { businessIndustry: 'PROFESSIONAL_SERVICES', legalName: 'Fixture Plumbing LLC', ein: '921234567', businessType: 'llc', street: '500 Corrected Avenue', street2: '', city: 'Houston', state: 'TX', zip: '77057', website: 'https://shop.example.com', representative: { firstName: 'Alex', lastName: 'Fixture', email: 'alex.rep@example.com', phone: '+17135550198', title: 'Managing member', jobPosition: 'CEO' } });
    const view = await serviceIntakeView(await strictRead('clients', x.slug), {}, { includeSensitive: true });
    assert.equal(view.sms.business.street, '500 Corrected Avenue'); assert.equal(view.sms.business.businessIndustry, 'PROFESSIONAL_SERVICES'); assert.equal(view.sms.representative.title, 'Managing member');
    // dispatchServiceWorker (managed-sms.mjs:23-29) returns false for the non-https fixture origin, so no worker ran.
    assert.deepEqual(report.backgroundRequests || [], []);
  });
}

{
  const x = await correctionFixture(), page = x.page; let form, lost = false;
  await check('Lost response: the owner is told the correction may be saved, not "Failed to fetch"', async () => {
    form = await openCorrection(x); await acceptAll(form); await setField(form, 'street', '700 Lost Response Road');
    x.state.faults.push({ match: item => item.action === 'correct_messaging_activation', kind: 'lost' });
    await submit(form); await until(async () => corrections(x)[0]?.lostAfterEffect === true, 'lost request');
    assert.equal((await strictRead('messaging_activation', x.operationId)).submissionRevision, 2, 'the server committed the correction');
    lost = true;
    // Settled: the dialog message is no longer an in-progress text (base and 161cf80e word these differently).
    await until(async () => { const t = (await dialogMessage(page).innerText().catch(() => '')).trim(); return t && !/^Saving|Checking the latest|…$/.test(t); }, 'settled message', 10000);
    await page.waitForTimeout(300);
    const text = (await dialogMessage(page).innerText()).trim(); report.observations.push({ check: 'lost-wording', shown: text, focus: await active(page) });
    await shot(page, 'lost-response');
    assert.doesNotMatch(text, /Failed to fetch|NetworkError|TypeError/i, 'raw transport error shown: "' + text + '" (desk-connections.js:356 shows error.message)');
    assert.match(text, /could(n’t| not) confirm|may (have been|be) saved|might be saved/i, 'the wording must say the outcome is unknown');
  }, { expectedChange: '161cf80e (UNKNOWN_SAVE wording for unknown outcomes)' });
  await check('Lost response: the edited input and approvals are kept in the open form', async () => {
    assert.ok(lost);
    assert.equal(await page.locator('dialog#connectionDialog[open] #connectionForm').count(), 1);
    assert.equal((await inputs(form)).street, '700 Lost Response Road'); assert.equal(await form.locator('input[type="checkbox"]:checked').count(), 5);
  });
  await check('Lost response: the form holds the submit until the saved status is checked', async () => {
    assert.ok(lost);
    const enabled = await form.locator('button[type="submit"]').isEnabled();
    report.observations.push({ check: 'lost-hold', submitEnabled: enabled, statusCheckOffered: await page.locator('#connectionStatusCheck, #connectionReadbackRetry').count() });
    assert.equal(enabled, false, '"Save corrected details" is re-enabled after an unknown outcome (desk-connections.js:359) and nothing offers a read-only status check, so the natural next step is a second submit');
  }, { expectedChange: '161cf80e (submit held, read-only "Check saved status")' });
  await check('Lost response: a second submit never stores a second correction', async () => {
    assert.ok(lost);
    if (await form.locator('button[type="submit"]').isEnabled()) { await submit(form); await settle(x, 2); }
    const row = await strictRead('messaging_activation', x.operationId);
    assert.equal(row.submissionRevision, 2); assert.equal(row.history.filter(e => e.type === 'customer_corrected').length, 1); assert.equal(unseal(row).legal.street, '700 Lost Response Road');
    if (corrections(x).length > 1) {
      assert.equal(corrections(x)[1].status, 409); assert.equal(corrections(x)[1].response.error, 'registration_changed');
      report.observations.push({ check: 'second-submit', status: corrections(x)[1].status, shown: (await dialogMessage(page).innerText()).trim() });
    }
  });
}

// ---- C1 follow-up cases ----
const summary = page => page.locator('dialog#connectionDialog[open] #smsIssueSummary');
const flaggedFields = form => form.evaluate(node => [...node.querySelectorAll('[aria-invalid="true"]')].map(input => ({ name: input.name, describedBy: input.getAttribute('aria-describedby'), description: (input.getAttribute('aria-describedby') || '').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' ').trim(), described: (input.getAttribute('aria-describedby') || '').split(' ').every(id => { const n = document.getElementById(id); return !!n && n.getClientRects().length > 0; }) })));
const summaryItems = page => summary(page).evaluate(node => [...node.querySelectorAll('li')].map(li => ({ text: li.textContent.trim(), link: li.querySelector('a[data-sms-issue-field]')?.dataset.smsIssueField || null, href: li.querySelector('a')?.getAttribute('href') || null })));
// Keyboard only: from the focused summary, Tab to the link for `name`, press Enter, expect focus on that field.
async function keyboardToField(page, name) {
  await tabTo(page, '#smsIssueSummary a[data-sms-issue-field="' + name + '"]', { max: 20 });
  const before = await page.evaluate(() => location.hash);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const now = await active(page);
  assert.equal(now.name, name, 'Enter on the summary link focuses the ' + name + ' field (focus: ' + JSON.stringify(now) + ')');
  assert.equal(now.invalid, 'true');
  assert.equal(await page.evaluate(() => location.hash), before, 'the link does not change the desk route');
  assert.equal(await page.locator('dialog#connectionDialog[open]').count(), 1);
  const box = await page.locator('dialog#connectionDialog[open] [name="' + name + '"]').boundingBox(), view = page.viewportSize();
  assert.ok(box && box.y >= 0 && box.y + box.height <= view.height, 'the focused field is on screen ' + JSON.stringify(box));
}

for (const width of [390, 1440]) await check(width + ': C1 follow-up: the flagged EIN is marked invalid, described by the carrier reason, and the summary opens focused with the one-correction notice', async () => {
  const x = await correctionFixture(width), form = await openCorrection(x), page = x.page;
  await page.waitForTimeout(150);
  const focus = await active(page); assert.equal(focus.id, 'smsIssueSummary', 'focus on open: ' + JSON.stringify(focus));
  assert.equal(await summary(page).evaluate(n => n.getAttribute('aria-labelledby') && document.getElementById(n.getAttribute('aria-labelledby')).textContent), 'The carrier asked you to correct this detail');
  assert.deepEqual(await summaryItems(page), [{ text: 'EIN: The carrier marked this detail as invalid.', link: 'ein', href: '#smsIssueField-ein' }]);
  const once = await summary(page).innerText();
  assert.match(once, /This is your one allowed correction\./); assert.match(once, /can’t be corrected again here/); assert.doesNotMatch(once, /\$|filing|fee/i, 'no correction price is claimed');
  assert.deepEqual(await flaggedFields(form), [{ name: 'ein', describedBy: 'smsIssue-ein', description: 'Carrier flagged: The carrier marked this detail as invalid.', described: true }]);
  assert.equal(await summary(page).evaluate(n => n.getBoundingClientRect().top < document.querySelector('#connectionForm [name="legalName"]').getBoundingClientRect().top), true, 'summary sits above the fields');
  assert.deepEqual(x.state.requests.filter(r => r.method === 'POST'), []);
  await noHorizontalScroll(page); await shot(page, 'c1-summary-' + width);
  report.observations.push({ check: 'c1-summary-' + width, focus, items: await summaryItems(page) });
});

for (const width of [390, 1440]) await check(width + ': C1 follow-up: keyboard from the summary link moves focus to the flagged field without changing the route', async () => {
  const x = await correctionFixture(width), page = x.page; await openCorrection(x); await page.waitForTimeout(150);
  assert.equal((await active(page)).id, 'smsIssueSummary');
  await keyboardToField(page, 'ein');
  await noHorizontalScroll(page); await shot(page, 'c1-keyboard-' + width);
  assert.deepEqual(x.state.requests.filter(r => r.method === 'POST'), []);
});

for (const width of [390, 1440]) await check(width + ': C1 follow-up: several issues mark each named field once, merge reasons per field, and each summary link reaches its field', async () => {
  const issues = [{ code: 'invalid', field: 'business_registration_number' }, { code: '30794', field: 'ein' }, { code: 'invalid', field: 'first_name' }, { code: 'invalid', field: 'Region' }];
  const x = await correctionFixture(width, issues), form = await openCorrection(x), page = x.page; await page.waitForTimeout(150);
  assert.equal(await page.locator('#smsIssueSummaryTitle').innerText(), 'The carrier asked you to correct these 3 details');
  assert.deepEqual(await summaryItems(page), [
    { text: 'EIN: The carrier marked this detail as invalid. The carrier reported reason code 30794.', link: 'ein', href: '#smsIssueField-ein' },
    { text: 'First name: The carrier marked this detail as invalid.', link: 'firstName', href: '#smsIssueField-firstName' },
    { text: 'State abbreviation: The carrier marked this detail as invalid.', link: 'state', href: '#smsIssueField-state' }]);
  assert.deepEqual((await flaggedFields(form)).map(f => [f.name, f.describedBy, f.described]), [['ein', 'smsIssue-ein', true], ['state', 'smsIssue-state', true], ['firstName', 'smsIssue-firstName', true]]);
  assert.equal(await form.locator('[data-sms-issue]').count(), 3, 'one note per field');
  await keyboardToField(page, 'ein');
  await summary(page).focus(); await keyboardToField(page, 'firstName');
  await summary(page).focus(); await keyboardToField(page, 'state');
  await summary(page).focus(); await noHorizontalScroll(page); await shot(page, 'multiple-' + width);
});

for (const width of [390, 1440]) await check(width + ': C1 follow-up: issue fields that match no form field are listed as reported, with no field guessed', async () => {
  const issues = [{ code: 'invalid', field: 'business_regions_of_operation' }, { code: 'provider_registration_rejected', field: 'business_and_consent' }, { code: 'invalid', field: '' }];
  const x = await correctionFixture(width, issues), form = await openCorrection(x), page = x.page; await page.waitForTimeout(150);
  assert.equal((await active(page)).id, 'smsIssueSummary');
  assert.equal(await page.locator('#smsIssueSummaryTitle').innerText(), 'The carrier asked you to correct these 3 details');
  assert.deepEqual(await summaryItems(page), [
    { text: '“business_regions_of_operation” (not a field on this form): The carrier marked this detail as invalid.', link: null, href: null },
    { text: 'Business details or consent information (no single field named): The carrier rejected the registration without naming a specific detail.', link: null, href: null },
    { text: 'A detail the carrier did not name: The carrier marked this detail as invalid.', link: null, href: null }]);
  assert.match(await summary(page).innerText(), /Items without a link don’t match one field on this form/);
  assert.deepEqual(await flaggedFields(form), [], 'no form field is marked for an unmapped issue');
  assert.equal(await form.locator('[data-sms-issue]').count(), 0);
  await noHorizontalScroll(page); await shot(page, 'unmapped-' + width);
});
// ---- QA notes ----
for (const width of [390, 1440]) await check(width + ': QA 1: an email issue is listed without a link and marks no field, because the filed email may be the platform registration contact', async () => {
  const x = await correctionFixture(width, [{ code: 'invalid', field: 'email' }, { code: 'invalid', field: 'Email' }]), form = await openCorrection(x), page = x.page; await page.waitForTimeout(150);
  assert.equal((await active(page)).id, 'smsIssueSummary');
  assert.deepEqual(await summaryItems(page), [{ text: 'Email (registration contact or your representative’s work email): The carrier marked this detail as invalid.', link: null, href: null }]);
  assert.deepEqual(await flaggedFields(form), [], 'the work email is not marked');
  assert.equal(await form.locator('[name="email"]').getAttribute('aria-invalid'), null);
  await noHorizontalScroll(page); await shot(page, 'qa-email-' + width);
});

for (const width of [390, 1440]) await check(width + ': QA 2: with no correction left the form is read-only, offers no save, names the support contact, and nothing can be submitted', async () => {
  const x = await correctionFixture(width, [{ code: 'invalid', field: 'ein' }], { submissionRevision: 2 }), form = await openCorrection(x), page = x.page; await page.waitForTimeout(150);
  assert.equal((await active(page)).id, 'smsIssueSummary');
  const text = await summary(page).innerText();
  assert.match(text, /The current texting terms allow no further corrections to this registration\./);
  assert.match(text, /can’t be changed or resubmitted here/); assert.doesNotMatch(text, /one allowed correction/);
  assert.equal(await summary(page).locator('a[href="mailto:support@machinesandcloud.com"]').count(), 1);
  assert.deepEqual(await summaryItems(page), [{ text: 'EIN: The carrier marked this detail as invalid.', link: null, href: null }]);
  assert.equal(await form.locator('button[type="submit"]').count(), 0, 'no "Save corrected details"');
  assert.equal(await form.evaluate(n => [...n.querySelectorAll('input:not([type=checkbox])')].every(i => i.readOnly) && [...n.querySelectorAll('select, input[type=checkbox]')].every(i => i.disabled)), true, 'every control is read-only or disabled');
  assert.deepEqual((await flaggedFields(form)).map(f => f.name), ['ein'], 'the flagged detail is still shown');
  await form.locator('[name="ein"]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  assert.equal(await form.evaluate(n => n.requestSubmit ? (n.requestSubmit(), true) : false), true); await page.waitForTimeout(300);
  assert.deepEqual(x.state.requests.filter(r => r.method === 'POST'), [], 'no correction is sent');
  assert.equal(await page.locator('dialog#connectionDialog[open] #connectionBack').isEnabled(), true, 'Back still closes the dialog');
  await noHorizontalScroll(page); await shot(page, 'qa-none-left-' + width);
});

await check('QA 3: built-in property names as issue field or code are shown as reported text, never as native code, and mark no unrelated field', async () => {
  const x = await correctionFixture(1440, [{ code: 'constructor', field: 'constructor' }, { code: 'toString', field: 'ein' }, { code: 'invalid', field: '__proto__' }]), form = await openCorrection(x), page = x.page; await page.waitForTimeout(150);
  const text = await summary(page).innerText();
  assert.doesNotMatch(text, /native code|function|\[object/i, text);
  assert.deepEqual(await summaryItems(page), [
    { text: 'EIN: The carrier reported reason code toString.', link: 'ein', href: '#smsIssueField-ein' },
    { text: '“constructor” (not a field on this form): The carrier reported reason code constructor.', link: null, href: null },
    { text: '“__proto__” (not a field on this form): The carrier marked this detail as invalid.', link: null, href: null }]);
  assert.deepEqual((await flaggedFields(form)).map(f => [f.name, f.description]), [['ein', 'Carrier flagged: The carrier reported reason code toString.']]);
  await shot(page, 'qa-builtin-names');
});
await h.finish();
