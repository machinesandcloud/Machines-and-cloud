// Twilio inbound SMS webhook. The "To" number identifies the client. Texts from the owner's phone are
// commands (done/quote/otw/paid/cancel/help); everything else is a customer talking to the front desk.
import { clientByNumber, getConversation, saveConversation, logEvent } from "./lib/store.mjs";
import { runAgent, toApiMessages } from "./lib/agent.mjs";
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER } from "./lib/config.mjs";
import { bookVisit, flagLead, ownerCommand } from "./lib/desk.mjs";
import { sendSMS, twilioSignatureValid, e164 } from "./lib/send.mjs";

export const config = { path: "/api/sms" };

const twiml = (msg) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]))}</Message>` : ""}</Response>`, { status: 200, headers: { "Content-Type": "text/xml" } });

const HELP = 'Commands: "otw <ref>" sends the on-the-way text, "done <ref>" marks the job done and starts the review and payment follow-ups, "quote <ref> <amount>" logs a quote (day-14 check), "paid <ref>", "cancel <ref>". The ref is on each summary text.';

export default async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const sigUrl = (process.env.URL || new URL(req.url).origin) + "/api/sms";
  if (process.env.TWILIO_AUTH_TOKEN && !twilioSignatureValid(sigUrl, params, req.headers.get("x-twilio-signature") || "")) return new Response("bad signature", { status: 403 });

  const to = e164(params.To), from = e164(params.From), body = String(params.Body || "").trim();
  const c = await clientByNumber(to);
  if (!c) return twiml("");
  if (!body) return twiml("");

  // Owner commands
  if (c.owner?.phone && from === c.owner.phone) {
    if (/^help$/i.test(body)) return twiml(HELP);
    const reply = await ownerCommand(c, body);
    if (reply) { await logEvent(c.slug, "owner_command", { body }); return twiml(reply); }
    return twiml(`Did not catch that. ${HELP}`);
  }

  // Customer conversation
  if (!["testing", "live"].includes(c.status)) return twiml(`Thanks for texting ${c.business?.name || "us"}. Please call ${c.phone?.businessNumber || "our main line"} and we will help right away.`);
  if (/^(stop|unsubscribe|cancel|end|quit)$/i.test(body)) return twiml(""); // Twilio handles opt-out; stay silent
  const conv = await getConversation(c.slug, "sms", from);
  conv.messages.push({ role: "user", content: body.slice(0, 1500), at: new Date().toISOString() });
  const history = toApiMessages(conv.messages);
  const execTool = async (name, input) => {
    if (name === "book_visit") { const b = await bookVisit(c, { ...input, phone: input.phone || from }, { channel: "sms", contact: from }); return { content: `Booked. Ref ${b.id}.`, event: { type: "booking", id: b.id } }; }
    if (name === "notify_owner") { const l = await flagLead(c, { ...input, phone: input.phone || from }, { channel: "sms", contact: from }); return { content: `Owner texted. Ref ${l.id}.`, event: { type: "lead", id: l.id } }; }
    return { content: "Unknown tool.", is_error: true };
  };
  let reply, done = "";
  try {
    const out = await runAgent({ system: buildSystemPrompt(c, "sms"), tools: [BOOK_VISIT, NOTIFY_OWNER], messages: history, execTool, maxTokens: 1200 });
    reply = out.reply;
    done = (out.events || []).map((e) => e.type === "booking" ? `[Done: visit booked, ref ${e.id}]` : e.type === "lead" ? `[Done: owner notified, ref ${e.id}]` : "").filter(Boolean).join(" ");
  } catch (err) {
    console.error("sms agent failed", err);
    reply = `Sorry, I had trouble with that. Please call ${c.phone?.businessNumber || "us"} and a person will help.`;
  }
  conv.messages.push({ role: "assistant", content: done ? reply + "\n" + done : reply, at: new Date().toISOString() });
  await saveConversation(conv);
  await logEvent(c.slug, "sms_reply", { from });
  // Twilio delivers the <Message> body as the reply; long replies are split by Twilio.
  return twiml(reply.slice(0, 1200));
};

export { sendSMS };
