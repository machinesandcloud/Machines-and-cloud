// Deterministic sales calculations/contracts; no assertion here establishes AI conversational quality.
import assert from 'node:assert/strict';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const deny = () => { throw new Error('Network disabled by sales-desk-check'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = globalThis.fetch = deny;
syncBuiltinESMExports();
const { estimateCallVolume, adjacentPlanBreakpoints, assessWorkflowFit, suggestNextStep, sanitizeSalesMessages, executeSalesTool, SALES_FACTS, SALES_TOOLS, salesSystem } = await import('../netlify/functions/lib/sales-desk.mjs');
const cases = [];
function check(name, fn) { fn(); cases.push(name); }
const input = { call_count: 18, period: 'day', count_kind: 'total', routing: 'unknown', average_minutes: 3, workdays_per_month: 22, missed_percent: null, routed_percent: null };
// Match the documented strict subset before any paid request, rather than letting an SDK
// response fixture silently accept the provider's known 400-triggering request shape.
// https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations
function supportedSalesSchema(schema) {
  const supported = new Set(['type', 'description', 'properties', 'items', 'required', 'additionalProperties', 'enum']);
  assert.ok(schema && typeof schema === 'object' && !Array.isArray(schema));
  for (const key of Object.keys(schema)) assert.ok(supported.has(key), 'Unsupported strict sales schema keyword: '+key);
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
    for (const child of Object.values(schema.properties)) supportedSalesSchema(child);
  } else if (schema.type === 'array') supportedSalesSchema(schema.items);
}
check('Every sales wire schema stays in the supported strict subset', () => {
  for (const tool of SALES_TOOLS) { assert.equal(tool.strict, true); supportedSalesSchema(tool.input_schema); }
  const props = SALES_TOOLS[0].input_schema.properties;
  assert.deepEqual(props.average_minutes.type, ['number', 'null']);
  assert.match(props.average_minutes.description, /0\.1 to 120/);
  assert.match(SALES_TOOLS[1].input_schema.properties.required_features.description, /14/);
});
check('Offline wire guard rejects the numeric and array bounds that caused provider400', () => {
  for (const keyword of ['minimum', 'maximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems']) assert.throws(() => supportedSalesSchema({ type: keyword === 'maxItems' ? 'array' : 'number', [keyword]: 14 }), /Unsupported strict sales schema keyword/);
  const nested = structuredClone(SALES_TOOLS[0].input_schema); nested.properties.average_minutes.maximum = 120;
  assert.throws(() => supportedSalesSchema(nested), /maximum/);
});
check('Removing wire bounds preserves inclusive numeric limits in the executor', () => {
  assert.equal(estimateCallVolume({ ...input, call_count: 100000, average_minutes: 120, workdays_per_month: 31 }).totalMinutes, 372000000);
  assert.equal(estimateCallVolume({ ...input, average_minutes: 0.1, missed_percent: 100, routing: 'selected_share', routed_percent: 100 }).routedMinutes, 39.6);
  for (const [field, value] of [['call_count', 100001], ['call_count', null], ['average_minutes', 120.01], ['workdays_per_month', 0], ['missed_percent', 101], ['routed_percent', -1]]) assert.throws(() => estimateCallVolume({ ...input, [field]: value }));
});
check('Removing maxItems preserves the fourteen-entry runtime cap in either feature array', () => {
  for (const key of ['required_features', 'interested_features']) {
    const valid = { required_features: [], interested_features: [], [key]: Array(14).fill('website_chat') };
    assert.ok(assessWorkflowFit(valid));
    assert.throws(() => assessWorkflowFit({ ...valid, [key]: Array(15).fill('website_chat') }), /invalid_features/);
    const rejected = executeSalesTool('assess_workflow_fit', { ...valid, [key]: Array(15).fill('website_chat') });
    assert.equal(rejected.is_error, true); assert.equal(rejected.event, undefined);
  }
});
check('Total volume is1188 minutes without invented missed/routed volume or plan', () => { const x = estimateCallVolume(input); assert.equal(x.totalMinutes, 1188); assert.equal(x.routedMinutes, null); assert.equal(x.missedMinutes, null); assert.equal(x.lowestPublishedCallCostPlan, null); assert.deepEqual(x.planComparison, []); });
check('Unknown AI coverage gives no hypothetical all-call recommendation or breakpoints', () => { const x = estimateCallVolume(input); assert.equal(x.input.routing, 'unknown'); assert.equal(x.unroundedMinutes.routed, null); assert.deepEqual(x.planBreakpoints, []); assert.deepEqual(x.lowestPublishedCallCostPlans, []); assert.ok(x.missing[0].includes('Which calls')); });
check('Adjacent plan breakpoints expose exact rational ties and first cheaper whole minutes', () => {
  const x = adjacentPlanBreakpoints(); assert.equal(x.length, 2);
  assert.deepEqual(x.map(row => [row.lowerPlan, row.higherPlan]), [['starter', 'growth'], ['growth', 'pro']]);
  assert.deepEqual(x[0].exactTieMinutes, { numerator: 4050, denominator: 7 });
  assert.deepEqual(x[1].exactTieMinutes, { numerator: 8200, denominator: 7 });
  assert.equal(x[0].firstWholeMinuteHigherPlanCheaper, 579); assert.equal(x[1].firstWholeMinuteHigherPlanCheaper, 1172);
  assert.equal(x[0].tieCallCost, 249); assert.equal(x[1].tieCallCost, 449);
  assert.equal(x[0].approximateTieMinutes, 4050 / 7); assert.equal(x[1].approximateTieMinutes, 8200 / 7);
});
const minutesEstimate = minutes => estimateCallVolume({ ...input, call_count: minutes, period: 'month', count_kind: 'routed', average_minutes: 1 });
check('The lower plan wins just before each whole-minute breakpoint, and the higher just after', () => {
  assert.equal(minutesEstimate(578).lowestPublishedCallCostPlan, 'starter'); assert.equal(minutesEstimate(579).lowestPublishedCallCostPlan, 'growth');
  assert.equal(minutesEstimate(1171).lowestPublishedCallCostPlan, 'growth'); assert.equal(minutesEstimate(1172).lowestPublishedCallCostPlan, 'pro');
  const at600 = minutesEstimate(600); assert.equal(at600.planComparison[0].projectedCallCost, 256.5); assert.equal(at600.planComparison[1].projectedCallCost, 249);
});
check('Exact fractional ties identify both co-lowest plans', () => {
  assert.deepEqual(minutesEstimate(4050 / 7).lowestPublishedCallCostPlans, ['starter', 'growth']);
  assert.deepEqual(minutesEstimate(8200 / 7).lowestPublishedCallCostPlans, ['growth', 'pro']);
});
check('Display rounding cannot make a more expensive plan the recommendation', () => {
  const x = minutesEstimate(578.575); assert.equal(x.routedMinutes, 578.58); assert.equal(x.unroundedMinutes.routed, 578.575);
  assert.equal(x.planComparison[0].projectedCallCost, x.planComparison[1].projectedCallCost);
  assert.ok(x.planComparison[0].unroundedCallCost > x.planComparison[1].unroundedCallCost);
  assert.equal(x.lowestPublishedCallCostPlan, 'growth'); assert.match(x.estimationBasis, /not an invoice/);
});
check('Breakpoints are computed from supplied plan/rate facts rather than fixed allowances', () => {
  const plans = [{ id: 'small', monthly: 10, includedCallMinutes: 100 }, { id: 'large', monthly: 15, includedCallMinutes: 200 }];
  const x = adjacentPlanBreakpoints(plans, 0.10)[0]; assert.deepEqual(x.exactTieMinutes, { numerator: 150, denominator: 1 }); assert.equal(x.firstWholeMinuteHigherPlanCheaper, 151);
  const equalSlope = adjacentPlanBreakpoints([{ ...plans[0] }, { ...plans[1], monthly: 20 }], 0.10)[0];
  assert.equal(equalSlope.higherPlanEverStrictlyCheaper, false); assert.equal(equalSlope.firstWholeMinuteHigherPlanCheaper, null); assert.deepEqual(equalSlope.exactTieMinutes, { numerator: 200, denominator: 1 });
  const never = adjacentPlanBreakpoints([{ ...plans[0] }, { ...plans[1], monthly: 30 }], 0.10)[0]; assert.equal(never.exactTieMinutes, null); assert.equal(never.firstWholeMinuteHigherPlanCheaper, null);
});
check('Explicit quarter routed is297 without equating missed share', () => { const x = estimateCallVolume({ ...input, routing: 'selected_share', routed_percent: 25 }); assert.equal(x.totalMinutes, 1188); assert.equal(x.routedMinutes, 297); assert.equal(x.missedMinutes, null); assert.equal(x.lowestPublishedCallCostPlan, 'starter'); assert.equal(x.planComparison[0].projectedCallCost, 150.45); });
check('Known missed share remains separate from chosen routed share', () => { const x = estimateCallVolume({ ...input, missed_percent: 10, routing: 'selected_share', routed_percent: 25 }); assert.equal(x.missedMinutes, 118.8); assert.equal(x.routedMinutes, 297); });
check('All calls coverage is explicit, lowest cost includes overages', () => { const x = estimateCallVolume({ ...input, routing: 'all_calls' }); assert.equal(x.routedMinutes, 1188); assert.equal(x.lowestPublishedCallCostPlan, 'pro'); assert.equal(x.planComparison[0].projectedCallCost, 462.3); assert.equal(x.planComparison[1].projectedCallCost, 454.8); });
check('Correction30 missed weekly→3 monthly discards the old period/count', () => { const first = estimateCallVolume({ ...input, call_count: 30, period: 'week', count_kind: 'missed', routing: 'missed_only' }); const corrected = estimateCallVolume({ ...input, call_count: 3, period: 'month', count_kind: 'missed', routing: 'missed_only' }); assert.equal(first.routedMinutes, 390); assert.equal(corrected.routedMinutes, 9); assert.equal(corrected.totalMinutes, null); assert.equal(corrected.monthlyCount, 3); });
check('Missed count cannot establish all-call volume', () => { const x = estimateCallVolume({ ...input, count_kind: 'missed', routing: 'all_calls' }); assert.equal(x.totalMinutes, null); assert.equal(x.routedMinutes, null); assert.ok(x.missing.length); });
check('Nullable assumptions are disclosed and measured workdays take precedence', () => { const x = estimateCallVolume({ ...input, average_minutes: null, workdays_per_month: null }); assert.equal(x.totalMinutes, 1188); assert.equal(x.assumptions.length, 2); assert.equal(estimateCallVolume({ ...input, workdays_per_month: 10 }).totalMinutes, 540); });
check('Zero stated calls/share stays zero rather than a default', () => { assert.equal(estimateCallVolume({ ...input, call_count: 0, routing: 'all_calls' }).routedMinutes, 0); assert.equal(estimateCallVolume({ ...input, routing: 'selected_share', routed_percent: 0 }).routedMinutes, 0); });
for (const [field, value] of [['call_count', -1], ['call_count', Infinity], ['call_count', '18'], ['average_minutes', 0], ['workdays_per_month', 32], ['routed_percent', 101], ['missed_percent', -1], ['routing', 'made_up']]) check('Reject invalid numeric/basis '+field+':'+value, () => assert.throws(() => estimateCallVolume({ ...input, [field]: value })));
check('Reject unknown tool fields instead of accepting an execution instruction', () => assert.throws(() => estimateCallVolume({ ...input, send_email: true })));
check('Native Jobber must-have is a current non-fit even with useful website chat', () => { const x = assessWorkflowFit({ required_features: ['jobber_sync'], interested_features: ['website_chat'] }); assert.equal(x.fit, 'not_current_fit'); assert.equal(x.gaps[0].feature, 'jobber_sync'); assert.equal(x.usefulCurrentFeatures[0].feature, 'website_chat'); });
check('Web/manual availability fit preserves activation prerequisites', () => { const x = assessWorkflowFit({ required_features: ['website_chat', 'manual_availability'], interested_features: [] }); assert.equal(x.fit, 'current_fit'); assert.match(x.caveat, /private AI test/); });
check('Interesting feature alone does not become a requirement or fit conclusion', () => assert.equal(assessWorkflowFit({ required_features: [], interested_features: ['phone_answering'] }).fit, 'clarify'));
check('Invalid/unknown feature is rejected', () => assert.throws(() => assessWorkflowFit({ required_features: ['send_email_now'], interested_features: [] })));
check('Spanish action has fixed signup path and no server send', () => { const e = suggestNextStep({ action: 'start_workspace', scenario: 'call', language: 'es' }); assert.equal(e.href, '/onboard.html'); assert.equal(e.scenario, 'none'); assert.equal(e.label, 'Crear mi espacio'); });
check('Example action has canonical homepage container', () => assert.equal(suggestNextStep({ action: 'see_example', scenario: 'spanish', language: 'en' }).href, '/?example=spanish#demo-wrap'));
check('Contact offers the fixed scheduling link without implying no chat processing', () => {
  const x = executeSalesTool('suggest_next_step', { action: 'contact', scenario: 'none', language: 'en' });
  assert.equal(x.event.href, 'https://calendly.com/ngoumnaisteve/30'); assert.equal(x.event.label, 'Choose a time to talk');
  const invalid = executeSalesTool('suggest_next_step', { action: 'invalid', scenario: 'none', language: 'en' });
  assert.equal(invalid.is_error, true);
  for (const receipt of [x.content, invalid.content]) {
    assert.match(receipt, /not a statement about chat storage or AI processing/);
    assert.doesNotMatch(receipt, /nothing was (?:saved|sent|shared|opened)/i);
  }
  assert.match(x.content, /did not open the destination, create a contact request, notify a person, book a call or activate service/);
});
check('Untrusted custom URL/action/capture tool cannot execute', () => { assert.equal(executeSalesTool('capture_lead', { email: 'nobody@example.invalid' }).is_error, true); assert.throws(() => suggestNextStep({ action: 'javascript:alert(1)', scenario: 'none', language: 'en' })); assert.throws(() => suggestNextStep({ action: 'contact', scenario: 'none', language: 'en', href: 'https://evil.invalid' })); });
check('Tools return bounded structured data and never mutate supplied facts', () => { const original = JSON.stringify(input), x = executeSalesTool('estimate_call_volume', input); assert.equal(x.event.type, 'sales_estimate'); assert.equal(JSON.parse(x.content).totalMinutes, 1188); assert.equal(JSON.stringify(input), original); assert.deepEqual(SALES_TOOLS.map(x => x.name), ['estimate_call_volume', 'assess_workflow_fit', 'suggest_next_step']); });
const history = Array.from({ length: 61 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: i === 0 ? 'I run a plumbing shop in Katy.' : 'Message '+i }));
check('Thirty exchanges retain first shop fact and the61st latest user', () => { const x = sanitizeSalesMessages(history); assert.equal(x.length, 61); assert.equal(x[0].content, history[0].content); assert.equal(x.at(-1).content, 'Message 60'); });
check('Long assistant answer retains critical corrected fee after1500chars', () => { const text = 'a'.repeat(1800)+' Corrected fee $89.'; const x = sanitizeSalesMessages([{ role: 'user', content: 'Fee?' }, { role: 'assistant', content: text }, { role: 'user', content: 'Use that corrected fee.' }]); assert.equal(x[1].content, text); assert.match(x[1].content, /\$89/); });
check('Reject oversize role content without silent truncation', () => { assert.equal(sanitizeSalesMessages([{ role: 'user', content: 'a'.repeat(1501) }]), null); assert.equal(sanitizeSalesMessages([{ role: 'user', content: 'x' }, { role: 'assistant', content: 'a'.repeat(16001) }, { role: 'user', content: 'y' }]), null); });
check('Reject oversized aggregate even when each individual message fits', () => { const x = Array.from({ length: 17 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: i % 2 ? 'a'.repeat(16000) : 'x' })); assert.equal(sanitizeSalesMessages(x), null); });
check('Malformed/same-role/assistant-first/assistant-last histories fail', () => { for (const x of [null, [], {}, [{ role: 'user', content: 'x' }, { role: 'user', content: 'y' }], [{ role: 'assistant', content: 'x' }], history.slice(0, 60), history.concat([{ role: 'assistant', content: 'overflow' }, { role: 'user', content: 'overflow' }])]) assert.equal(sanitizeSalesMessages(x), null); });
check('Grounding facts say free workspace, no paid subscription, gated channels', () => { assert.match(SALES_FACTS.commercial.status, /no paid subscription or timed trial/); assert.match(SALES_FACTS.channels.phone_answering, /Not activated/); assert.match(SALES_FACTS.channels.sms, /Not activated/); assert.match(SALES_FACTS.channels.jobber_sync, /No native live/); assert.match(salesSystem(), /latest explicit correction replaces/); assert.match(salesSystem(), /no lead-submission/); });
check('Sales privacy facts distinguish browser history and AI processing from no contact request', () => {
  assert.match(SALES_FACTS.salesPrivacy.history, /sessionStorage for this tab/); assert.match(SALES_FACTS.salesPrivacy.history, /does not delete prior AI processing/);
  assert.match(SALES_FACTS.salesPrivacy.processing, /Anthropic for AI processing/); assert.match(SALES_FACTS.salesPrivacy.contact, /creates no lead or contact request/);
  assert.match(SALES_FACTS.salesPrivacy.contact, /cannot guarantee nobody will contact/);
  assert.match(salesSystem(), /Never claim “nothing was saved”/); assert.match(salesSystem(), /No contact request was created from this chat/);
});
check('CSV facts promise a downloadable manual handoff without verified native imports', () => {
  assert.match(SALES_FACTS.channels.customer_csv, /download.*CSV.*manual/); assert.match(SALES_FACTS.channels.jobber_sync, /successful Jobber import.*not established/);
  assert.match(SALES_FACTS.channels.housecall_pro_sync, /successful Housecall Pro import.*not established/);
});
check('Offline prompt contract requires grounded arithmetic, explicit coverage and bounded useful replies', () => {
  const x = salesSystem(); assert.match(x, /40–90 words/); assert.match(x, /120–180 words/); assert.match(x, /Do not repeat the brochure/);
  assert.match(x, /Every newly calculated number.*estimate_call_volume/); assert.match(x, /routing unknown until the visitor explicitly chooses/);
  assert.match(x, /contact refusal means no contact CTA/);
});
console.log(JSON.stringify({ ok: true, checks: cases.length, cases, actualExternalRequests: 0, evidence: 'Pure calculations, schema/authority/history/action boundaries only; not actual AI quality.' }, null, 2));
