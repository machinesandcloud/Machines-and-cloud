// PRA-FC-03: Home "Connection progress" gives no owner task for a service our team still has to set up,
// and agrees with Connections ("Setup with our team"); the summary does not count those services as owner work.
import { assert, launch, seed, open, route, shot, check, finish, noHScroll } from './fc-lib.mjs';
await launch();
for (const [width, height] of [[390, 844], [1440, 900]]) {
  const x = await seed({ channels: ['web', 'voice', 'sms', 'calendar'] });
  const { page, context } = await open(x, { width, height, hash: '#today' });
  await check(`Home rows for gated services say "Setup with our team" and give no owner task @${width}`, async () => {
    const host = page.locator('#homeConnectionProgress'); await host.waitFor();
    await host.evaluate(n => { n.open = true; });
    for (const id of ['voice', 'sms', 'calendar']) {
      const row = page.locator('#homeConnectionProgressRows [data-home-service="' + id + '"]'); await row.waitFor();
      const text = await row.innerText();
      assert.equal(await row.getAttribute('data-home-team-setup'), 'true', id + ': ' + text);
      assert.ok(text.includes('Setup with our team') && text.includes('not live yet'), id + ': ' + text);
      assert.ok(!/Next: You|Save registered business details|Approve Google access|required steps complete/.test(text), id + ': ' + text);
    }
    const web = await page.locator('#homeConnectionProgressRows [data-home-service="web"]').innerText();
    assert.ok(/required steps complete/.test(web), 'website chat keeps its real owner steps: ' + web);
    const summary = await page.locator('#homeConnectionProgressSummary').innerText();
    assert.ok(!/of 4 selected services/.test(summary), summary);
    assert.ok(/of 1 service you can start now has verified delivery · 3 set up with our team \(not live yet\)/.test(summary), summary);
    await page.locator('#homeConnectionProgress').scrollIntoViewIfNeeded(); await noHScroll(page); await shot(page, 'fc03-home-progress', width);
  });
  await check(`Connections agrees for the same services @${width}`, async () => {
    const d = (await x.api()).body, rows = d.channelAvailability.channels;
    for (const id of ['voice', 'sms', 'calendar']) assert.equal(rows.find(r => r.id === id).state, 'team_setup');
    await route(page, 'setup'); await page.waitForTimeout(400);
    const text = await page.locator('#setupGuide').innerText();
    assert.ok((text.match(/Setup with our team/g) || []).length >= 3, text.slice(0, 400));
    await shot(page, 'fc03-connections', width);
  });
  await context.close();
}
await finish('fc03-home-progress');
