// PRA-FC-02: recording "Complete request follow-up" moves a request with a waiting owner alert to Done in one
// step (the server acknowledges that request's alert, as a booking already does), and the dialog says so.
import { assert, launch, seed, open, route, shot, check, finish, noHScroll, store, sha } from './fc-lib.mjs';
await launch();
const openCount = page => page.locator('[data-request-filter="open"]').innerText();
for (const [width, height] of [[390, 844], [1440, 900]]) {
  const x = await seed();
  const lead = await x.lead({ customer_name: 'Jim Test', phone: '+17135550142', issue: 'Please call me back about my AC', reason: 'wants_call', outcome: 'wants_call', wanted: 'Call back today' });
  await store.put('alerts', `${x.slug}/${lead.id}`, { id: lead.id, slug: x.slug, tenantIdentity: x.tenantIdentity, leadId: lead.id, kind: 'wants_call', status: 'waiting', step: 0, deadlineAt: new Date(Date.now() + 3600000).toISOString(), createdAt: lead.createdAt, history: [] });
  const other = await x.lead({ customer_name: 'Ana Other', phone: '+17135550143', issue: 'Other request', reason: 'wants_call', outcome: 'wants_call' });
  await store.put('alerts', `${x.slug}/${other.id}`, { id: other.id, slug: x.slug, tenantIdentity: x.tenantIdentity, leadId: other.id, kind: 'wants_call', status: 'waiting', step: 0, deadlineAt: new Date(Date.now() + 3600000).toISOString(), createdAt: other.createdAt, history: [] });
  const { page, context } = await open(x, { width, height, hash: '#leads' });
  await route(page, 'leads');
  await check(`completing follow-up moves the request to Done without Acknowledge @${width}`, async () => {
    assert.match(await openCount(page), /2/);
    await page.locator('#leads [data-request-open="' + lead.id + '"]').click(); await page.locator('#requestDialog[open], dialog[open] #requestForm').first().waitFor();
    await page.locator('#requestAction').selectOption('complete'); await page.locator('#requestResolution').selectOption('resolved'); await page.locator('#requestNote').fill('Called back, fixed the thermostat setting');
    await page.locator('#requestSave').click();
    await page.waitForFunction(() => /Follow-up complete/.test(document.getElementById('requestMessage').textContent), null, { timeout: 15000 });
    const msg = await page.locator('#requestMessage').innerText();
    assert.ok(msg.includes('This request moved to Done.') && msg.includes('Its alert is acknowledged too.'), msg);
    await noHScroll(page); await shot(page, 'fc02-complete-message', width);
    await page.locator('#requestClose').click(); await page.waitForTimeout(600);
    assert.equal((await store.get('alerts', `${x.slug}/${lead.id}`)).status, 'acked');
    assert.equal((await store.get('alerts', `${x.slug}/${lead.id}`)).ackedBy, 'followthrough_complete');
    assert.equal((await store.get('alerts', `${x.slug}/${other.id}`)).status, 'waiting', 'another request alert is untouched');
    await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); await route(page, 'leads');
    assert.match(await openCount(page), /1/);
    assert.equal(await page.locator('#leads [data-record-id="' + lead.id + '"]').count(), 0, 'not under Open');
    await page.locator('[data-request-filter="done"]').click();
    await page.locator('#leads [data-record-id="' + lead.id + '"]').waitFor();
    assert.equal(await page.locator('#leads [data-record-id="' + lead.id + '"] .ack').count(), 0, 'no Acknowledge step left');
    await shot(page, 'fc02-done-list', width);
  });
  await check(`API: a replayed completion stays acknowledged; other actions do not acknowledge @${width}`, async () => {
    const v = (await x.api('GET', '&requestId=' + other.id)).body.request;
    const seen = await x.api('POST', '', { action: 'request_followthrough', requestId: other.id, sourceRevision: v.sourceRevision, expectedRevision: v.revision, operationId: sha('seen' + width).slice(0, 32), type: 'seen', note: '' });
    assert.equal(seen.status, 200); assert.equal(seen.body.request.alertAcknowledged, undefined);
    assert.equal((await store.get('alerts', `${x.slug}/${other.id}`)).status, 'waiting');
    const v2 = seen.body.request, op = sha('done' + width).slice(0, 32), body = { action: 'request_followthrough', requestId: other.id, sourceRevision: v2.sourceRevision, expectedRevision: v2.revision, operationId: op, type: 'complete', resolution: 'resolved', note: 'Handled' };
    const first = await x.api('POST', '', body); assert.equal(first.status, 200); assert.equal(first.body.request.alertAcknowledged, 1);
    const again = await x.api('POST', '', body); assert.equal(again.status, 200); assert.equal(again.body.request.alertAcknowledged, 0);
    const dto = (await x.api()).body; assert.equal(dto.leads.find(l => l.id === other.id).alertWaiting, false);
  });
  await context.close();
}
await finish('fc02-complete-moves-to-done');
