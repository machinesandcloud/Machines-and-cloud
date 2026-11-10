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
const { harness, ACCOUNT_SID } = await import('../sms-correction-followup/sms-harness.mjs');
const h = await harness({
  name: 'smsfix-correct',
  watched: ['desk.html', 'desk.js', 'desk-connections.js', 'desk-service-intake.js', 'desk-setup-guide.js', 'netlify/functions/client.mjs', 'netlify/functions/lib/service-intake.mjs', 'netlify/functions/lib/messaging-activation.mjs', 'netlify/functions/lib/connection-journey.mjs', 'qa-artifacts/claude-collaboration/root-lead-connection-review-20261110-resume/sms-evidence-probe.mjs'],
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


for (const width of [390,1440]) await check('root SMS correction from another tab cannot confirm the failed submission '+width,async()=>{
 const x=await correctionFixture(width),form=await openCorrection(x),page=x.page;
 await setField(form,'street','700 Intended Change Road');await acceptAll(form);
 x.state.faults.push({match:item=>item.action==='correct_messaging_activation',kind:'abort-before'});
 await submit(form);await until(async()=>corrections(x)[0]?.status==='aborted','owner POST stopped before handler');
 await page.locator('#connectionStatusCheck').waitFor();
 const attempted=corrections(x)[0].body,current=await strictRead('clients',x.slug);
 const otherBody={...attempted,submissionId:'e'.repeat(32),actor:{role:'owner',email:current.owner.email},legal:{...attempted.legal,street:'900 Other Tab Avenue'}};
 await sms.correctMessagingActivation(current,otherBody);
 const beforeRead=x.state.requests.length;await page.locator('#connectionStatusCheck').click();
 await until(async()=>!(await page.locator('#connectionStatusCheck').count()),'status settled');
 const status=await page.locator('#serviceConnectionMessage').textContent();
 const row=await strictRead('messaging_activation',x.operationId);
 report.observations.push({case:'other SMS correction '+width,status,storedStreet:unseal(row).legal.street,intendedStreet:attempted.legal.street,ownerPost:'aborted-before-handler',submissionRevision:row.submissionRevision});
 assert.equal(row.submissionRevision,2);assert.equal(unseal(row).legal.street,'900 Other Tab Avenue');
 assert.ok(x.state.requests.slice(beforeRead).every(r=>r.method==='GET'),'read-only reconciliation');assert.equal(corrections(x).length,1,'no automatic duplicate POST');
 await shot(page,'root-other-correction-'+width);
 assert.doesNotMatch(status,/Your change is saved/,'another submission must not confirm this one');
 assert.match(status,/couldn.t confirm/);assert.equal(await form.locator('[name=street]').inputValue(),'700 Intended Change Road','keep intended draft');
});
for(const width of [390,1440]) await check('root SMS needs_action without issues still opens a usable correction form '+width,async()=>{
 const x=await correctionFixture(width,[]),form=await openCorrection(x),page=x.page;
 assert.equal(await form.locator('[aria-invalid=true]').count(),0);
 assert.equal(await form.locator('[name=ein]').isEditable(),true);
 assert.equal(await form.locator('button[type=submit]').isVisible(),true);
 assert.equal(corrections(x).length,0);
 await shot(page,'root-no-issues-'+width);
});

// External-I/O stub for the actual handler's local background dispatch only. The inherited fixture denies every
// other transport; no worker/provider is executed and the dispatch response does not establish provider delivery.
const inheritedFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{const u=new URL(String(input));if(u.origin===h.origin&&u.pathname==='/api/voice-activation-background'&&init.method==='POST'){(report.backgroundRequests||=[]).push({path:u.pathname,method:init.method});return new Response(null,{status:202});}return inheritedFetch(input,init);};
const voiceEngine=await import(lib('netlify/functions/lib/voice-activation.mjs'));
for(const width of [390,1440]) for(const lose of [false,true]) await check('root actual voice request '+(lose?'lost reply remains unknown':'acknowledgment confirms saved')+' '+width,async()=>{
 const x=await correctionFixture(width),page=x.page;
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:connection-action',{detail:{action:'review_voice'}})));
 const form=page.locator('dialog#connectionDialog[open] #connectionForm');await form.waitFor();
 await form.locator('input[name=authority]').check();
 if(lose)x.state.faults.push({match:item=>item.action==='request_voice_activation',kind:'lost'});
 await form.locator('button[type=submit]').click();
 await until(async()=>x.state.requests.some(r=>r.action==='request_voice_activation'&&typeof r.status==='number'),'actual voice handler');
 const sent=x.state.requests.find(r=>r.action==='request_voice_activation');assert.equal(sent.status,202);
 const status=await voiceEngine.voiceActivationStatus(await strictRead('clients',x.slug));assert.ok(status.operation?.id);assert.equal(status.operation.forwardingMode,'use_new_number');
 if(lose){
  await page.locator('#connectionStatusCheck').waitFor();const n=x.state.requests.length;await page.locator('#connectionStatusCheck').click();
  await until(async()=>!(await page.locator('#connectionStatusCheck').count()),'voice read completed');
  const shown=await page.locator('#serviceConnectionMessage').textContent();assert.doesNotMatch(shown,/Your change is saved/);assert.match(shown,/couldn.t confirm/);
  assert.ok(x.state.requests.slice(n).every(r=>r.method==='GET'));assert.equal(await form.locator('input[name=authority]').isChecked(),true);
 } else {
  await until(async()=>/Your change is saved/.test(await page.locator('#serviceConnectionMessage').textContent()),'positive voice acknowledgment');
  assert.equal(await page.locator('dialog#connectionDialog[open]').count(),0);
 }
 assert.equal(x.state.requests.filter(r=>r.action==='request_voice_activation').length,1);await shot(page,'root-voice-'+(lose?'lost':'ack')+'-'+width);
});

await h.finish();
