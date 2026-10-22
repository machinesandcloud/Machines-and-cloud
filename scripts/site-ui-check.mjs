// Fresh, unauthenticated browser checks. Never starts a server, reads .env or sends a chat.
// Optional local form simulations fulfill POSTs inside Playwright; none reach a server.
// Public diagnostics capture only explicitly authorized fresh homepage viewports.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { delimiter, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const publicDiagnostic = args.includes("--public-diagnostic"), captureOnly = args.includes("--capture-only") || publicDiagnostic;
const interceptedForms = args.includes("--intercept-form-check");
assert.ok(!publicDiagnostic || !interceptedForms, "form simulation is local only");
const base = new URL(option("--base", publicDiagnostic ? "https://machinesandcloud.com" : ""));
if (publicDiagnostic) assert.equal(base.origin, "https://machinesandcloud.com", "public mode permits only the explicitly authorized public homepage");
else assert.ok(base.protocol === "http:" && base.hostname === "127.0.0.1" && base.port, "explicit local HTTP 127.0.0.1 origin and port required");
assert.ok(base.pathname === "/" && !base.search && !base.hash && !base.username && !base.password);
const prefix = option("--output-prefix", publicDiagnostic ? "scratchpad/site-before-public" : "scratchpad/site-ui");
const captureWidth = option("--capture-width") ? Number(option("--capture-width")) : null;
if (captureWidth !== null) assert.ok(Number.isInteger(captureWidth) && captureWidth >= 320 && captureWidth <= 1920);
mkdirSync(resolve(prefix, ".."), { recursive: true });
const hash = (body) => createHash("sha256").update(body).digest("hex");
let playwright;
if (option("--playwright")) playwright = await import(pathToFileURL(resolve(option("--playwright"))));
else {
  try { playwright = await import("playwright"); } catch {
    for (const bin of (process.env.PATH || "").split(delimiter)) {
      const file = resolve(bin, "../playwright/index.mjs");
      if (existsSync(file)) { playwright = await import(pathToFileURL(file)); break; }
    }
  }
}
if (!playwright) throw new Error("Existing Playwright required: pass --playwright /absolute/path/to/playwright/index.mjs or invoke through its existing npm exec environment. No dependencies are installed by this script.");
const report = { startedAt: new Date().toISOString(), base: base.origin, publicDiagnostic, captureOnly, commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), source: {}, pages: [], checks: [], issues: [], browserErrors: [], blockedRequests: [], screenshots: [], formSubmissions: 0, providerModelCalls: 0 };
const sourceFiles = ["index.html", "about.html", "thank-you.html", "anaheim.html", "styles.css", "script.js", "stories.js", "agent-widget.js", "site-refresh.css"];
for (const file of sourceFiles) if (existsSync(file)) report.source[file] = hash(readFileSync(file));
const check = (name, ok, detail) => { report.checks.push({ name, pass: !!ok, ...(detail === undefined ? {} : { detail }) }); if (!ok) report.issues.push({ name, detail }); };
const browser = await playwright.chromium.launch({ headless: true, channel: "chrome" });
async function fresh(viewport, reducedMotion = "reduce", javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport, reducedMotion, javaScriptEnabled, serviceWorkers: "block" });
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    const permittedOrigin = publicDiagnostic ? ["https://machinesandcloud.com", "https://www.machinesandcloud.com"].includes(url.origin) : url.origin === base.origin;
    const font = publicDiagnostic && ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname);
    if (request.method() !== "GET" || url.pathname.startsWith("/api/") || (!permittedOrigin && !font)) {
      report.blockedRequests.push({ method: request.method(), url: url.origin + url.pathname, resource: request.resourceType() }); await route.abort();
    } else await route.continue();
  });
  await context.addInitScript(() => {
    window.__siteCheckSubmits = 0;
    document.addEventListener("submit", (event) => { window.__siteCheckSubmits++; event.preventDefault(); }, true);
  });
  const page = await context.newPage(); page.setDefaultTimeout(5000); page.on("pageerror", (error) => report.browserErrors.push(error.message));
  return { context, page };
}
async function diagnostics(page, path, viewport) {
  return page.evaluate(({ path, viewport }) => {
    const details = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return { tag: element.tagName, text: element.textContent.trim().slice(0, 180), classes: element.className, display: style.display, visibility: style.visibility, opacity: style.opacity, color: style.color, background: style.backgroundColor, transform: style.transform, filter: style.filter, fontSize: style.fontSize, position: style.position, hidden: element.hidden, tabIndex: element.tabIndex, ariaExpanded: element.getAttribute("aria-expanded"), ariaHidden: element.getAttribute("aria-hidden"), inert: element.inert, rect: { x: box.x, y: box.y, width: box.width, height: box.height }, intersectsViewport: box.width > 0 && box.height > 0 && box.left < innerWidth && box.right > 0 && box.top < innerHeight && box.bottom > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 };
    };
    const heading = document.querySelector("h1");
    return { path, viewport, finalUrl: location.href, title: document.title, bodyClass: document.body.className, scrollWidth: document.documentElement.scrollWidth, clientWidth: innerWidth, nav: details(document.querySelector("#navbar")), toggle: details(document.querySelector("#navToggle")), menu: details(document.querySelector("#navMenu")), navLinks: [...document.querySelectorAll("#navMenu a")].map(details), heading: details(heading), headingParent: details(heading?.parentElement), heroImage: details(document.querySelector(".hero-full-bg,.hero-bg")), h1Count: document.querySelectorAll("h1").length, forms: [...document.forms].map((form) => ({ name: form.name, action: form.getAttribute("action"), method: form.method, hidden: form.hidden })), submits: window.__siteCheckSubmits, media: { max1024: matchMedia("(max-width:1024px)").matches, reducedMotion: matchMedia("(prefers-reduced-motion:reduce)").matches } };
  }, { path, viewport });
}
async function load(page, path) {
  const response = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  check(`${path} responds successfully`, !!response?.ok(), response?.status());
  if (response) report.servedHtml = { ...(report.servedHtml || {}), [path]: hash(await response.body()) };
  return response;
}
async function screenshot(page, name, fullPage = false) {
  const path = `${prefix}-${name}.png`; await page.screenshot({ path, fullPage }); report.screenshots.push(path);
}
async function scrollThrough(page) {
  for (let y = 0, height = await page.evaluate(() => document.documentElement.scrollHeight); y < height; y += 700) { await page.evaluate(y => scrollTo(0, y), y); await page.waitForTimeout(25); }
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(80);
}
async function menuContrast(page) {
  return page.locator("#navMenu a").evaluateAll(elements => {
    const parse = color => (color.match(/[\d.]+/g) || []).map(Number);
    const luminance = color => color.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    return elements.filter(el => el.getClientRects().length).map(el => {
      let background = [255, 255, 255], chain = [];
      for (let parent = el; parent; parent = parent.parentElement) chain.unshift(parent);
      for (const parent of chain) { const c = parse(getComputedStyle(parent).backgroundColor), alpha = c[3] ?? 1; if (c.length >= 3) background = c.slice(0, 3).map((n, i) => n * alpha + background[i] * (1 - alpha)); }
      const foreground = parse(getComputedStyle(el).color), a = luminance(background), b = luminance(foreground);
      return { text: el.textContent.trim(), foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
}
async function navAcceptance(page, path, width) {
  const label = `${path} ${width}px`, toggle = page.locator("#navToggle"), menu = page.locator("#navMenu");
  const initial = await diagnostics(page, path, { width, height: 900 }); report.pages.push(initial);
  check(`${label}: no horizontal overflow`, initial.scrollWidth <= width + 1, initial.scrollWidth);
  check(`${label}: one visible main heading`, initial.h1Count === 1 && initial.heading?.rect.width > 0 && initial.heading?.visibility !== "hidden" && initial.heading?.opacity !== "0");
  if (width > 1024) {
    check(`${label}: desktop navigation visible and toggle absent`, await menu.isVisible() && !await toggle.isVisible());
    check(`${label}: desktop links remain in viewport`, initial.navLinks.every(x => x.rect.x >= 0 && x.rect.x + x.rect.width <= width + 1));
    return;
  }
  check(`${label}: fresh drawer closed/inert with collapsed toggle`, !await menu.isVisible() && await menu.getAttribute("aria-hidden") === "true" && await menu.evaluate(el => el.inert) && await toggle.getAttribute("aria-expanded") === "false");
  await page.evaluate(() => document.querySelector("#navMenu a").focus());
  check(`${label}: hidden menu cannot receive focus`, !await menu.evaluate(el => el.contains(document.activeElement)));
  await toggle.focus(); await page.keyboard.press("Enter");
  await menu.waitFor({ state: "visible" });
  check(`${label}: keyboard opens dialog and focuses header X`, await toggle.getAttribute("aria-expanded") === "true" && await page.locator("#navbar").getAttribute("aria-modal") === "true" && await toggle.evaluate(el => document.activeElement === el));
  const contrast = await menuContrast(page);
  check(`${label}: menu text contrast at least 4.5:1`, contrast.every(x => x.ratio >= 4.5), contrast);
  const inert = await page.evaluate(() => [...document.body.children].filter(el => !el.contains(document.querySelector("#navbar")) && !el.classList.contains("nav-backdrop") && !["SCRIPT", "STYLE"].includes(el.tagName)).every(el => el.inert));
  check(`${label}: page background is inert while open`, inert);
  const focusables = menu.locator("a[href],button:not([hidden])");
  await focusables.last().focus(); await page.keyboard.press("Tab");
  check(`${label}: Tab wraps to header X`, await toggle.evaluate(el => document.activeElement === el));
  await page.keyboard.press("Shift+Tab");
  check(`${label}: Shift+Tab wraps to final menu link`, await focusables.last().evaluate(el => document.activeElement === el));
  if ([390, 865, 1024].includes(width) && path === "/") await screenshot(page, `${width}-menu-open`);
  await page.keyboard.press("Escape");
  check(`${label}: Escape closes and restores toggle focus`, !await menu.isVisible() && await toggle.evaluate(el => document.activeElement === el));
  await toggle.click(); await toggle.click();
  check(`${label}: header X closes and restores focus`, !await menu.isVisible() && await toggle.evaluate(el => document.activeElement === el));
  await toggle.click(); await page.locator(".nav-backdrop").click({ position: { x: 2, y: page.viewportSize().height - 2 } });
  check(`${label}: backdrop closes and restores focus`, !await menu.isVisible() && await toggle.evaluate(el => document.activeElement === el));
  check(`${label}: background inert state restored`, await page.evaluate(() => [...document.body.children].filter(el => !el.classList.contains("nav-backdrop")).every(el => !el.inert)));
  if (path === "/" && [390, 1024].includes(width)) {
    await page.evaluate(() => scrollTo(0, 600)); await page.waitForTimeout(80);
    const before = await page.evaluate(() => scrollY);
    await toggle.click();
    check(`${label}: scrolled header remains scrolled while open`, await page.locator("#navbar").evaluate(el => el.classList.contains("scrolled")));
    await page.keyboard.press("Escape");
    check(`${label}: closing restores prior scroll`, Math.abs(await page.evaluate(() => scrollY) - before) <= 2);
    await toggle.click(); await page.setViewportSize({ width: 1025, height: 900 }); await page.waitForTimeout(80);
    check(`${label}: resize to desktop clears state/scroll lock`, await menu.isVisible() && await toggle.getAttribute("aria-expanded") === "false" && !await page.evaluate(() => document.body.classList.contains("nav-open")));
    check(`${label}: resize focus leaves hidden toggle`, await menu.locator("a").first().evaluate(el => document.activeElement === el));
    await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(80);
    check(`${label}: resize back to mobile stays closed`, !await menu.isVisible() && await toggle.evaluate(el => document.activeElement === el));
    await toggle.click(); await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    check(`${label}: page-show clears restored drawer state`, !await menu.isVisible() && await toggle.evaluate(el => document.activeElement === el));
    await page.evaluate(() => scrollTo(0, 0));
  }
}
async function homepageFlow(page) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator("#navToggle").click();
  await page.locator("#navMenu a[href$='#plans']").first().click();
  await page.waitForTimeout(100);
  check("homepage: menu link closes drawer and reaches plans", new URL(page.url()).hash === "#plans" && !await page.locator("#navMenu").isVisible() && !await page.evaluate(() => document.body.classList.contains("nav-open")));
  const plansTop = await page.locator("#plans").evaluate(el => el.getBoundingClientRect().top);
  const navBottom = await page.locator("#navbar").evaluate(el => el.getBoundingClientRect().bottom);
  check("homepage: plans anchor is not covered by fixed header", plansTop >= navBottom - 2, { plansTop, navBottom });
  await page.evaluate(() => scrollTo(0, 0));
  const heroCTA = page.locator(".site-hero a[href$='#pilot'],.hero-full a[href$='#pilot']").first();
  check("homepage: primary CTA exists and targets pilot", await heroCTA.count() === 1);
  await heroCTA.click();
  const immediateScroll = await page.evaluate(() => scrollY);
  await page.waitForTimeout(100);
  const nextScroll = await page.evaluate(() => scrollY);
  check("homepage: reduced-motion CTA does not animate scrolling", Math.abs(immediateScroll - nextScroll) <= 2, { immediateScroll, nextScroll });
  await page.waitForFunction(() => { const r = document.querySelector("#pilot").getBoundingClientRect(), bottom = document.querySelector("#navbar").getBoundingClientRect().bottom; return r.top >= bottom - 2 && r.top < innerHeight / 2; });
  const pilotGeometry = await page.locator("#pilot form[name='contact']").evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, viewport: innerHeight }; });
  check("homepage: primary CTA reaches visible pilot form", pilotGeometry.top < pilotGeometry.viewport && pilotGeometry.bottom > 0, pilotGeometry);
  const labels = await page.locator("#pilot label[for]").evaluateAll(els => els.every(el => !!document.getElementById(el.htmlFor)));
  check("homepage: form labels remain associated without submitting", labels);
  check("homepage: website is optional", !await page.locator("#website").evaluate(el => el.required));
  const formContract = await page.locator("#pilot form[name='contact']").evaluate(form => ({ method: form.method, action: form.getAttribute("action"), formName: form.querySelector('[name="form-name"]')?.value, names: [...form.elements].map(el => el.name).filter(Boolean) }));
  check("homepage: existing contact form contract preserved", formContract.method === "post" && formContract.action === "/thank-you.html" && formContract.formName === "contact" && ["name", "email", "website", "phone", "bot-field"].every(name => formContract.names.includes(name)), formContract);
  check("homepage: agent-lead capture form preserved", await page.locator("form[name='agent-lead']").count() === 1);
  for (const anchor of ["plans", "week"]) {
    await page.goto(new URL(`/#${anchor}`, base).href, { waitUntil: "domcontentloaded" });
    check(`homepage: #${anchor} anchor exists`, await page.locator(`#${anchor}`).count() === 1);
  }
  const examples = page.locator("[data-example]");
  check("homepage: three channel-example controls", await examples.count() === 3);
  let priorText = "";
  let priorSummary = "";
  for (const channel of ["sms", "call", "spanish"]) {
    const button = page.locator(`[data-example='${channel}']`); await button.focus(); await page.keyboard.press(channel === "call" ? "Space" : "Enter");
    const panel = page.locator("#demo-wrap"), text = await panel.innerText();
    check(`homepage: keyboard selects ${channel} example`, await button.getAttribute("aria-pressed") === "true");
    check(`homepage: ${channel} example contains a real visible conversation`, text.length > 200 && (!priorText || text !== priorText));
    const summary = await page.locator("#example-summary").innerText();
    check(`homepage: ${channel} updates the owner summary`, summary.length > 80 && (!priorSummary || summary !== priorSummary));
    priorSummary = summary;
    priorText = text;
  }
  const question = page.locator("details.site-question").first();
  check("homepage: native FAQ is available", await question.count() === 1);
  await question.locator("summary").focus(); await page.keyboard.press("Enter");
  check("homepage: keyboard opens FAQ answer", await question.evaluate(el => el.open));
  await page.keyboard.press("Enter"); check("homepage: keyboard closes FAQ answer", !await question.evaluate(el => el.open));
  check("homepage: reduced motion disables smooth scrolling", await page.evaluate(() => matchMedia("(prefers-reduced-motion:reduce)").matches && getComputedStyle(document.documentElement).scrollBehavior === "auto"));
}
async function heroAndWidget(page, width) {
  const layout = await page.evaluate(() => {
    const rectangle = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const note = document.querySelector(".site-job-note"), caption = document.querySelector(".site-hero-visual figcaption"), launcher = document.querySelector("#mcAgentLauncher");
    const spans = [...note.querySelectorAll("p > span")].map(el => { const range = document.createRange(); range.selectNodeContents(el); return { text: el.textContent, lines: [...range.getClientRects()].filter(r => r.width > 0).length }; });
    const launch = rectangle(launcher);
    const textRects = [...note.querySelectorAll("strong,p > span,.site-note-detail")].flatMap(el => { const range = document.createRange(); range.selectNodeContents(el); return [...range.getClientRects()].map(r => ({ text: el.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom })); });
    const covered = textRects.filter(r => r.top < innerHeight && r.bottom > 0 && r.left < launch.right && r.right > launch.left && r.top < launch.bottom && r.bottom > launch.top);
    return { note: rectangle(note), caption: rectangle(caption), spans, launcher: launch, covered };
  });
  check(`homepage ${width}px: caption follows job card without overlap`, layout.caption.top >= layout.note.bottom, layout);
  check(`homepage ${width}px: issue and arrival window stay on whole lines`, layout.spans.every(x => x.lines === 1), layout.spans);
  check(`homepage ${width}px: launcher does not cover hero job text on first load`, layout.covered.length === 0, layout.covered);
  if (width <= 640) check(`homepage ${width}px: mobile launcher is a 48px control`, layout.launcher.width >= 44 && layout.launcher.width <= 52 && layout.launcher.height >= 44, layout.launcher);
  const launcher = page.getByRole("button", { name: "Ask the front desk", exact: true });
  check(`homepage ${width}px: chat launcher retains accessible name`, await launcher.count() === 1);
  await launcher.click(); await page.locator("#mcAgentPanel").waitFor({ state: "visible" });
  check(`homepage ${width}px: launcher opens a labeled panel without sending`, await launcher.getAttribute("aria-expanded") === "true" && await page.locator("#mcAgentPanel").getAttribute("aria-label") === "Machines and Cloud front desk");
  await page.locator("#mcAgentClose").click();
  check(`homepage ${width}px: panel closes and returns focus`, !await page.locator("#mcAgentPanel").isVisible() && await launcher.evaluate(el => document.activeElement === el));
}
async function simulatedForms() {
  report.formSimulations = [];
  for (const status of [503, 200]) {
    const { context, page } = await fresh({ width: 390, height: 844 });
    const captured = [];
    try {
      await page.route(base.origin + "/", async route => {
        if (route.request().method() !== "POST") return route.fallback();
        const data = Object.fromEntries(new URLSearchParams(route.request().postData()));
        assert.equal(data["form-name"], "contact"); assert.equal(data.email, "site-check@example.test");
        captured.push(data); await route.fulfill({ status, contentType: "text/plain", body: status === 200 ? "OK" : "Simulated failure" });
      });
      await load(page, "/");
      await page.locator("#name").fill("Local Site Check"); await page.locator("#email").fill("site-check@example.test");
      await page.locator("#website").fill(""); await page.locator("#phone").fill("7135550199");
      await page.locator("#pilot button[type='submit']").click();
      if (status === 503) {
        await page.locator(".form-status.is-error").waitFor({ state: "visible" });
        check("intercepted form: failure preserves values and permits retry", await page.locator("#name").inputValue() === "Local Site Check" && await page.locator("#pilot button[type='submit']").isEnabled());
      } else {
        await page.waitForURL("**/onboard.html?**");
        check("intercepted form: success reaches onboarding with exact prefill", await page.locator("#name").inputValue() === "Local Site Check" && await page.locator("#email").inputValue() === "site-check@example.test" && await page.locator("#phone").inputValue() === "7135550199");
        check("intercepted form: blank optional website stays blank", await page.locator("#website").inputValue() === "");
      }
      check(`intercepted form ${status}: exactly one locally fulfilled POST`, captured.length === 1);
      report.formSimulations.push({ status, interceptedLocally: captured.length, forwardedToServer: 0, fields: Object.keys(captured[0] || {}), website: captured[0]?.website });
    } catch (error) { report.issues.push({ name: `local intercepted form ${status}`, detail: String(error.message || error) }); }
    finally { await context.close(); }
  }
}
try {
  if (captureOnly) {
    for (const viewport of captureWidth ? [{ width: captureWidth, height: 1000 }] : [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const { context, page } = await fresh(viewport, "no-preference");
      await load(page, "/");
      const entry = await diagnostics(page, "/", viewport); report.pages.push(entry);
      const shot = `${prefix}-${viewport.width}-first-open.png`; await page.screenshot({ path: shot }); report.screenshots.push(shot);
      const full = `${prefix}-${viewport.width}-full.png`; await page.screenshot({ path: full, fullPage: true }); report.screenshots.push(full);
      await context.close();
    }
    report.result = "diagnostic_captured";
  } else {
    for (const path of ["/", "/about.html", "/thank-you.html", "/anaheim.html"]) {
      for (const width of [320, 375, 390, 768, 865, 1024, 1025, 1440]) {
        const { context, page } = await fresh({ width, height: width <= 390 ? 844 : 1000 });
        try {
          await load(page, path);
          if ([320, 390, 1440].includes(width) && path !== "/anaheim.html") {
            await screenshot(page, `${path === "/" ? "home" : path.split(".")[0].slice(1)}-${width}-first-open`);
          }
          if (path === "/") await heroAndWidget(page, width);
          await navAcceptance(page, path, width);
          if ([320, 390, 1440].includes(width) && path !== "/anaheim.html") {
            await scrollThrough(page); await screenshot(page, `${path === "/" ? "home" : path.split(".")[0].slice(1)}-${width}-full`, true);
          }
          if (path === "/" && width === 390) { await homepageFlow(page); await screenshot(page, "390-example-and-faq", true); }
          report.formSubmissions += await page.evaluate(() => window.__siteCheckSubmits || 0);
        } catch (error) { report.issues.push({ name: `${path} ${width}px interaction`, detail: String(error.message || error) }); }
        finally { await context.close(); }
      }
    }
    for (const width of [390, 1440]) {
      const { context, page } = await fresh({ width, height: 1000 }, "reduce", false);
      try {
        await load(page, "/");
        check(`no JS ${width}px: heading visible`, await page.locator("h1").isVisible() && await page.locator("h1").evaluate(el => getComputedStyle(el).opacity !== "0"));
        check(`no JS ${width}px: pilot form and labels available`, await page.locator("#pilot form[name='contact']").isVisible());
        check(`no JS ${width}px: default example present`, (await page.locator("#demo-wrap").innerText()).length > 200);
        const question = page.locator("details.site-question").first(); await question.locator("summary").click();
        check(`no JS ${width}px: native FAQ works`, await question.evaluate(el => el.open));
        await screenshot(page, `no-js-${width}`, true);
      } catch (error) { report.issues.push({ name: `no JS ${width}px`, detail: String(error.message || error) }); }
      finally { await context.close(); }
    }
    if (interceptedForms) await simulatedForms();
    check("no JavaScript errors", report.browserErrors.length === 0, report.browserErrors);
    check("no form submissions", report.formSubmissions === 0);
    check("no non-GET requests attempted", report.blockedRequests.every(x => x.method === "GET"), report.blockedRequests.filter(x => x.method !== "GET"));
    report.sourceAfter = {};
    for (const file of sourceFiles) if (existsSync(file)) report.sourceAfter[file] = hash(readFileSync(file));
    check("source stayed stable throughout acceptance", JSON.stringify(report.sourceAfter) === JSON.stringify(report.source));
    report.result = report.issues.length ? "failed" : "passed";
    if (report.issues.length) process.exitCode = 1;
  }
} catch (error) { report.result = "failed"; report.error = String(error.message || error); process.exitCode = 1; }
finally {
  await browser.close(); report.finishedAt = new Date().toISOString();
  writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, issues: report.issues.length, error: report.error, evidence: `${prefix}.json` }));
}
