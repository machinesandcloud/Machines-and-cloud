import assert from 'node:assert/strict';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const checks = []; let blocked = 0;
try {
  for (const path of ['houston.html', 'privacy-policy.html']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://127.0.0.1:8893' || url.pathname.startsWith('/api/')) { blocked++; return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8893/' + path, { waitUntil: 'networkidle' });
    const state = () => page.evaluate(() => ({ hidden: navMenu.hidden, inert: navMenu.inert, expanded: navToggle.getAttribute('aria-expanded'), locked: document.body.classList.contains('nav-open'), backdrop: document.querySelector('.nav-backdrop').hidden }));
    const closed = { hidden: true, inert: true, expanded: 'false', locked: false, backdrop: true };
    const focus = selector => page.locator(selector).first().evaluate(element => element === document.activeElement);
    const open = () => page.locator('#navToggle').click();
    assert.deepEqual(await state(), closed, 'fresh closed'); checks.push(path + ':fresh closed');
    await open();
    assert.deepEqual(await state(), { hidden: false, inert: false, expanded: 'true', locked: true, backdrop: false });
    assert.ok(await focus('.nav-menu-close'), 'open focus');
    assert.equal(await page.locator('#navMenu .navbar-links a').first().evaluate(element => getComputedStyle(element).color), 'rgb(23, 36, 59)');
    await page.keyboard.press('Shift+Tab'); assert.ok(await focus('#navMenu .navbar-cta a'), 'reverse trap');
    await page.keyboard.press('Tab'); assert.ok(await focus('.nav-menu-close'), 'forward trap');
    await page.keyboard.press('Escape'); assert.ok(await focus('#navToggle'), 'Escape restores toggle');
    checks.push(path + ':contrast,focus trap,Escape');
    for (const action of ['backdrop', 'close', 'toggle']) {
      await open();
      if (action === 'backdrop') await page.locator('.nav-backdrop').click({ position: { x: 4, y: 600 } });
      else await page.locator(action === 'close' ? '.nav-menu-close' : '#navToggle').click();
      assert.deepEqual(await state(), closed, action + ' closes');
    }
    checks.push(path + ':all close controls');
    await page.evaluate(() => scrollTo({ top: 500, behavior: 'instant' })); await page.waitForTimeout(400);
    const before = await page.evaluate(() => scrollY); assert.ok(before > 0);
    await open(); assert.equal(await page.locator('#navbar').evaluate(element => element.classList.contains('scrolled')), true);
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => scrollY), before, 'scroll restored');
    checks.push(path + ':scrolled exact restore');
    await open(); await page.setViewportSize({ width: 1025, height: 844 }); await page.waitForTimeout(150);
    assert.deepEqual(await state(), { hidden: false, inert: false, expanded: 'false', locked: false, backdrop: true });
    assert.ok(await focus('#navMenu a'), 'desktop focus visible');
    await page.setViewportSize({ width: 1024, height: 844 }); await page.waitForTimeout(150);
    assert.deepEqual(await state(), closed); assert.ok(await focus('#navToggle'), 'mobile focus visible');
    checks.push(path + ':1024/1025 reset+focus');
    await open(); await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    assert.deepEqual(await state(), closed); checks.push(path + ':pageshow reset');
    for (const width of [320, 375, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 }); assert.deepEqual(await state(), closed);
      await open(); assert.ok(await page.locator('#navMenu').isVisible()); await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []); checks.push(path + ':320/375/768/1024 and no JS errors');
    await context.close();
  }
  console.log(JSON.stringify({ status: 'PASS', groups: checks.length, checks, externalRequestsBlocked: blocked, scope: 'local nav only; fonts blocked; no submissions or provider/model requests' }, null, 2));
} finally { await browser.close(); }
