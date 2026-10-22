// The private owner's rehearsal has no route to real shop tools or delivery providers.
// It writes only labeled test history and a revision-bound setup receipt.
import { runAgent, toApiMessages } from "./agent.mjs";
import { atomicUpdate, id } from "./store.mjs";
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, GET_AVAILABILITY } from "./config.mjs";
import { addDays, isElapsedWindow, listedWindow, listedWindows, requestedDate } from "./availability.mjs";
import { configurationRevision } from "./setup.mjs";

const PREFIX = "Test preview: ";
const clean = (value, limit = 300) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const previewPhone = (value) => {
  const digits = clean(value, 30).replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : "";
};
const testKey = (slug, contact) => `${slug}/${contact}`;

export function ownerTestAvailability(client, input) {
  const from = requestedDate(input?.date);
  const days = input?.days;
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("Choose 1 to 14 test dates.");
  return {
    simulation: true,
    notice: "Test windows only. This does not inspect or reserve actual capacity or an external calendar.",
    timezone: "America/Chicago", from, days,
    openings: Array.from({ length: days }, (_, n) => addDays(from, n)).map((date) => ({
      date, windows: listedWindows(client).filter((window) => !isElapsedWindow(date, window)),
    })),
  };
}

export function ownerTestTool(client, name, input) {
  try {
    if (name === "get_availability") return { content: JSON.stringify(ownerTestAvailability(client, input)) };
    if (name === "book_visit") {
      const date = requestedDate(input?.date), window = listedWindow(client, input?.window);
      const data = {
        customer_name: clean(input?.customer_name, 120), phone: previewPhone(input?.phone),
        address: clean(input?.address), issue: clean(input?.issue), date, window,
        urgency: clean(input?.urgency, 30), language: input?.language === "es" ? "es" : "en",
        notes: clean(input?.notes), unsure: clean(input?.unsure),
      };
      if (!data.customer_name || !data.phone || !data.address || !data.issue || !window || isElapsedWindow(date, window)) {
        return { content: "Nothing was booked, including in this test. Ask for the missing contact, address, issue or a valid listed future window.", is_error: true };
      }
      if (data.urgency === "emergency") return { content: "Nothing was booked. Give the safety instructions first and preview a human handoff; never book a safety emergency.", is_error: true };
      const event = { type: "test_booking", id: `test-${id(5)}`, simulation: true, data };
      return { content: `TEST ONLY: visit preview saved, ref ${event.id}. No actual appointment, capacity reservation, calendar event, reminder, text or owner notification was created. Describe what would happen in the test, not an action that really happened.`, event };
    }
    if (name === "notify_owner") {
      const reasons = ["lead", "handoff", "emergency", "question", "wants_call", "spam"];
      if (!reasons.includes(input?.reason)) return { content: "Choose a valid test handoff reason.", is_error: true };
      const data = {
        customer_name: clean(input?.customer_name, 120), phone: previewPhone(input?.phone),
        address: clean(input?.address), issue: clean(input?.issue),
        reason: input.reason, urgency: clean(input?.urgency, 30), wanted: clean(input?.wanted),
        language: input?.language === "es" ? "es" : "en", unsure: clean(input?.unsure),
      };
      const event = { type: "test_lead", id: `test-${id(5)}`, simulation: true, data };
      return { content: `TEST ONLY: ${data.reason === "spam" ? "spam" : "owner request"} preview saved, ref ${event.id}. No one was contacted, no actual lead was changed and no callback, alert, reminder or escalation was scheduled. Safety guidance must still lead the final test reply.`, event };
    }
    return { content: "That tool is not available in the private test.", is_error: true };
  } catch {
    return { content: "Nothing was booked or sent. Check the test input and use a real future date and a listed window.", is_error: true };
  }
}

export async function runOwnerTest({ client, contact, messages, onText }) {
  const revision = configurationRevision(client);
  const key = testKey(client.slug, contact);
  const prior = await atomicUpdate("owner_tests", key, (state) => ({ result: state }));
  const last = messages[messages.length - 1];
  const currentMessages = [...(prior?.messages || []), { role: "user", content: last.content, at: new Date().toISOString() }];
  let prefixSent = false;
  const forward = onText ? (text) => {
    if (!prefixSent) { onText(PREFIX); prefixSent = true; }
    onText(text);
  } : undefined;
  const system = `${buildSystemPrompt(client, "test")}\n\nPRIVATE OWNER REHEARSAL: This is a simulation with made-up customer details. All tool outcomes are test previews only. Never claim an actual appointment, capacity reservation, text, email, call, calendar write or owner notification happened. Explain a preview as what the desk would do. Test availability uses configured example windows, not actual remaining capacity or an external calendar. Keep the exact shop prices, area, safety and handoff rules. Required safety instructions must still begin the final reply. No test can make a provider or delivery channel ready.`;
  const tools = [BOOK_VISIT, NOTIFY_OWNER, GET_AVAILABILITY].map((tool) => ({
    ...tool, description: tool.name === "get_availability" ? `PRIVATE TEST PREVIEW ONLY. ${tool.description}` : "PRIVATE TEST PREVIEW ONLY: save a labeled preview in the isolated test history. No actual booking, contact, text, call, calendar write or reservation happens.",
  }));
  let toolFailed = false;
  const testMode = process.env.MC_FAKE_MODEL === "1" ? "fake" : "live";
  const out = await runAgent({ system, tools, messages: toApiMessages(currentMessages), onText: forward,
    execTool: async (name, input) => {
      const result = ownerTestTool(client, name, input);
      if (result.is_error) toolFailed = true;
      return result;
    }, maxTokens: 1500, dropToolPreamble: true });
  const reply = PREFIX + out.reply;
  const completedAt = new Date().toISOString();
  const test = {
    slug: client.slug, contact, simulation: true, testMode, revision, updatedAt: completedAt,
    messages: [...currentMessages, { role: "assistant", content: reply, at: completedAt }].slice(-40),
    previews: [...(prior?.previews || []), ...out.events].slice(-30),
  };
  await atomicUpdate("owner_tests", key, () => ({ value: test }));
  // A stale test must not certify newer owner rules. Preserve every unrelated client field.
  const proofRecorded = await atomicUpdate("clients", client.slug, (current) => {
    if (toolFailed || !current || current.ownerKey !== client.ownerKey || configurationRevision(current) !== revision) return { result: false };
    return { value: { ...current, setupProof: { ...current.setupProof, testedRevision: revision, testedAt: completedAt, testMode } }, result: true };
  });
  return { reply, events: out.events, simulation: true, test: { revision, completedAt, proofRecorded, testMode } };
}
