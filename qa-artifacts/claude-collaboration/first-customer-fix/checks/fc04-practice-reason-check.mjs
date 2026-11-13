// PRA-FC-04: when a practice reply does not count as a check, the panel names the real reason (here: a refused
// practice booking) instead of blaming business details, and says when an earlier check of the same answers still counts.
import { assert, launch, seed, open, route, shot, check, finish, noHScroll, lib } from './fc-lib.mjs';
const { ndjsonResponse } = await import(lib('netlify/functions/lib/agent.mjs'));
const { ownerTestTool } = await import(lib('netlify/functions/lib/owner-test.mjs'));
await launch();
async function practice(page, text) {
  const before = await page.locator('#testPreview').innerText();
  await page.locator('#chatIn').fill(text); await page.locator('#chatForm button[type="submit"], #chatForm button').first().click();
  await page.waitForFunction(b => { const t = document.getElementById('testPreview').textContent; return t !== b && !/arriving/.test(t) && /created\.|check/.test(t); }, before, { timeout: 20000 });
  await page.waitForTimeout(300); return page.locator('#testPreview').innerText();
}
for (const [width, height] of [[390, 844], [1440, 900]]) {
  const x = await seed();
  const { page, context } = await open(x, { width, height, hash: '#test' });
  await route(page, 'test');
  await check(`refused practice booking names the missing details, not business details @${width}`, async () => {
    const ok = await practice(page, 'Do you service Katy?');
    assert.ok(!/did not count/.test(ok), 'first ordinary practice turn counts: ' + ok);
    const text = await practice(page, 'Please book a visit tomorrow 8 to 12 at 12 Oak St, Katy. My number is 713-555-0142, AC blowing warm air.');
    assert.ok(text.includes('This reply did not count as a check: the practice visit was not saved because the name, phone, address, problem or a listed future arrival window was missing.'), text);
    assert.ok(!/Retry with the current business details/.test(text), text);
    assert.ok(text.includes('Your earlier check of these same answers still counts.'), text);
    await page.locator('#testPreview').scrollIntoViewIfNeeded(); await noHScroll(page); await shot(page, 'fc04-practice-reason', width);
  });
  await context.close();
}
await check('server: refusal kinds are tagged and stripped from the model-facing tool result', async () => {
  const c = { windows: ['8 to 12'], rules: {} };
  assert.equal(ownerTestTool(c, 'book_visit', { customer_name: '', phone: '7135550142', address: '1 Main', issue: 'x', date: 'tomorrow', window: '8 to 12' }).refusal, 'booking_details');
  assert.equal(ownerTestTool(c, 'notify_owner', { reason: 'bogus' }).refusal, 'handoff_reason');
  assert.equal(ownerTestTool(c, 'other', {}).refusal, 'tool_unavailable');
});
await check('stream projection forwards only a fixed reason and a boolean', async () => {
  const read = async test => { const r = ndjsonResponse(async () => ({ reply: 'x', events: [], simulation: true, test })); const lines = (await r.text()).trim().split('\n').map(JSON.parse); return lines.at(-1).test; };
  assert.deepEqual(await read({ proofRecorded: false, notRecordedReason: 'booking_details', earlierCheckCurrent: true, secret: 'no' }), { proofRecorded: false, notRecordedReason: 'booking_details', earlierCheckCurrent: true });
  assert.deepEqual(await read({ proofRecorded: false, notRecordedReason: '<script>', earlierCheckCurrent: 'yes' }), { proofRecorded: false });
  assert.deepEqual(await read({ proofRecorded: true, notRecordedReason: 'booking_details' }), { proofRecorded: true });
});
await finish('fc04-practice-reason');
