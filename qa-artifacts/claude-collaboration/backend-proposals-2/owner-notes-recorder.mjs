// Wraps the copy's own fake model (MC_FAKE_MODEL=1) and records the system prompt of every request.
const real = await import(new URL(import.meta.url).searchParams.get("real"));
globalThis.__ownerNotesCaptures ||= [];
const text = (system) => (Array.isArray(system) ? system.map((b) => b.text).join("\n") : String(system || ""));
export function fakeClient() {
  const base = real.fakeClient();
  const record = (req) => globalThis.__ownerNotesCaptures.push(text(req.system));
  return {
    ...base,
    messages: { ...base.messages, create: async (req) => { record(req); return base.messages.create(req); } },
    beta: { messages: { ...base.beta.messages, create: async (req) => { record(req); return base.beta.messages.create(req); }, stream: (req) => { record(req); return base.beta.messages.stream(req); } } },
  };
}
