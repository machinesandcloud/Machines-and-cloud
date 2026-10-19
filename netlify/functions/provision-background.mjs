// Provisioning, run after the build: a local number with our webhooks, a messaging service, the
// 10DLC registration, the voice assistant, and the owner's forwarding instructions. Every step that
// lacks a key is recorded as "waiting" instead of failing, and Steve is told what is missing.
import { getClient, saveClient, indexClient, put, logEvent } from "./lib/store.mjs";
import { twilioEnabled, a2pEnabled, buyLocalNumber, createMessagingService, addNumberToService, registerA2P } from "./lib/twilio.mjs";
import { vapiEnabled, provisionVoice } from "./lib/vapi.mjs";
import { notifySteve, sendEmail, sendSMS } from "./lib/send.mjs";
import { forwardingInstructions } from "./lib/forwarding.mjs";

export default async (req) => {
  let body; try { body = await req.json(); } catch { return new Response("bad", { status: 400 }); }
  const c = await getClient(body?.slug || "");
  if (!c || c.ownerKey !== body?.key) return new Response("forbidden", { status: 403 });
  const site = process.env.URL || new URL(req.url).origin;
  const notes = [];
  c.phone = c.phone || {};
  c.provision = { status: "running", startedAt: new Date().toISOString(), steps: {} };
  await saveClient(c);

  // 1. Number
  if (!c.phone.twilioNumber) {
    if (twilioEnabled()) {
      try {
        const area = (c.phone.businessNumber || "").replace(/^\+1/, "").slice(0, 3) || "713";
        const n = await buyLocalNumber({ areaCode: area, friendlyName: `${c.business.name} (${c.slug})`, voiceUrl: `${site}/api/voice`, smsUrl: `${site}/api/sms` });
        c.phone.twilioNumber = n.number; c.phone.twilioNumberSid = n.sid; c.provision.steps.number = "done";
        await indexClient(c);
      } catch (err) { c.provision.steps.number = "failed: " + err.message; notes.push("number: " + err.message); }
    } else { c.provision.steps.number = "waiting: Twilio keys"; notes.push("Twilio keys missing, no number bought"); }
  } else c.provision.steps.number = "done";
  await saveClient(c);

  // 2. Messaging service + 10DLC
  if (c.phone.twilioNumber && c.phone.twilioNumberSid && twilioEnabled()) {
    try {
      if (!c.phone.messagingServiceSid) { c.phone.messagingServiceSid = await createMessagingService({ friendlyName: `${c.business.name} (${c.slug})`, inboundUrl: `${site}/api/sms` }); await addNumberToService(c.phone.messagingServiceSid, c.phone.twilioNumberSid); }
      c.provision.steps.messaging = "done";
    } catch (err) { c.provision.steps.messaging = "failed: " + err.message; notes.push("messaging service: " + err.message); }
    const L = c.business.legal || {};
    if (!a2pEnabled()) { c.phone.tenDlc = "waiting_keys"; c.provision.steps.tenDlc = "waiting: primary profile SID"; notes.push("A2P: TWILIO_PRIMARY_PROFILE_SID missing"); }
    else if (!L.ein || !L.street || !L.zip) { c.phone.tenDlc = "needs_business_details"; c.provision.steps.tenDlc = "waiting: EIN and address from the owner"; }
    else if (!c.phone.brandSid) {
      try {
        const r = await registerA2P(c, c.phone.messagingServiceSid);
        Object.assign(c.phone, r, { tenDlc: "brand_pending" }); c.provision.steps.tenDlc = "brand submitted";
      } catch (err) { c.phone.tenDlc = "failed"; c.phone.tenDlcError = err.message.slice(0, 300); c.provision.steps.tenDlc = "failed: " + err.message; notes.push("A2P: " + err.message); }
    }
  }
  await saveClient(c);

  // 3. Voice assistant
  if (c.phone.twilioNumber && !c.voice?.assistantId) {
    if (vapiEnabled()) {
      try {
        const v = await provisionVoice(c, site);
        c.voice = { provider: "vapi", ...v, createdAt: new Date().toISOString() };
        c.phone.voiceForwardTo = ""; // Vapi owns the number's voice webhook now
        await put("index", "vapi:" + v.assistantId, c.slug);
        c.provision.steps.voice = "done";
      } catch (err) { c.provision.steps.voice = "failed: " + err.message; notes.push("voice: " + err.message); }
    } else { c.provision.steps.voice = "waiting: Vapi key (missed-call text-back is on)"; }
  }
  c.provision.status = notes.length ? "partial" : "done";
  c.provision.finishedAt = new Date().toISOString();
  await saveClient(c);
  await logEvent(c.slug, "provisioned", { steps: c.provision.steps });

  // 4. Tell the owner what to do (one thing: forwarding) and Steve what is left.
  const portal = `${site}/desk?c=${c.slug}&k=${c.ownerKey}`;
  const fw = forwardingInstructions(c);
  if (c.phone.twilioNumber) {
    const text = `${c.business.name}: your front desk number is ${c.phone.twilioNumber}. ${fw.short} Portal: ${portal}`;
    if (c.owner.phone) await sendSMS({ to: c.owner.phone, from: c.phone.twilioNumber, body: text });
    await sendEmail({ to: c.owner.email, subject: `Your front desk number: ${c.phone.twilioNumber}`, text: `Your front desk now has its own number: ${c.phone.twilioNumber}.\n\nOne step is yours, and it takes a minute: turn on call forwarding from your phone.\n\n${fw.long}\n\nTexting from this number starts as soon as the carriers approve the business registration (usually a few days; we filed it). Website chat works now: the one-line snippet is on your portal.\n\n${portal}` });
  }
  await notifySteve(`Provisioned: ${c.business.name} (${c.provision.status})`, `${JSON.stringify(c.provision.steps, null, 1)}\n${notes.join("\n")}\n${portal}`);
  return new Response("ok");
};
