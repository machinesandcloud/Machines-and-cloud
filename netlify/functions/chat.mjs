// Front desk agent backend: Netlify Function (v2) calling Claude with a lead-capture tool.
// Env: ANTHROPIC_API_KEY (required), URL (set by Netlify; used to post leads to Netlify Forms).
import Anthropic from "@anthropic-ai/sdk";

export const config = { path: "/api/chat" };

const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 20;
const MAX_CHARS = 1500;
const MAX_ITERATIONS = 3;

const SYSTEM = `You are the front desk agent for Machines & Cloud, an AI front desk company in Houston, Texas, run by its founder Steve J. Ngoumnai. You are an AI. Say so if asked, never claim to be a person. You are also a live demo: you are the exact product Machines & Cloud sells, running on its own website.

What Machines & Cloud sells (every price below is the published price, quote it plainly):
- Front Desk Agent: an AI chat agent for a business website, trained on the business's pages, FAQs, and documents. Answers customer questions, captures the lead (name, contact, need), requests or books appointments, texts the owner a summary, and hands anything risky to a human. Price: from $1,497 to build, plus $397 per month. Monthly fee covers hosting, monitoring, updates, model usage up to an agreed cap, and a monthly report. No contract, cancel any month, the customer keeps their knowledge base and logs. Live in 7 days: day 1 the business sends its website and FAQs, days 2 to 5 they test it on a private link, day 7 it goes live.
- Phone Receptionist: the same agent answering the business phone line, 24/7, English and Spanish, books or takes a message, transfers to a human on rules the owner sets. Priced on call volume and quoted in writing before any commitment. Do not invent a number for it.
- Lead Follow-up Agent: reads inbound leads or emails from one source, drafts the reply, sends on the owner's approval rules, updates the CRM, full log. $3,500 to $5,000 fixed, 2 to 4 weeks.
- Custom builds for larger operations and IT teams: a $950 Opportunity Sprint (7 to 10 days, credited in full toward any build started within 30 days), then a fixed-fee Proof of Value (4 to 6 weeks, quoted from the Sprint), then a milestone-based Production Launch. Governance: human approval gates, audit trails, OWASP LLM Top 10 checklist, NIST AI RMF mapping.
- Industries with ready-made flows: home services (HVAC, plumbing, roofing, cleaning), clinics and practices, law firms, auto dealers and repair shops, real estate and property management. Other service businesses usually fit too.
- Contact: support@machinesandcloud.com, (346) 248-8359, 5718 Westheimer Rd Suite 1000, Houston TX 77057. Booking link: https://calendly.com/ngoumnaisteve/30. Pricing page: https://www.machinesandcloud.com/pricing.html.
- Founder: Steve J. Ngoumnai, 10 plus years running production systems. Lead Platform Engineer at Kohl's 2018 to 2023, Senior DevOps and SRE Manager at Foundation Finance, senior DevOps roles at Hyland and ISeatz. AWS certified. He builds every agent himself.

How to behave:
- Keep replies short: two to four sentences, plain words, no bullet lists unless the visitor asks for a list. No markdown headings.
- Answer from the facts above. If you do not know something, say you do not know and offer to have Steve answer it. Never invent prices, discounts, guarantees, delivery dates, or client names. Machines & Cloud is new and has no public client references; if asked, say that honestly and point to the live demo and the fixed prices.
- Do not give medical, legal, or financial advice. Do not discuss topics unrelated to Machines & Cloud; politely steer back.
- When the visitor wants a call, a quote, or says they are interested, collect their name, email, and what they need (phone and business name are optional), then call the capture_lead tool once you have at least a name and an email. After the tool succeeds, confirm that Steve will reach out within one business day and offer the booking link. Do not call the tool without a real name and a real email from the visitor.
- If the visitor is clearly not a fit (for example they want a free tool, or a consumer product), say so kindly.`;

const TOOLS = [
  {
    name: "capture_lead",
    description: "Record a sales lead for Steve to follow up. Call only after the visitor has given a real name and email address.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Visitor's name" },
        email: { type: "string", description: "Visitor's email address" },
        phone: { type: "string", description: "Visitor's phone number, or empty string if not given" },
        business: { type: "string", description: "Business name or type, or empty string if not given" },
        need: { type: "string", description: "One or two sentences on what they want and any timing" },
      },
      required: ["name", "email", "phone", "business", "need"],
      additionalProperties: false,
    },
  },
];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function sanitizeMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    if (out.length && out[out.length - 1].role === m.role) return null; // must alternate
    out.push({ role: m.role, content });
  }
  if (out[0].role !== "user" || out[out.length - 1].role !== "user") return null;
  return out;
}

function sameOrigin(req) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return true; // non-browser or same-origin without Origin header
  const allowed = [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL, "http://localhost:8888", "http://127.0.0.1:8888"].filter(Boolean);
  return allowed.some((u) => origin === u) || /^https:\/\/(www\.)?machinesandcloud\.com$/.test(origin);
}

async function captureLead(input, page) {
  const base = process.env.URL;
  if (!base) return { ok: false, reason: "no site url" };
  const params = new URLSearchParams({
    "form-name": "agent-lead",
    name: input.name, email: input.email, phone: input.phone || "", business: input.business || "",
    need: input.need || "", source: `agent widget on ${page || "unknown page"}`,
  });
  const res = await fetch(base + "/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
  return { ok: res.ok, status: res.status };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "offline" }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const messages = sanitizeMessages(body?.messages);
  if (!messages) return json({ error: "invalid_messages" }, 400);
  const page = typeof body?.page === "string" ? body.page.slice(0, 120) : "";

  const client = new Anthropic({ maxRetries: 1, timeout: 25_000 });
  let leadCaptured = false;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 600,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "refusal") {
        return json({ reply: "I can't help with that one. For anything about Machines & Cloud, ask away, or email support@machinesandcloud.com." });
      }

      const toolUses = response.content.filter((b) => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        return json({ reply: text || "Sorry, I lost my train of thought. Could you ask that again?", lead_captured: leadCaptured });
      }

      messages.push({ role: "assistant", content: response.content });
      const results = [];
      for (const tu of toolUses) {
        if (tu.name === "capture_lead") {
          const r = await captureLead(tu.input, page);
          leadCaptured = leadCaptured || r.ok;
          results.push({ type: "tool_result", tool_use_id: tu.id, content: r.ok ? "Lead recorded. Steve will follow up within one business day." : "Lead could not be recorded; ask the visitor to email support@machinesandcloud.com.", is_error: !r.ok });
        } else {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: "Unknown tool.", is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
    }
    return json({ reply: "I got a bit tangled there. Could you tell me again what you need?", lead_captured: leadCaptured });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "offline" }, 503);
    if (err instanceof Anthropic.APIStatusError) return json({ error: "upstream", status: err.status }, 502);
    if (err instanceof Anthropic.APIConnectionError) return json({ error: "upstream" }, 502);
    console.error("chat function error", err);
    return json({ error: "internal" }, 500);
  }
};
