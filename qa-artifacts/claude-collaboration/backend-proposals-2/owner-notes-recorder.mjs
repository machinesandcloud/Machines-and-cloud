// Wraps the copy's own fake model (MC_FAKE_MODEL=1) and records the system prompt and the first
// user message of every request.
const real = await import(new URL(import.meta.url).searchParams.get("real"));
globalThis.__ownerNotesCaptures ||= [];
const text = (x) => (Array.isArray(x) ? x.map((b) => b.text ?? "").join("\n") : String(x ?? ""));
export function fakeClient() {
  const base = real.fakeClient();
  const record = (req) => globalThis.__ownerNotesCaptures.push({ system: text(req.system), user: text(req.messages?.[0]?.content) });
  return {
    ...base,
    messages: { ...base.messages, create: async (req) => { record(req); return base.messages.create(req); } },
    beta: { messages: { ...base.beta.messages, create: async (req) => { record(req); return base.beta.messages.create(req); }, stream: (req) => { record(req); return base.beta.messages.stream(req); } } },
  };
}
