// Usage meter: call minutes and customer-facing texts per shop per Houston month, with one owner
// alert at 80 percent and one at 100 percent of the plan. Informational only: nothing pauses at the
// limit and nothing is billed (billing is parked).
import { get, put, logEvent } from "./store.mjs";
import { PLANS } from "./config.mjs";

// Texts that count: the ones customers receive. Owner alerts, escalations, and digests do not.
export const CUSTOMER_TEXT_TYPES = ["reply", "confirmation", "reminder_24h", "reminder_1h", "on_my_way", "text_back", "lead_chase", "review_request", "review_nudge", "quote_check", "payment_reminder", "referral_ask", "fallback_window", "cancelled"];
export const THRESHOLDS = [80, 100];

export const usageMonth = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
export const usageKey = (slug, month = usageMonth()) => `${slug}/${month}`;

export async function getUsage(slug, month = usageMonth()) {
  return (await get("usage", usageKey(slug, month))) || { slug, month, minutes: 0, texts: 0, calls: 0, alerted: {} };
}

export function usageView(c, u) {
  const plan = PLANS[c.plan] || PLANS.growth;
  return { month: u.month, minutes: u.minutes || 0, texts: u.texts || 0, calls: u.calls || 0, included: { minutes: plan.minutes, texts: plan.texts }, overage: { minute: 0.35, text: 0.03 } };
}

/**
 * addUsage(c, { minutes, texts, calls }) -> the month record. Sends the owner one text and one email
 * per threshold per month when minutes or texts cross 80 or 100 percent of the plan.
 */
export async function addUsage(c, { minutes = 0, texts = 0, calls = 0 } = {}) {
  const u = await getUsage(c.slug);
  u.minutes = (u.minutes || 0) + minutes; u.texts = (u.texts || 0) + texts; u.calls = (u.calls || 0) + calls;
  u.alerted = u.alerted || {}; u.updatedAt = new Date().toISOString();
  const plan = PLANS[c.plan] || PLANS.growth;
  const crossed = [];
  for (const kind of ["minutes", "texts"]) {
    const included = plan[kind]; if (!included) continue;
    for (const t of THRESHOLDS) {
      const k = `${kind}${t}`;
      if (!u.alerted[k] && u[kind] >= included * t / 100) { u.alerted[k] = new Date().toISOString(); crossed.push({ kind, threshold: t, used: u[kind], included }); }
    }
  }
  await put("usage", usageKey(c.slug, u.month), u);
  for (const x of crossed) {
    const { notifyOwner } = await import("./send.mjs");
    const what = x.kind === "minutes" ? "call minutes" : "texts";
    const rate = x.kind === "minutes" ? "$0.35 a minute" : "$0.03 a text";
    const body = x.threshold >= 100
      ? `${c.business?.name}: you've used all of this month's ${what} (${x.used} of ${x.included}). Past the plan it is ${rate}; nothing changes on the line.`
      : `${c.business?.name}: you've used ${x.threshold} percent of this month's ${what} (${x.used} of ${x.included}). Past the plan it is ${rate}; nothing changes on the line.`;
    try { await notifyOwner(c, body, { type: "usage" }); } catch (e) { console.error("usage alert", e); }
    await logEvent(c.slug, "usage_alert", { threshold: x.threshold, kind: x.kind, used: x.used, included: x.included, month: u.month });
  }
  return u;
}
