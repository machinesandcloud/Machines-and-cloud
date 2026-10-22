// SDK transport fixtures: validates sales-only reasoning/delivery limits, not semantic intelligence.
import assert from 'node:assert/strict';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
process.env.MC_FAKE_MODEL = '0'; process.env.ANTHROPIC_API_KEY = 'offline-fixture'; process.env.ANTHROPIC_BASE_URL = 'https://sales-agent-fixture.invalid';
let responses = [], requests = [], checks = 0;
const check = (name, condition) => { assert.ok(condition, name); checks++; };
globalThis.fetch = async (input, init) => {
  const url = new URL(String(typeof input === 'string' || input instanceof URL ? input : input.url));
  assert.equal(url.origin, 'https://sales-agent-fixture.invalid');
  requests.push(JSON.parse(init.body));
  const next = responses.shift(); assert.ok(next, 'unexpected SDK attempt');
  if (next.httpError) return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Fixture unavailable' } }), { status: 500, headers: { 'content-type': 'application/json' } });
  const content = next.content || [{ type: 'text', text: next.text || 'A complete answer.' }];
  const events = [{ type: 'message_start', message: { id: 'fixture-' + requests.length, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 21, output_tokens: 0, cache_read_input_tokens: 4, cache_creation_input_tokens: 3 } } }];
  content.forEach((block, index) => {
    events.push({ type: 'content_block_start', index, content_block: block.type === 'tool_use' ? { ...block, input: {} } : block.type === 'text' ? { type: 'text', text: '' } : block });
    if (block.type === 'text') events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } });
    if (block.type === 'tool_use') events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
    events.push({ type: 'content_block_stop', index });
  });
  events.push({ type: 'message_delta', delta: { stop_reason: next.stop || 'end_turn', stop_sequence: null }, usage: { output_tokens: 13 } }, { type: 'message_stop' });
  return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
};
const { runAgent } = await import('../netlify/functions/lib/agent.mjs');
const tools = [{ name: 'check_fit', input_schema: { type: 'object', properties: {}, additionalProperties: false } }];
const options = { system: 'Sales fixture', tools, messages: [{ role: 'user', content: 'Check my workflow.' }], adaptiveThinking: true, effort: 'medium', maxTokens: 3072, maxIterations: 3, requireComplete: true, includeUsage: true, maxRetries: 0, dropToolPreamble: true, exhaustedReply: 'I could not finish reliably. Nothing was sent.' };
let delivered = [], executions = 0;
responses = [
  { stop: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: 'fixture-signature' }, { type: 'text', text: 'Unverified planning text must stay private.' }, { type: 'tool_use', id: 'fit1', name: 'check_fit', input: {} }] },
  { text: 'Website chat fits; live phone setup is separate.' }
];
const result = await runAgent({ ...options, onText: t => delivered.push(t), execTool: async () => { executions++; return { content: 'Only website chat fits.', event: { type: 'sales_fit', data: { fit: 'current_fit' } } }; } });
check('Only verified final text is delivered', delivered.join('') === result.reply && !result.reply.includes('Unverified'));
check('A tool executes once and its result is available to final turn', executions === 1 && requests[1].messages.at(-1).content[0].content.includes('Only website'));
check('Reasoning configuration is sales opt-in and stable', requests.every(r => r.thinking.type === 'adaptive' && r.output_config.effort === 'medium' && r.max_tokens === 3072));
check('Thinking signature remains in tool history, not visible reply', requests[1].messages[1].content[0].signature === 'fixture-signature' && !result.reply.includes('fixture-signature'));
check('Usage counts every intercepted model iteration', result.usage.requests === 2 && result.usage.inputTokens === 42 && result.usage.outputTokens === 26 && result.usage.cacheReadTokens === 8 && result.usage.cacheWriteTokens === 6);
check('Only actual executed tools create events', result.events.length === 1 && result.events[0].type === 'sales_fit');
responses = [{ text: 'Incomplete promise', stop: 'max_tokens' }]; delivered = [];
await assert.rejects(runAgent({ ...options, messages: [{ role: 'user', content: 'Long request' }], onText: t => delivered.push(t), execTool: async () => ({ content: 'No action.' }) }), /did not complete/); checks++;
check('Truncated model reply never becomes a complete sales answer', delivered.length === 0);
responses = Array.from({ length: 3 }, (_, i) => ({ stop: 'tool_use', content: [{ type: 'tool_use', id: 'loop' + i, name: 'check_fit', input: {} }] }));
const countBefore = requests.length;
const exhausted = await runAgent({ ...options, messages: [{ role: 'user', content: 'Loop fixture' }], execTool: async () => ({ content: 'Another fixture.' }) });
check('Sales loop has at most three model calls', requests.length - countBefore === 3 && responses.length === 0);
check('Exhaustion does not invent an owner callback', exhausted.reply === options.exhaustedReply && !exhausted.reply.includes('owner to pick'));
responses = [{ text: 'Legacy answer.' }];
const legacy = await runAgent({ system: 'Legacy fixture', tools: [], messages: [{ role: 'user', content: 'Hello' }], execTool: async () => ({ content: 'Unused' }) });
check('Unrelated modes retain their default reasoning/token contract', requests.at(-1).output_config.effort === 'low' && requests.at(-1).max_tokens === 2000 && !Object.hasOwn(requests.at(-1), 'thinking'));
check('Usage metadata is opt-in, not added to legacy replies', legacy.reply === 'Legacy answer.' && !Object.hasOwn(legacy, 'usage'));
responses = [{ httpError: true }]; const errorBefore = requests.length;
await assert.rejects(runAgent({ ...options, messages: [{ role: 'user', content: 'HTTP failure' }], execTool: async () => ({ content: 'Unused' }) })); checks++;
check('Sales HTTP failure has no automatic paid retry', requests.length - errorBefore === 1);
console.log(JSON.stringify({ checks, passed: checks, interceptedModelRequests: requests.length, realExternalRequests: 0, scope: 'SDK fixtures only, not model-quality evidence' }));
