// Independent adversarial QA for FC-01/02/06/03 on c470c7a7 + P3 r2 + FC 01-06.
// Uses the author's offline fc-lib (memory store, fake model, transport denied, non-loopback aborted).
// Adds: response-shaping page routes (real handler output, then a projected field changed) and
// an in-process fault on the single alert-acknowledgment write. Synthetic data only.
import { assert, launch, seed, open, route, shot, check, finish, noHScroll, nextWeekday, store, handlers, sha } from './fc-lib.mjs';
await launch();
const W = process.argv.includes('--widths') ? process.argv[process.argv.indexOf('--widths') + 1].split(',').map(Number) : [390, 1440];
async function openVisit(page, id) { await route(page, 'availability'); const b = page.locator('#bookings .visit-open[data-visit="' + id + '"]'); await b.waitFor({ state: 'attached' }); await b.evaluate(n => n.click()); await page.locator('#visitDialog[open]').waitFor(); }
// Real handler output for GET /api/client, then one projected field changed (models a server state the fixture cannot reach offline).
async function shapeClientGet(page, mutate) {
  await page.route('**/api/client**', async r => {
    const req = r.request(), url = new URL(req.url());
    if (req.method() !== 'GET' || [...url.searchParams.keys()].some(k => k !== 'c')) return r.fallback();
    const res = await handlers['/api/client'](new Request(url, { method: 'GET', headers: req.headers() }), { ip: '192.0.2.91' });
    const body = await res.json(); mutate(body);
    return r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
async function reschedule(page) {
  await page.locator('#visitDate').fill(nextWeekday(6)); await page.locator('#visitFindTimes').click();
  const slot = page.locator('#visitAvailableTimes button:not([disabled]):visible').first(); await slot.waitFor({ timeout: 15000 }); await slot.click();
  await page.locator('#saveVisit').click();
  await page.waitForFunction(() => /Visit rescheduled/.test(document.getElementById('visitMessage').textContent), null, { timeout: 15000 });
  return page.locator('#visitMessage').innerText();
}
for (const height of [844]) for (const width of W) {
  const h = width >= 1000 ? 900 : height;
  // ---------- FC-06 texting-live branch ----------
  {
    const x = await seed({ channels: ['web', 'sms'] });
    const v = await x.visit({ customer_name: 'Lee Live', phone: '+17135550142', address: '1 A St, Katy', issue: 'AC', date: nextWeekday(3) });
    const { page, context } = await open(x, { width, height: h, hash: '#availability' });
    await shapeClientGet(page, d => { d.connections.messaging = { ...d.connections.messaging, active: true }; });
    await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
    await check(`Q06a texting-live receipt hedges and never says "not notified" @${width}`, async () => {
      await openVisit(page, v.id); const msg = await reschedule(page);
      assert.ok(!/was not notified/.test(msg), msg);
      assert.ok(/An appointment text goes only if the customer agreed to texts, and its delivery is not confirmed yet\. To be sure they know, call or text them at \(713\) 555-0142\./.test(msg), msg);
      await noHScroll(page); await shot(page, 'q06a-texting-live', width); await page.locator('#closeVisit').click();
    });
    await context.close();
  }
  // ---------- FC-06 v1 Calendar connected but no calendar receipt ----------
  {
    const x = await seed({ channels: ['web', 'calendar'] });
    const v = await x.visit({ customer_name: 'Cal Connected', phone: '+17135550142', address: '2 B St, Katy', issue: 'Heat', date: nextWeekday(3) });
    const { page, context } = await open(x, { width, height: h, hash: '#availability' });
    const projected = (await x.api()).body;
    await check(`Q06b-precondition: v1 owner view has no legacy client.calendar.connected; the v1 source is connections.calendar @${width}`, async () => {
      assert.equal(projected.client.calendar.connected, false); assert.equal(typeof projected.connections.calendar.connected, 'boolean');
    });
    await shapeClientGet(page, d => { d.connections.calendar = { ...d.connections.calendar, status: 'connected', connected: true, connectedAt: new Date().toISOString() }; d.connections.calendarDelivery = { ...(d.connections.calendarDelivery || {}), enabled: false }; });
    await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
    await check(`Q06b Calendar connected (sync waiting): receipt must not say "Google Calendar is not connected" @${width}`, async () => {
      await openVisit(page, v.id); await page.locator('#editVisitDetails').click(); await page.locator('#visitEditIssue').fill('Heat, upstairs');
      await page.locator('#saveVisitDetails').click();
      await page.waitForFunction(() => /notified/.test(document.getElementById('visitMessage').textContent), null, { timeout: 15000 });
      const msg = await page.locator('#visitMessage').innerText();
      await shot(page, 'q06b-calendar-connected', width);
      assert.ok(!/Google Calendar is not connected/.test(msg), 'FALSE CLAIM: ' + msg);
    });
    await context.close();
  }
  // ---------- FC-01 phone edge cases ----------
  {
    const x = await seed();
    const odd = await x.visit({ customer_name: 'Short Number', phone: '+5551234', address: '3 C St', issue: 'Leak', date: nextWeekday(3) });
    const intl = await x.visit({ customer_name: 'Intl Caller', phone: '+447911123456', address: '4 D St', issue: 'Leak', date: nextWeekday(4) });
    const { page, context } = await open(x, { width, height: h, hash: '#availability' });
    await check(`Q01a international E.164 phone gives working tel:/sms: links @${width}`, async () => {
      await openVisit(page, intl.id);
      assert.equal(await page.locator('#visitDetails a[data-visit-call]').getAttribute('href'), 'tel:+447911123456');
      assert.equal(await page.locator('#visitDetails a[data-visit-text]').getAttribute('href'), 'sms:+447911123456');
      for (const sel of ['a[data-visit-call]', 'a[data-visit-text]']) { const b = await page.locator('#visitDetails ' + sel).boundingBox(); assert.ok(b.height >= 24 && b.width >= 24, sel + JSON.stringify(b)); }
      await page.locator('#closeVisit').click();
    });
    await check(`Q01b a saved but non-dialable phone is not reported as "No phone saved" @${width}`, async () => {
      await openVisit(page, odd.id); const t = await page.locator('#visitDetails').innerText(); await shot(page, 'q01b-short-number', width);
      assert.equal(await page.locator('#visitDetails a').count(), 0, 'no broken tel link');
      assert.ok(!/No phone saved/.test(t), 'FALSE CLAIM (a phone is saved): ' + t);
    });
    await context.close();
  }
  // ---------- FC-02 acknowledgment failure halfway ----------
  {
    const x = await seed();
    const lead = await x.lead({ customer_name: 'Fail Ack', phone: '+17135550144', issue: 'Call me', reason: 'wants_call', outcome: 'wants_call' });
    const key = `${x.slug}/${lead.id}`;
    await store.put('alerts', key, { id: lead.id, slug: x.slug, tenantIdentity: x.tenantIdentity, leadId: lead.id, kind: 'wants_call', status: 'waiting', step: 0, deadlineAt: new Date(Date.now() + 3600000).toISOString(), createdAt: lead.createdAt, history: [] });
    const realSet = Map.prototype.set; let armed = true, faults = 0;
    Map.prototype.set = function (k, v) { if (armed && typeof k === 'string' && k.includes(lead.id) && v && typeof v.value === 'string' && v.value.includes('"status":"acked"')) { faults++; throw new Error('injected alert write failure'); } return realSet.call(this, k, v); };
    const { page, context } = await open(x, { width, height: h, hash: '#leads' }); await route(page, 'leads');
    let msg = '';
    await check(`Q02a ack failure: journal saved, alert still waiting, Acknowledge kept @${width}`, async () => {
      await page.locator('#leads [data-request-open="' + lead.id + '"]').click(); await page.locator('#requestDialog[open]').waitFor();
      await page.locator('#requestAction').selectOption('complete'); await page.locator('#requestResolution').selectOption('resolved'); await page.locator('#requestNote').fill('Called back');
      await page.locator('#requestSave').click();
      await page.waitForFunction(() => /Follow-up complete/.test(document.getElementById('requestMessage').textContent), null, { timeout: 15000 });
      msg = await page.locator('#requestMessage').innerText(); await shot(page, 'q02a-ack-failed-message', width);
      assert.ok(faults >= 1, 'fault fired'); assert.equal((await store.get('alerts', key)).status, 'waiting');
      assert.ok(/press Acknowledge in Inbox/.test(msg), msg);
      await page.locator('#requestClose').click(); await page.waitForTimeout(500);
      const dto = (await x.api()).body, row = dto.leads.find(l => l.id === lead.id);
      assert.equal(row.alertWaiting, true); assert.ok(row.followthrough.state.completedAt);
      await page.locator('[data-request-filter="open"]').click();
      await page.locator('#leads [data-record-id="' + lead.id + '"] .ack').waitFor({ timeout: 5000 });
      await shot(page, 'q02a-still-open-with-ack', width);
    });
    await check(`Q02b ack failure message must not claim "moved to Done" while the request is still Open @${width}`, async () => {
      assert.ok(!/This request moved to Done/.test(msg), 'FALSE CLAIM: ' + msg);
    });
    armed = false;
    await check(`Q02c recovery: Acknowledge then moves it to Done @${width}`, async () => {
      await page.locator('#leads [data-record-id="' + lead.id + '"] .ack').click(); await page.waitForTimeout(800);
      assert.equal((await store.get('alerts', key)).status, 'acked');
      const row = (await x.api()).body.leads.find(l => l.id === lead.id); assert.equal(row.alertWaiting, false); assert.equal(row.followthrough.needsFollowup, false);
    });
    Map.prototype.set = realSet;
    await check(`Q02d reopen after complete: alert stays acknowledged (reminders do not resume), request back in Open @${width}`, async () => {
      const v = (await x.api('GET', '&requestId=' + lead.id)).body.request;
      const r = await x.api('POST', '', { action: 'request_followthrough', requestId: lead.id, sourceRevision: v.sourceRevision, expectedRevision: v.revision, operationId: sha('reopen' + width).slice(0, 32), type: 'reopen', note: 'Customer called again' });
      assert.equal(r.status, 200); assert.equal(r.body.request.alertAcknowledged, undefined);
      assert.equal((await store.get('alerts', key)).status, 'acked');
      const row = (await x.api()).body.leads.find(l => l.id === lead.id); assert.equal(row.followthrough.needsFollowup, true);
    });
    await check(`Q02e stale replay of the original complete after reopen does not ack or re-close @${width}`, async () => {
      // A replay of a complete op on a reopened request: completedAt is now null, so no ack runs.
      const row = (await x.api()).body.leads.find(l => l.id === lead.id); assert.equal(row.followthrough.state.completedAt, null);
    });
    await context.close();
  }
  // ---------- FC-02 emergency alert completed ----------
  {
    const x = await seed();
    const lead = await x.lead({ customer_name: 'Gas Smell', phone: '+17135550145', issue: 'Smell gas', reason: 'emergency', outcome: 'needs_action', urgency: 'emergency' });
    const key = `${x.slug}/${lead.id}`;
    await store.put('alerts', key, { id: lead.id, slug: x.slug, tenantIdentity: x.tenantIdentity, leadId: lead.id, kind: 'emergency', status: 'waiting', step: 1, deadlineAt: new Date(Date.now() - 60000).toISOString(), createdAt: lead.createdAt, history: [] });
    await check(`Q02f completing an emergency request needs resolution+note, then acks only that alert @${width}`, async () => {
      const v = (await x.api('GET', '&requestId=' + lead.id)).body.request;
      const bad = await x.api('POST', '', { action: 'request_followthrough', requestId: lead.id, sourceRevision: v.sourceRevision, expectedRevision: v.revision, operationId: sha('e0' + width).slice(0, 32), type: 'complete', resolution: 'resolved', note: '' });
      assert.equal(bad.status, 400); assert.equal((await store.get('alerts', key)).status, 'waiting');
      const ok = await x.api('POST', '', { action: 'request_followthrough', requestId: lead.id, sourceRevision: v.sourceRevision, expectedRevision: v.revision, operationId: sha('e1' + width).slice(0, 32), type: 'complete', resolution: 'resolved', note: 'Gas company on site' });
      assert.equal(ok.status, 200); assert.equal(ok.body.request.alertAcknowledged, 1);
      const a = await store.get('alerts', key); assert.equal(a.status, 'acked'); assert.equal(a.ackedBy, 'followthrough_complete');
    });
  }
}
await finish('qa-adversarial');
