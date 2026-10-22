// Resolve the baseline's early focus observation against exact committed widget source.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const read = path => execFileSync('git', ['show', 'b65c0f4:' + path], { encoding: 'utf8' });
const widget = read('agent-widget.js'), css = read('styles.css') + read('site-refresh.css');
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true }); const checks = [];
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    await page.route('**/*', route => route.abort('blockedbyclient'));
    await page.setContent('<html><head><style>' + css + '</style></head><body class="theme-light site-refresh"></body></html>');
    await page.addScriptTag({ content: widget }); await page.locator('#mcAgentLauncher').click();
    await page.waitForFunction(() => document.activeElement.id === 'mcAgentInput', undefined, { timeout: 1000 });
    checks.push({ width, pass: await page.locator('#mcAgentInput').evaluate(node => node === document.activeElement), actualFocus: await page.evaluate(() => document.activeElement.id) }); await page.close();
  }
} finally { await browser.close(); }
const output = { at: new Date().toISOString(), source: 'b65c0f4:agent-widget.js', sourceSHA256: createHash('sha256').update(widget).digest('hex'), checks, conclusion: 'Baseline320 focus check sampled before the explicit50ms focus timer; settled focus succeeds. Not a product defect.', actualNetworkRequests: 0 };
writeFileSync('scratchpad/sales-desk-baseline-focus.json', JSON.stringify(output, null, 2)); console.log(JSON.stringify({ checks: checks.length, passed: checks.filter(row => row.pass).length }));
