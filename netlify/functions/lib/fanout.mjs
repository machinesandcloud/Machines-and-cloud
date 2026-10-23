// The four sends that go to every live shop at a fixed hour: digest (6 pm), audit (9 pm), weekly (Monday 8 am),
// monthly (the 1st, 9 am). Each is one function so the scheduler can hand it to a background function
// (no synchronous time limit) and tests can run it inline. Every shop is wrapped; one failure never stops the rest.
import { list, getClient, logEvent, get, put } from "./store.mjs";
import { sendSMS, sendEmail, notifySteve } from "./send.mjs";
import { dailyDigest, autoFlagDay, weeklyReport, monthlyReport } from "./desk.mjs";
import { isSelfServiceClient } from "./setup.mjs";

const D = 24 * 3600 * 1000;
const hou = (d = new Date()) => new Date(d.toLocaleString("en-US", { timeZone: "America/Chicago" }));

export const KINDS = ["digest", "autoflag", "weekly", "monthly"];

async function liveShops() {
  const out = [];
  for (const slug of await list("clients", "")) { const c = await getClient(slug); if (c && c.status === "live" && !isSelfServiceClient(c)) out.push(c); }
  return out;
}

export async function fanout(kind) {
  const started = Date.now();
  const result = { kind, shops: 0, done: 0, errors: [] };
  for (const c of await liveShops()) {
    result.shops++;
    try {
      if (kind === "digest") {
        const d = await dailyDigest(c);
        const text = !d.empty && c.digest?.text !== false && c.owner.phone;
        if (text) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "digest", body: d.text });
        if (!d.empty) await sendEmail({ to: c.owner.email, subject: `${c.business.name}: today's front desk`, text: d.email });
        if ((c.liveAt && Date.now() - new Date(c.liveAt).getTime() < 7 * D) || d.steveNote) await notifySteve(`Digest: ${c.business.name}`, d.email + (d.steveNote || ""));
        await logEvent(c, "digest", { text: d.text, empty: !!d.empty, texted: !!text, emailed: !d.empty });
      } else if (kind === "autoflag") {
        await autoFlagDay(c);
      } else if (kind === "weekly") {
        const w = await weeklyReport(c);
        await sendEmail({ to: c.owner.email, subject: w.subject, text: w.text });
        if (c.liveAt && Date.now() - new Date(c.liveAt).getTime() < 28 * D) await notifySteve(`Weekly: ${c.business.name}`, w.text);
        await logEvent(c, "weekly", { empty: !!w.empty, stats: w.stats || null });
      } else if (kind === "monthly") {
        const monthEnd = hou(); monthEnd.setDate(1); monthEnd.setHours(0, 0, 0, 0);
        if (c.liveAt && hou(new Date(c.liveAt)).getTime() > monthEnd.getTime() - D) continue;
        const mth = await monthlyReport(c);
        await sendEmail({ to: c.owner.email, subject: mth.subject, text: mth.text });
        await notifySteve(`Statement: ${c.business.name} (${mth.month})`, `${mth.text}\n\n${mth.invoice}`);
        await logEvent(c, "monthly", { month: mth.month, stats: mth.stats });
      }
      result.done++;
    } catch (err) { console.error("fanout", kind, c.slug, err); result.errors.push({ slug: c.slug, error: String(err?.message || err).slice(0, 200) }); }
  }
  result.ms = Date.now() - started;
  await put("health", `fanout:${kind}:last`, { at: new Date().toISOString(), ...result });
  return result;
}

// Once per Houston day per kind: the stamp is written before the send so a retry inside the window never doubles it.
export async function claimFanout(kind, dateKey) {
  const k = `fanout:${kind}:${dateKey}`;
  if (await get("health", k)) return false;
  await put("health", k, { at: new Date().toISOString() });
  return true;
}
