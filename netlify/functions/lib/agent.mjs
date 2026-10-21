// The agent loop shared by every mode: streams text, runs tools through execTool, returns the reply.
import Anthropic from "@anthropic-ai/sdk";
import { fakeClient } from "./fake-model.mjs";

export const MODEL = "claude-opus-5-5";
export const MAX_MESSAGES = 20;
export const MAX_CHARS = 1500;
const MAX_ITERATIONS = 3;

export function makeClient() {
  if (process.env.MC_FAKE_MODEL === "1") return fakeClient();
  return new Anthropic({ maxRetries: 1, timeout: 25_000 });
}

export function classifyError(err) {
  if (err instanceof Anthropic.RateLimitError) return { error: "busy", status: 429 };
  if (err instanceof Anthropic.AuthenticationError) return { error: "offline", status: 503 };
  if (err instanceof Anthropic.APIStatusError) return { error: "upstream", status: 502 };
  if (err instanceof Anthropic.APIConnectionError) return { error: "upstream", status: 502 };
  console.error("agent error", err);
  return { error: "internal", status: 500 };
}

export function sanitizeMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    if (out.length && out[out.length - 1].role === m.role) return null;
    out.push({ role: m.role, content });
  }
  if (out[0].role !== "user" || out[out.length - 1].role !== "user") return null;
  return out;
}

// Turns a stored conversation (alternating turns may be broken by system lines) into valid API messages.
export function toApiMessages(stored) {
  const out = [];
  for (const m of stored) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const content = String(m.content || "").trim().slice(0, MAX_CHARS);
    if (!content) continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += "\n" + content;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out.slice(-MAX_MESSAGES);
}

/**
 * runAgent({ system, tools, messages, onText, execTool, maxTokens })
 * execTool(name, input) -> { content: string, is_error?: boolean, event?: object }
 * Returns { reply, events }.
 */
export async function runAgent({ system, tools, messages, onText, execTool, maxTokens = 2000, effort = "low", dropToolPreamble = false }) {
  const client = makeClient();
  const events = [];
  let reply = "";
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });
    let needSep = reply.length > 0 && !/\s$/.test(reply);
    let iterText = "";
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta" && ev.delta.text) {
        const piece = needSep ? " " + ev.delta.text : ev.delta.text;
        needSep = false;
        iterText += piece;
        if (!dropToolPreamble) { reply += piece; if (onText) onText(piece); }
      }
    }
    const response = await stream.finalMessage();
    if (dropToolPreamble) {
      // On text and voice the customer sees one message at the end: keep only the text of the final turn.
      if (response.stop_reason !== "tool_use") { reply += iterText; if (onText) onText(iterText); }
    }
    if (response.stop_reason === "refusal") {
      const t = "I can't help with that one. Anything else, ask away.";
      const piece = (reply ? " " : "") + t; reply += piece; if (onText) onText(piece);
      return { reply: reply.trim(), events };
    }
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      if (!reply.trim()) { reply = "Sorry, could you say that again?"; if (onText) onText(reply); }
      return { reply: reply.trim(), events };
    }
    messages.push({ role: "assistant", content: response.content });
    const results = [];
    for (const tu of toolUses) {
      let r;
      try { r = await execTool(tu.name, tu.input); }
      catch (err) { console.error("tool failed", tu.name, err); r = { content: "The tool failed. Apologize briefly and give the customer the phone number to call.", is_error: true }; }
      if (r?.event) events.push(r.event);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: r?.content || "Done.", is_error: !!r?.is_error });
    }
    messages.push({ role: "user", content: results });
  }
  const tail = "Let me get the owner to pick this up. What is the best number to reach you?";
  const piece = (reply ? " " : "") + tail; reply += piece; if (onText) onText(piece);
  return { reply: reply.trim(), events };
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
}

// Streams runAgent as NDJSON.
export function ndjsonResponse(run, extraHeaders = {}) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const out = await run((text) => send({ t: "delta", text }));
        send({ t: "done", reply: out.reply, events: out.events });
      } catch (err) {
        send({ t: "error", error: classifyError(err).error });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", ...extraHeaders } });
}
