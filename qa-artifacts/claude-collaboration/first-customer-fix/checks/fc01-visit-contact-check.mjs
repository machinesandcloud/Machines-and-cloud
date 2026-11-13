// PRA-FC-01: the visit dialog shows the customer's name and a tap-to-call / tap-to-text phone above the fold,
// and "Contact the customer to confirm the arrival window" appears only next to a way to contact them.
import { assert, launch, seed, open, route, shot, check, finish, noHScroll, nextWeekday } from './fc-lib.mjs';
await launch();
async function openVisit(page, id) { await route(page, 'availability'); const b = page.locator('#bookings .visit-open[data-visit="' + id + '"]'); await b.waitFor({ state: 'attached' }); await b.evaluate(n => n.click()); await page.locator('#visitDialog[open]').waitFor(); }
for (const [width, height] of [[390, 844], [1440, 900]]) {
  const x = await seed();
  const withPhone = await x.visit({ customer_name: 'Jim Homeowner', phone: '+17135550142', address: '12 Oak St, Katy, TX 77494', issue: 'AC blowing warm air', date: nextWeekday(3) });
  const noPhone = await x.visit({ customer_name: '', phone: '', address: '9 Elm St, Katy', issue: 'Thermostat question', date: nextWeekday(4) });
  const { page, context } = await open(x, { width, height, hash: '#availability' });
  await check(`visit dialog shows name and tap-to-call/text phone above the fold @${width}`, async () => {
    await openVisit(page, withPhone.id);
    const call = page.locator('#visitDetails a[data-visit-call]'), text = page.locator('#visitDetails a[data-visit-text]');
    assert.equal(await call.getAttribute('href'), 'tel:+17135550142'); assert.equal(await text.getAttribute('href'), 'sms:+17135550142');
    assert.match(await call.innerText(), /\(713\) 555-0142/);
    const details = await page.locator('#visitDetails').innerText();
    assert.ok(details.includes('Customer: Jim Homeowner'), details);
    assert.ok(details.includes('Contact the customer to confirm the arrival window.'), details);
    assert.ok(!(await page.locator('#visitEditForm').isVisible()), 'Edit form must not be needed');
    const box = await call.boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= height, 'call link above the fold ' + JSON.stringify(box));
    assert.ok(box.height >= 24, 'tap target height ' + box.height);
    await noHScroll(page); await shot(page, 'fc01-visit-with-phone', width);
    await page.locator('#closeVisit').click();
  });
  await check(`no-phone visit says so and drops the contact instruction @${width}`, async () => {
    await openVisit(page, noPhone.id);
    const details = await page.locator('#visitDetails').innerText();
    assert.ok(details.includes('Customer: Name not given · No phone saved'), details);
    assert.ok(!details.includes('Contact the customer to confirm the arrival window.'), details);
    assert.ok(details.includes('Add a phone number with Edit details'), details);
    assert.equal(await page.locator('#visitDetails a').count(), 0);
    await shot(page, 'fc01-visit-no-phone', width); await page.locator('#closeVisit').click();
  });
  await check(`customer-typed markup in a name stays text @${width}`, async () => {
    const odd = await x.visit({ customer_name: '<img src=x onerror=alert(1)>', phone: '+17135550143', address: '1 Main St', issue: 'Test', date: nextWeekday(5) });
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-refresh'))); await page.waitForTimeout(500);
    await openVisit(page, odd.id);
    assert.equal(await page.locator('#visitDetails img').count(), 0); assert.ok((await page.locator('#visitDetails').innerText()).includes('<img src=x'));
    await page.locator('#closeVisit').click();
  });
  await context.close();
}
await finish('fc01-visit-contact');
