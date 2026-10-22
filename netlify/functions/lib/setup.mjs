// Derived owner readiness. Tutorial clicks and provider keys cannot certify a channel.
import { createHash } from "node:crypto";
import { loopCheck } from "./config.mjs";
export const isSelfServiceClient = c => c?.onboarding?.version === 1;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export function configurationRevision(c) {
  const business = Object.fromEntries(["name", "trade", "city", "serviceArea", "notServed", "hours", "afterHours", "spanish", "licenses"].map(key => [key, c.business?.[key] ?? null]));
  const config = { business, owner: { name: c.owner?.name, phone: c.owner?.phone, backupPhone: c.owner?.backupPhone }, services: c.services, fees: c.fees, windows: c.windows, rules: c.rules, faq: c.faq, summary: c.summary, phone: { businessNumber: c.phone?.businessNumber, forwarding: c.phone?.forwarding, transferTo: c.phone?.transferTo }, widget: c.widget };
  return createHash("sha256").update(JSON.stringify(canonical(config))).digest("hex");
}
export function setupReadiness(c) {
  const revision = configurationRevision(c), blockers = [];
  const issue = (id, label, detail, tab = "know") => ({ id, label, detail, tab });
  if (c.build?.status !== "built") blockers.push(issue("knowledge", "Build your desk", c.build?.status === "failed" ? "The draft build failed. Your answers are saved; retry the build." : "Your draft is not built yet.", "setup"));
  if (!c.business?.name || !c.business?.trade || !c.services?.length || !c.business?.serviceArea?.length || !c.rules?.hours || !c.windows?.length) blockers.push(issue("rules", "Complete your business rules", "Add your business, services, service area, per-day hours and arrival windows."));
  if (!/^\+1\d{10}$/.test(c.owner?.phone || "") || loopCheck(c)) blockers.push(issue("handoff", "Set a safe callback destination", "Add a valid owner cell and correct any forwarding loop."));
  if (c.setupProof?.reviewedRevision !== revision) blockers.push(issue("review", "Review what the desk knows", "Save your review of the current business rules."));
  if (c.setupProof?.testedRevision !== revision || c.setupProof?.testMode !== "live") blockers.push(issue("test", "Try your desk", "Complete a private test with the live AI service using the current rules. Simulated tests cannot activate customer chat.", "test"));
  if (!process.env.ANTHROPIC_API_KEY || process.env.MC_FAKE_MODEL === "1") blockers.push(issue("model", "AI service is unavailable", "Your settings are saved. AI service must be available before customers use this desk.", "setup"));
  const disabled = c.status === "cancelled";
  if (disabled) blockers.push(issue("cancelled", "Service is cancelled", "A cancelled service cannot be resumed here.", "setup"));
  const ready = !blockers.length;
  const web = { ready, active: c.status === "live" && c.channels?.web?.active === true, blockers };
  const pending = channel => ({ ready: false, active: false, blockers: [issue(channel, channel === "voice" ? "Phone setup is not active" : "Text messaging is not active", "Provider setup, customer acceptance and a verified delivery path are required. Website chat can operate separately.", "setup")] });
  const steps = [
    { id: "knowledge", label: "Desk draft", status: c.build?.status === "built" ? "done" : c.build?.status === "failed" ? "needs_attention" : "working", detail: c.build?.notes || "Built from your saved answers.", action: { tab: "know", label: "Review rules" } },
    ...blockers.filter(row => row.id !== "knowledge").map(row => ({ id: row.id, label: row.label, status: row.id === "model" || row.id === "cancelled" ? "needs_attention" : "your_action", detail: row.detail, action: { tab: row.tab, label: row.label } })),
    { id: "voice", label: "Phone", status: "waiting_provider", detail: "Not active. Calls have not been connected or verified.", action: { tab: "setup", label: "View channel setup" } },
    { id: "sms", label: "Text messages", status: "waiting_provider", detail: "Not active. Sender approval and delivery checks are incomplete.", action: { tab: "setup", label: "View channel setup" } },
  ];
  const next = blockers[0];
  const desiredChannels = Array.isArray(c.onboarding?.desiredChannels) ? c.onboarding.desiredChannels : ["web"];
  const channelFacts = [
    { id: "web", label: "Website chat", detail: web.active ? "Customer chat is active on your website." : ready ? "Your current rules are ready to activate on your website." : "Review your business rules and complete a private test before activating customer chat.", nextStep: web.active ? "Open customer chat" : next?.label || "Activate website chat", status: web.active ? "active" : "needs_action" },
    { id: "voice", label: "Phone answering", detail: "Your preference is saved. Phone connection is not available yet; calls have not been routed or tested.", nextStep: "Phone connection will appear here when available", status: "pending_activation" },
    { id: "sms", label: "Text messages", detail: "Your preference is saved. Text messaging is not available yet; sender registration and delivery checks are still required.", nextStep: "Text connection will appear here when available", status: "pending_activation" },
    { id: "calendar", label: "Calendar", detail: "Your preference is saved. Calendar sync is not available yet; no external calendar is connected or updated.", nextStep: "Calendar connection will appear here when available", status: "pending_activation" },
  ];
  const connectionJourney = { title: "Your connections", channels: channelFacts.map(row => ({ ...row, requested: desiredChannels.includes(row.id), status: row.status === "active" || desiredChannels.includes(row.id) ? row.status : "not_selected", ...(!desiredChannels.includes(row.id) && row.status !== "active" ? { detail: "You have not requested this connection.", nextStep: "Choose your connections during setup" } : {}) })) };
  return { version: 1, revision, stage: c.build?.status === "failed" ? "attention" : ["pending", "queued", "running"].includes(c.build?.status) ? "building" : ready ? "ready" : "review", canActivateWeb: ready, steps, channels: { web, voice: pending("voice"), sms: pending("sms") }, connectionJourney, next: next ? { id: next.id, tab: next.tab, label: next.label } : { id: "activate", tab: "setup", label: "Activate website chat" } };
}
