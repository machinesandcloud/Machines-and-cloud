// Coverage lost in suite-refresh-2 (REFRESH-2.md, "Coverage the refresh does not keep", item 2): with incomplete saved
// texting details, the approval button must open the texting details wizard instead of the approval form
// (desk-connections.js:397-398). The wizard is then completed and the owner continues to the approval form.
// Required fields from e1bc00df: business type, industry and position are required <select>s with an empty "Choose…"
// default, and state no longer defaults to TX.
//
// Real path in the desk at dfb0ae78: Connections > Phone answering (its call routing is complete) > Continue setup >
// "Review available connections" (#setupGuideContinue). desk-setup-guide.js:345-361 executeAction clicks the shared
// [data-connection=review_setup] button, and desk-connections.js:397 routes to the texting wizard because the selected
// plan includes sms and serviceIntake.sms.complete is false. The texting card's own "Continue" opens the wizard
// directly (needsServiceInformation, desk-setup-guide.js:99), so it does not reach line 397.
//
// Keyboard only: Tab / Shift+Tab, Enter, typing. No mouse clicks.
// Run from the worktree root:
//   env -i HOME="$HOME" PATH="$PATH" node qa-artifacts/claude-collaboration/sms-correction-followup/sms-wizard-routing-ui-check.mjs --output scratchpad/claude-smsfix-<name>.json
import assert from 'node:assert/strict';
const { harness } = await import('./sms-harness.mjs');
const h = await harness({
  name: 'smsfix-wizard',
  watched: ['desk.html', 'desk.js', 'desk-connections.js', 'desk-service-intake.js', 'desk-setup-guide.js', 'netlify/functions/client.mjs', 'netlify/functions/lib/service-intake.mjs', 'netlify/functions/lib/messaging-activation.mjs', 'qa-artifacts/claude-collaboration/sms-correction-followup/sms-wizard-routing-ui-check.mjs'],
  qualifications: 'Reviewed and practised self-service workspace that selected phone answering and texting; voice routing complete (use_new_number, forwarding none), texting details empty. Actual /api/client handler, memory store, fake model, synthetic open gates, no provider transport. Keyboard-only navigation.',
});
const { store, fixture, check, shot, noHorizontalScroll, until, tabTo, active, report, lib } = h;
const { serviceIntakeView } = await import(lib('netlify/functions/lib/service-intake.mjs'));
const { strictRead } = await import(lib('netlify/functions/lib/accounts.mjs'));

