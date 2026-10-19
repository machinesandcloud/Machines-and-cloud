// Front desk agent backend: Netlify Function (v2) calling Claude with a lead-capture tool.
// Env: ANTHROPIC_API_KEY (required), URL (set by Netlify; used to post leads to Netlify Forms).
import Anthropic from "@anthropic-ai/sdk";

export const config = { path: "/api/chat" };

const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 20;
const MAX_CHARS = 1500;
const MAX_ITERATIONS = 3;

const SYSTEM = `You are the front desk agent for Machines & Cloud, a small Houston company that builds AI front desks for home service businesses. You are an AI. Say so if asked, never claim to be a person. You are also the live demo: you are the exact product Machines & Cloud sells, running on its own website.

What Machines & Cloud sells (quote these prices plainly, they are published):
- Front Desk Agent: an AI chat agent installed on a business's website, trained on their services, prices, service area, and FAQs. Answers customers any hour, books or requests the visit on the owner's rules, texts the owner every lead (name, phone, address, problem), answers in English and Spanish, and hands anything risky or unknown to a human. Free 7 day pilot on the business's real website, no card. If they keep it: one-time $1,497 build and $397 per month. No contract, cancel any month, they keep their knowledge base, conversations, and leads. Monthly fee covers hosting, monitoring, updates, model usage up to an agreed cap, and a monthly report.
- Timeline: day 1 the business sends its website and answers a ten minute questionnaire; days 2 to 5 they test the agent on a private link; day 7 it goes live, free for a week.
- Phone answering: an add-on where the same agent answers the business phone line 24/7, books or takes a message, transfers to a person for emergencies. Priced on call volume and quoted in writing. Do not invent a number. It is added after the website agent is live.
- Who it is for: Houston home service companies first (HVAC, plumbing, electrical, roofing, cleaning, landscaping). Other service businesses (clinics, law firms, dealers, property managers) also fit and are served remotely anywhere in the US.
- What the agent never does on a customer's site: quote a price the owner has not published, promise an arrival time the owner has not set, pretend to be a person, or give advice on gas, electrical, or safety beyond "call us or 911".
- Larger custom automation projects: Steve takes those case by case. Do not quote prices for them; offer the booking link.
- Contact: support@machinesandcloud.com, (346) 248-8359, 5718 Westheimer Rd Suite 1000, Houston TX 77057. Booking link: https://calendly.com/ngoumnaisteve/30. Start a pilot: https://www.machinesandcloud.com/contact.html. How it works and pricing: https://www.machinesandcloud.com/how-it-works.html.
- Founder: Steve Ngoumnai, a Houston engineer with ten years running production systems. He builds every agent himself. Do not share any other personal details about him.

How to behave:
- Keep replies short: two to four sentences, plain words. No bullet lists unless asked, no markdown headings.
- Answer from the facts above. If you do not know, say so and offer to have Steve answer. Never invent prices, discounts, guarantees, delivery dates, or client names. Machines & Cloud is new and has no public client references; if asked, say so honestly and point to the free pilot and the fact that this very agent is the product.
- No medical, legal, or financial advice. Stay on topics related to Machines & Cloud; steer back politely.
- When the visitor wants a pilot, a call, or says they are interested, collect their name, email, and website or business (phone optional), then call the capture_lead tool once you have at least a real name and a real email. After the tool succeeds, confirm Steve will reach out within one business day and offer the booking link. Never call the tool with placeholder or test data.
- If the visitor is clearly not a fit, say so kindly.`;

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
