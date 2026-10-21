// Local owner-workflow check. No .env access or server startup; Playwright is optional tooling.
// npm exec --yes --package=playwright -- node scripts/availability-ui-check.mjs --base http://127.0.0.1:8892
import assert from "node:assert/strict";
import { existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { delimiter, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { newClient } from "../netlify/functions/lib/config.mjs";

const args = process.argv.slice(2), opt = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const slug = "pm-availability-ui", key = "local-availability-owner";
const day = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + n * 86400000));
if (args.includes("--fixture-out")) {
  const c = newClient({ slug, ownerKey: key, owner: { name: "Test Owner", email: "owner@example.test", phone: "+17135550199" }, business: { name: "Test HVAC", trade: "HVAC", city: "Houston", serviceArea: ["Katy"], hours: "Monday to Friday 7 am to 7 pm" } });
  c.status = "live"; c.plan = "growth"; c.liveAt = new Date().toISOString(); c.windows = ["8 to 12", "12 to 5"];
  c.phone.forwarding = "none";
  const b = { id: "abc123abcd", slug, createdAt: new Date().toISOString(), customer_name: "Test Customer", phone: "+17135550123", address: "12 Oak St, Katy", date: day(3), window: "8 to 12", issue: "AC repair", status: "booked" };
  writeFileSync(opt("--fixture-out"), JSON.stringify({ clients: { [slug]: c }, bookings: { [`${slug}/${b.id}`]: b }, index: { [`bookings:${slug}:${b.phone}`]: [b.id] } }, null, 2) + "\n");
  console.log("Wrote a synthetic owner-availability fixture; no server or model calls.");
  process.exit(0);
}
const base = new URL(opt("--base", ""));
if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || !base.port || base.pathname !== "/" || base.username || base.password || base.search || base.hash) throw new Error("Explicit 127.0.0.1 HTTP origin and port required.");
let playwright;
try { playwright = await import("playwright"); }
catch {
  for (const bin of (process.env.PATH || "").split(delimiter)) {
    const file = resolve(bin, "../playwright/index.mjs");
    if (existsSync(file)) { playwright = await import(pathToFileURL(file)); break; }
  }
}
if (!playwright) throw new Error("Run with npm exec --yes --package=playwright -- node scripts/availability-ui-check.mjs --base <local origin>.");
const prefix = opt("--output-prefix", "scratchpad/availability-ui"); mkdirSync(resolve(prefix, ".."), { recursive: true });
const hash = (body) => createHash("sha256").update(body).digest("hex");
const report = { startedAt: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), deskHtmlSha256: hash(readFileSync("desk.html")), base: base.origin, syntheticShop: slug, providerDeliveryTested: false, checks: [], screenshots: [], browserErrors: [], blockedExternalRequests: [] };
const check = (name, value) => { assert.ok(value, name); report.checks.push(name); };
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.MC_BROWSER_EXECUTABLE ? { executablePath: process.env.MC_BROWSER_EXECUTABLE } : { channel: "chrome" }) });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("**/*", async route => { const u = new URL(route.request().url()); if (u.origin === base.origin) await route.continue(); else { report.blockedExternalRequests.push(u.hostname); await route.abort(); } });
  const page = await context.newPage(); page.on("pageerror", err => report.browserErrors.push(err.message));
  const pageResponse = await page.goto(new URL(`/desk.html?c=${slug}&k=${key}#availability`, base).href);
  check("the served owner page matches the recorded source", hash(await pageResponse.body()) === report.deskHtmlSha256);
  await page.getByRole("heading", { name: "Time you are unavailable" }).waitFor();
  await page.waitForFunction(() => document.querySelector("#availabilityBlocks").textContent.includes("No time blocked."));
  check("availability is discoverable in the owner navigation", await page.getByRole("button", { name: "Availability", exact: true }).isVisible());
  const row = (date, window) => page.locator(".availability-row").filter({ has: page.locator(`button[data-date="${date}"][data-window="${window}"]`) });
  async function block(date, window) {
    await page.locator("#availabilityDate").fill(date); await page.locator("#availabilityWindow").selectOption(window);
    await page.getByRole("button", { name: "Block time", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#availabilityMessage").textContent.startsWith("Time blocked."));
    await row(date, window).waitFor();
  }
  await block(day(3), "8 to 12");
  check("blocking an existing reservation shows an explicit preservation notice", (await row(day(3), "8 to 12").textContent()).includes("already reserved and unchanged"));
  await page.reload(); await row(day(3), "8 to 12").waitFor();
  check("the saved block survives reload", await row(day(3), "8 to 12").isVisible());
  await block(day(4), ""); check("whole-day block is distinct from a selected window", (await row(day(4), "").textContent()).includes("Whole day"));
  const beforeError = await page.locator(".availability-row").count();
  await page.route("**/api/client?**", async route => {
    const body = route.request().postDataJSON();
    if (route.request().method() === "POST" && body?.action === "availability_block") { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "availability_unavailable" }) }); }
    else await route.fallback();
  });
  await page.locator("#availabilityDate").fill(day(5)); await page.getByRole("button", { name: "Block time", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#availabilityMessage").textContent.includes("could not be saved"));
  check("a failed save never clears recorded blocks or claims success", await page.locator(".availability-row").count() === beforeError);
  check("the owner can retry after a failed save", await page.locator("#availabilitySubmit").isEnabled());
  await page.unroute("**/api/client?**");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload(); await row(day(4), "").waitFor();
  await page.screenshot({ path: `${prefix}-mobile.png`, fullPage: true }); report.screenshots.push(`${prefix}-mobile.png`);
  check("the mobile page has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check("the block action is at least 44 pixels high", (await page.locator("#availabilitySubmit").boundingBox()).height >= 44);
  await row(day(3), "8 to 12").getByRole("button", { name: "Remove block" }).click();
  await row(day(3), "8 to 12").waitFor({ state: "detached" });
  check("removing one block preserves another date's block", await row(day(4), "").isVisible());
  await row(day(4), "").getByRole("button", { name: "Remove block" }).click();
  await page.getByText("No time blocked.", { exact: true }).waitFor();
  check("all saved blocks can be removed from the mobile owner workflow", await page.locator(".availability-row").count() === 0);
  check("no browser JavaScript errors", report.browserErrors.length === 0);
  report.result = "passed";
} catch (err) { report.result = "failed"; report.error = String(err.message || err); process.exitCode = 1; }
finally { await browser.close(); report.finishedAt = new Date().toISOString(); writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify({ result: report.result, checks: report.checks.length, error: report.error, evidence: `${prefix}.json` })); }
