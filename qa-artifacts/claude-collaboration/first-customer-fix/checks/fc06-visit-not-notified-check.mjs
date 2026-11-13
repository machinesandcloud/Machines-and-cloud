// PRA-FC-06: after moving, editing or cancelling a visit with no live texting, the receipt says plainly
// "The customer was not notified. Call or text them at <phone>." and the Calendar line says Calendar is
// not connected instead of "not confirmed".
import { assert, launch, seed, open, route, shot, check, finish, noHScroll, nextWeekday } from './fc-lib.mjs';
await launch();
async function openVisit(page, id) { await route(page, 'availability'); const b = page.locator('#bookings .visit-open[data-visit="' + id + '"]'); await b.waitFor({ state: 'attached' }); await b.evaluate(n => n.click()); await page.locator('#visitDialog[open]').waitFor(); }
const NOT_TOLD = 'The customer was not notified. Call or text them at (713) 555-0142.';
for (const [width, height] of [[390, 844], [1440, 900]]) {
  const x = await seed({ channels: ['web', 'sms'] }), y = await seed({ channels: ['web', 'calendar'] });
  const v = await x.visit({ customer_name: 'Jim Homeowner', phone: '+17135550142', address: '12 Oak St, Katy, TX 77494', issue: 'AC blowing warm air', date: nextWeekday(3) });
  const { page, context } = await open(x, { width, height, hash: '#availability' });
  await check(`reschedule receipt says the customer was not notified, with the phone @${width}`, async () => {
    await openVisit(page, v.id);
    await page.locator('#visitDate').fill(nextWeekday(5)); await page.locator('#visitFindTimes').click();
    const slot = page.locator('#visitAvailableTimes button:not([disabled]):visible').first(); await slot.waitFor({ timeout: 15000 }).catch(async e => { throw new Error('no available time: ' + await page.locator('#visitAvailabilityStatus').innerText()); }); await slot.click();
    await page.locator('#saveVisit').click();
    await page.waitForFunction(() => /Visit rescheduled/.test(document.getElementById('visitMessage').textContent), null, { timeout: 15000 });
    const msg = await page.locator('#visitMessage').innerText();
    assert.ok(msg.includes(NOT_TOLD), msg);
    assert.ok(!/Customer notification delivery is not confirmed/.test(msg), msg);
    assert.ok(!/Calendar/.test(msg), 'no Calendar line when Calendar was not chosen: ' + msg);
    await noHScroll(page); await shot(page, 'fc06-reschedule-receipt', width); await page.locator('#closeVisit').click();
  });
  await check(`edit-details receipt says the same @${width}`, async () => {
    await openVisit(page, v.id); await page.locator('#editVisitDetails').click(); await page.locator('#visitEditIssue').fill('AC blowing warm air, upstairs unit');
    await page.locator('#saveVisitDetails').click();
    await page.waitForFunction(() => /notified/.test(document.getElementById('visitMessage').textContent), null, { timeout: 15000 });
    const msg = await page.locator('#visitMessage').innerText();
    assert.ok(msg.includes(NOT_TOLD), msg); assert.ok(!/Customer notification delivery is not confirmed/.test(msg), msg);
    await shot(page, 'fc06-edit-receipt', width); await page.locator('#closeVisit').click();
  });
  await check(`cancel receipt says the same @${width}`, async () => {
    await openVisit(page, v.id); await page.locator('#visitCancelConfirm').check(); await page.locator('#cancelVisit').click();
    await page.waitForFunction(() => /Visit cancelled/.test(document.getElementById('visitMessage').textContent), null, { timeout: 15000 });
    const msg = await page.locator('#visitMessage').innerText(); assert.ok(msg.includes(NOT_TOLD), msg);
    await page.locator('#closeVisit').click();
  });
  await context.close();
  const w = await y.visit({ customer_name: 'Rosa Calendar', phone: '+17135550142', address: '5 Pine St, Katy', issue: 'Furnace noise', date: nextWeekday(3) });
  const second = await open(y, { width, height, hash: '#availability' });
  await check(`with Calendar chosen but not connected, the receipt says so instead of "not confirmed" @${width}`, async () => {
    const p = second.page; await openVisit(p, w.id);
    await p.locator('#editVisitDetails').click(); await p.locator('#visitEditIssue').fill('Furnace noise at startup');
    await p.locator('#saveVisitDetails').click();
    await p.waitForFunction(() => /notified/.test(document.getElementById('visitMessage').textContent), null, { timeout: 15000 });
    const msg = await p.locator('#visitMessage').innerText();
    assert.ok(msg.includes('Google Calendar is not connected, so this change is only in your workspace.'), msg);
    assert.ok(!/Calendar delivery is not confirmed/.test(msg), msg); assert.ok(msg.includes(NOT_TOLD), msg);
    await shot(p, 'fc06-calendar-not-connected', width);
  });
  await second.context.close();
}
await finish('fc06-visit-not-notified');