const posts = x => x.state.requests.filter(r => r.method === 'POST');
const value = (page, name) => page.locator('#serviceIntakeForm [name="' + name + '"]').inputValue();
const fieldState = (page, name) => page.evaluate(name => { const input = document.querySelector('#serviceIntakeForm [name="' + name + '"]'), error = document.getElementById('intake-' + name + '-error'); return { invalid: input.getAttribute('aria-invalid'), describedBy: input.getAttribute('aria-describedby'), required: input.required, error: error ? error.textContent : null, value: input.value }; }, name);
async function typeField(page, name, text) { await tabTo(page, '#serviceIntakeForm [name="' + name + '"]'); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace'); if (text) await page.keyboard.type(text); }
async function chooseOption(page, name, label, expected) { await tabTo(page, '#serviceIntakeForm [name="' + name + '"]'); await page.keyboard.type(label); assert.equal(await value(page, name), expected, 'keyboard selection of ' + name); }
async function continueStep(page) { await tabTo(page, '#intakeContinue'); await page.keyboard.press('Enter'); }
const savedStep = async (x, count) => until(async () => posts(x).length >= count && !(await x.page.locator('#serviceIntakeForm[aria-busy="true"]').count()), 'save ' + count);

for (const width of [390, 1440]) {
  const label = width + ': ';
  // The scenario is one owner session; later checks continue from the earlier ones in the same page.
  const x = await fixture({ width, configure: c => { c.phone.forwarding = 'none'; } });
  const { page } = x;
  let routed = false, identity = false, address = false;

  await check(label + 'With incomplete texting details, the approval button opens the texting details wizard, not the approval form', async () => {
    const before = await serviceIntakeView(await strictRead('clients', x.slug), {}, { includeSensitive: true });
    assert.equal(before.sms.complete, false); assert.equal(before.voice.complete, true); assert.equal(before.voice.canApply, false);
    await tabTo(page, 'button[data-guide-service="voice"]'); await page.keyboard.press('Enter');
    await page.locator('#connectorStart').waitFor(); await tabTo(page, '#connectorStart'); await page.keyboard.press('Enter');
    await page.locator('#setupGuideContinue').waitFor();
    assert.match(await page.locator('#setupGuideContinue').innerText(), /Review available connections/);
    assert.equal(await page.locator('[data-connection="review_setup"]').count(), 1, 'the shared approval action exists');
    await page.evaluate(() => { window.__smsregEvents = []; document.addEventListener('mc:service-intake-open', e => window.__smsregEvents.push(e.detail.service)); document.addEventListener('click', e => { const t = e.target.closest('[data-connection]'); if (t) window.__smsregEvents.push('click:' + t.dataset.connection); }, true); });
    await tabTo(page, '#setupGuideContinue'); await page.keyboard.press('Enter');
    await page.locator('#serviceIntakeWorkbench #serviceIntakeForm').waitFor();
    // executeAction clicked the shared review_setup control, and desk-connections.js:397 dispatched the texting wizard.
    assert.deepEqual(await page.evaluate(() => window.__smsregEvents), ['click:review_setup', 'sms']);
    await until(async () => (await active(page))?.id === 'intakeStepTitle', 'focus on the wizard step title');
    assert.equal(await page.evaluate(() => location.hash), '#setup/sms/details-0');
    assert.equal(await page.locator('#serviceIntakeWorkbench').getAttribute('aria-label'), 'Two-way texting setup');
    assert.equal(await page.locator('#intakeStepTitle').innerText(), 'Your registered business.');
    assert.equal(await page.locator('dialog#connectionDialog[open]').count(), 0, 'approval dialog must not open');
    assert.equal(await page.locator('#connectionForm').count(), 0, 'approval form must not render');
    assert.equal(await page.locator('[name="costs"], [name="authority"]').count(), 0, 'no approval checkbox is offered');
    assert.deepEqual(posts(x), [], 'routing sends no POST');
    await noHorizontalScroll(page); await shot(page, 'routed-' + width);
    routed = true;
  });

  await check(label + 'Business identity step: type and industry are required selects with an empty default; errors are tied to each field and focus moves to the first', async () => {
    assert.ok(routed, 'depends on the routing check');
    for (const name of ['businessType', 'businessIndustry']) { const s = await fieldState(page, name); assert.equal(s.required, true, name + ' required'); assert.equal(s.value, '', name + ' starts empty'); assert.equal(await page.locator('#intake-' + name + ' option').first().innerText(), 'Choose…'); }
    assert.equal(await value(page, 'legalName'), 'Fixture Plumbing'); assert.equal(await value(page, 'ein'), '');
    await typeField(page, 'legalName', 'Fixture Plumbing LLC'); await typeField(page, 'ein', '92-1234567');
    await continueStep(page);
    await until(async () => (await fieldState(page, 'businessType')).invalid === 'true', 'business type error');
    assert.deepEqual(posts(x), [], 'client validation sends no save');
    for (const name of ['businessType', 'businessIndustry']) { const s = await fieldState(page, name); assert.equal(s.invalid, 'true', name); assert.equal(s.describedBy, 'intake-' + name + '-error'); assert.ok(s.error && s.error.length > 3, name + ' error text: ' + s.error); }
    for (const name of ['legalName', 'ein']) assert.equal((await fieldState(page, name)).invalid, null, name + ' valid');
    const focus = await active(page); assert.equal(focus.id, 'intake-businessType', 'focus moves to the first invalid field'); assert.equal(focus.describedBy, 'intake-businessType-error');
    report.observations.push({ width, step: 'identity', errors: { businessType: (await fieldState(page, 'businessType')).error, businessIndustry: (await fieldState(page, 'businessIndustry')).error } });
    await chooseOption(page, 'businessType', 'LLC', 'llc');
    assert.equal((await fieldState(page, 'businessType')).invalid, null, 'choosing clears the error'); assert.equal((await fieldState(page, 'businessType')).error, '');
    await chooseOption(page, 'businessIndustry', 'Construction', 'CONSTRUCTION');
    await continueStep(page); await savedStep(x, 1);
    const save = posts(x)[0]; assert.equal(save.action, 'save_service_intake'); assert.equal(save.status, 200); assert.equal(save.body.section, 'business'); assert.deepEqual(save.body.fields, { legalName: 'Fixture Plumbing LLC', ein: '92-1234567', businessType: 'llc', businessIndustry: 'CONSTRUCTION' });
    await until(async () => (await page.locator('#intakeStepTitle').innerText()) === 'Your registered business address.', 'address step');
    assert.equal((await active(page)).id, 'intakeStepTitle'); assert.equal(await page.locator('#intakeStatus').innerText(), 'Details saved securely.'); assert.equal(await page.locator('#intakeStatus').getAttribute('role'), 'status');
    identity = true;
  });

  await check(label + 'Address step: state is required with no TX default; an invalid state is refused by the server with a field error and focus', async () => {
    assert.ok(identity, 'depends on the identity step');
    const s = await fieldState(page, 'state'); assert.equal(s.value, '', 'state is not prefilled (e1bc00df removed the TX default)'); assert.equal(s.required, true);
    // service-intake.mjs defaults(): city, state and business type stay blank until a legal address was confirmed.
    assert.equal(await value(page, 'city'), ''); assert.equal(await value(page, 'website'), 'https://shop.example.com');
    await typeField(page, 'street', '123 Fixture Street'); await typeField(page, 'city', 'Houston'); await typeField(page, 'zip', '77057');
    await continueStep(page);
    await until(async () => (await fieldState(page, 'state')).invalid === 'true', 'state error');
    assert.equal(posts(x).length, 1, 'a missing state sends no save'); assert.equal((await active(page)).id, 'intake-state'); assert.ok((await fieldState(page, 'state')).error.length > 3);
    await typeField(page, 'state', 'ZZ'); await continueStep(page); await savedStep(x, 2);
    const refused = posts(x)[1]; assert.equal(refused.status, 422); assert.equal(refused.response.fieldErrors['sms.business.state'], 'Enter the two-letter state abbreviation.');
    await until(async () => (await fieldState(page, 'state')).error === 'Enter the two-letter state abbreviation.', 'server field error shown');
    assert.equal((await fieldState(page, 'state')).invalid, 'true'); assert.equal((await active(page)).id, 'intake-state', 'focus moves to the refused field');
    assert.equal(await page.locator('#intakeStatus').getAttribute('data-error'), 'true'); assert.match(await page.locator('#intakeStatus').innerText(), /Check the highlighted/);
    assert.equal(await page.locator('#intakeStepTitle').innerText(), 'Your registered business address.', 'the step is kept');
    assert.equal(await value(page, 'street'), '123 Fixture Street', 'entries are kept');
    await typeField(page, 'state', 'tx'); await continueStep(page); await savedStep(x, 3);
    assert.equal(posts(x)[2].status, 200);
    await until(async () => (await page.locator('#intakeStepTitle').innerText()) === 'Who can represent this business?', 'representative step');
    address = true;
  });

  await check(label + 'Representative step: position is required; completing it continues to the approval form showing the saved details, nothing approved', async () => {
    assert.ok(address, 'depends on the address step');
    const s = await fieldState(page, 'jobPosition'); assert.equal(s.required, true); assert.equal(s.value, '');
    assert.equal(await value(page, 'firstName'), 'Alex'); assert.equal(await value(page, 'lastName'), 'Fixture'); assert.equal(await value(page, 'email'), x.c.owner.email); assert.equal(await value(page, 'phone'), '+17135550198');
    await typeField(page, 'title', 'Owner'); await continueStep(page);
    await until(async () => (await fieldState(page, 'jobPosition')).invalid === 'true', 'position error');
    assert.equal(posts(x).length, 3, 'a missing position sends no save'); assert.equal((await active(page)).id, 'intake-jobPosition');
    await chooseOption(page, 'jobPosition', 'Owner', 'CEO');
    await continueStep(page); await savedStep(x, 4);
    assert.equal(posts(x)[3].status, 200); assert.equal(posts(x)[3].body.section, 'representative');
    const form = page.locator('dialog#connectionDialog[open] #connectionForm'); await form.waitFor();
    assert.equal(await page.locator('#connectionTitle').innerText(), 'Review your front desk connections');
    const text = await form.innerText();
    assert.match(text, /Fixture Plumbing LLC · EIN ending 4567/); assert.match(text, /Industry: construction/); assert.match(text, /123 Fixture Street, Houston, TX, 77057/); assert.match(text, new RegExp('Alex Fixture · ' + x.c.owner.email.replace(/[.]/g, '\\.')));
    assert.equal(await form.locator('[name="ein"], [name="legalName"]').count(), 0, 'complete details are reviewed read-only');
    assert.equal(await form.locator('input[type="checkbox"][required]').count(), 5); assert.equal(await form.locator('input[type="checkbox"]:checked').count(), 0);
    assert.equal(await page.evaluate(() => document.getElementById('connectionDialog').contains(document.activeElement)), true, 'focus is inside the approval dialog');
    assert.equal(posts(x).filter(r => r.action === 'request_service_onboarding').length, 0, 'continuing never approves');
    await noHorizontalScroll(page); await shot(page, 'approval-' + width);
  });

  await check(label + 'Server stored the wizard entries normalized and created no paid setup', async () => {
    const c = await strictRead('clients', x.slug), view = await serviceIntakeView(c, {}, { includeSensitive: true });
    assert.equal(view.sms.complete, true); assert.deepEqual(view.sms.missingFields, []);
    assert.deepEqual(view.sms.business, { legalName: 'Fixture Plumbing LLC', ein: '921234567', businessType: 'llc', businessIndustry: 'CONSTRUCTION', street: '123 Fixture Street', street2: '', city: 'Houston', state: 'TX', zip: '77057', website: 'https://shop.example.com/' });
    assert.deepEqual(view.sms.representative, { firstName: 'Alex', lastName: 'Fixture', email: x.c.owner.email, phone: '+17135550198', title: 'Owner', jobPosition: 'CEO' });
    assert.ok(!JSON.stringify(c.management.serviceIntake).includes('921234567'), 'the saved draft is sealed');
    for (const kind of ['service_onboarding_intents', 'messaging_activation', 'phone_activation_intents']) assert.deepEqual(await store.list(kind, x.slug + '/'), [], kind + ' stays empty');
    assert.deepEqual(c.onboarding.desiredChannels, ['voice', 'sms']);
  });
}
await h.finish();
