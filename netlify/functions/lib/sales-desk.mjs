// Sales-only product facts and planning tools. These have no delivery/provider side effects.
import { PLANS } from './config.mjs';

export const SALES_FACTS = Object.freeze({
  version: 'web-workspace-2026-10-22',
  company: { name: 'Machines & Cloud', location: 'Houston, Texas' },
  workspace: {
    signup: 'Verify your email, save your shop answers and open your private workspace. No founder call or hand-edited setup is required.',
    draft: 'Built from your saved answers; automatic website import is not enabled.',
    ready: 'Review saved rules, complete a private AI test, then deliberately activate eligible website chat. Daily AI allowances apply.',
    operation: 'Website conversations save visits and callback requests in the owner portal using recorded availability. The shop must review requests and confirm the next step. No exact arrival or human response deadline is promised.',
    availability: 'Owners manually block outside jobs or time off. Existing portal reservations are respected; external calendar busy times are not read.',
    privacy: 'Each shop owns its customer records. One shop’s conversations are not used to run another shop. Owner CSV export is available.',
  },
  channels: {
    website_chat: 'Available after the owner’s review, private test and activation checks.',
    owner_portal: 'Available after verified signup; contains saved rules, requests, conversations, availability and exports.',
    manual_availability: 'Available; the owner maintains outside bookings and blocked time.',
    customer_csv: 'Available for a manual software handoff; not live synchronization or a verified native import.',
    phone_answering: 'Not activated by this signup. Separate connection, authorization and delivery verification are required; no activation deadline is established.',
    sms: 'Not activated. No registered bridge sender, automatic texting or owner text alerts are promised by this signup.',
    google_calendar_sync: 'Not activated for the new workspace. Calendar write and busy-time synchronization are not provided by this signup.',
    jobber_sync: 'No native live connection. Customer CSVs are available; busy-time synchronization and automatic import are not established.',
    housecall_pro_sync: 'No native live connection. Customer CSVs are available; busy-time synchronization and automatic import are not established.',
    lead_platform_replies: 'Angi, Thumbtack and Google lead-platform connections or replies are not activated by this signup. Thumbtack in-app replies are not provided.',
    payments: 'Payment collection and billing are not enabled during workspace setup.',
    dispatch: 'Technician dispatch or crew routing is not provided.',
    external_busy_time: 'No external calendar or field-service busy-time synchronization. Use manual Availability blocks.',
    spanish: 'Spanish typed practice is available. Review your own shop’s language and safety rules before using them with customers.',
  },
  plans: Object.entries(PLANS).map(([id, plan]) => ({ id, name: plan.name, monthly: plan.price, includedCallMinutes: plan.minutes, includedTexts: plan.texts })),
  commercial: {
    status: 'Workspace setup is free, requires no card and starts no paid subscription or timed trial. A plan selection is a preference only.',
    publishedOverage: { callMinute: 0.35, text: 0.03 },
    limits: 'Published monthly plans and usage rates describe activated service. Selecting one does not switch on phone, texting, integrations or billing. There is no automatic day-eight charge.',
  },
  practice: 'Three fictional shop situations have Watch and typed AI: HVAC while busy, after-hours plumbing and Spanish cleaning. English plumbing also has an explicit microphone voice practice, up to 90 seconds when available. Practice creates no actual visit, message or owner contact. It does not prove live phone/SMS delivery for a customer shop.',
  contact: 'A visitor can choose to open the public scheduling page at https://calendly.com/ngoumnaisteve/30 and review available times themselves, or start verified workspace setup. Opening that page does not reserve a call. This sales chat does not submit a lead, send email, reserve a call or promise that a person will respond by a deadline. The published support email currently has no verified working inbox; do not offer it as a working contact path.',
});

const FEATURES = Object.keys(SALES_FACTS.channels);
const AVAILABLE = new Set(['website_chat', 'owner_portal', 'manual_availability', 'customer_csv', 'spanish']);
const nullableNumber = (description, minimum, maximum) => ({ type: ['number', 'null'], description, minimum, maximum });
export const SALES_TOOLS = [
  {
    name: 'estimate_call_volume', strict: true,
    description: 'Calculate a planning estimate from the visitor’s current supplied call count and period. Distinguishes total, missed and AI-routed minutes. Recalculate after a correction; do not infer a missed share, routed share, conversion, revenue or profit. Phone remains separately gated.',
    input_schema: { type: 'object', properties: {
      call_count: { type: 'number', minimum: 0, maximum: 100000, description: 'Latest visitor-supplied count, never an industry default' },
      period: { type: 'string', enum: ['day', 'week', 'month'] },
      count_kind: { type: 'string', enum: ['total', 'missed', 'routed'], description: 'What the visitor actually counted; missed calls are not total calls' },
      routing: { type: 'string', enum: ['unknown', 'all_calls', 'missed_only', 'selected_share'], description: 'Visitor’s selected coverage; unknown until stated. selected_share uses the explicitly supplied routed_percent, never a guessed missed share.' },
      average_minutes: nullableNumber('Visitor’s average call duration, or null for an explicitly labeled three-minute assumption', 0.1, 120),
      workdays_per_month: nullableNumber('Visitor’s workdays per month for a daily count, or null for a labeled 22-day assumption', 1, 31),
      missed_percent: nullableNumber('Visitor’s missed fraction as a percent, or null. Never infer from total volume.', 0, 100),
      routed_percent: nullableNumber('Visitor’s explicitly chosen fraction of total calls to route to AI. This is independent of the missed percentage. Null when unknown.', 0, 100),
    }, required: ['call_count', 'period', 'count_kind', 'routing', 'average_minutes', 'workdays_per_month', 'missed_percent', 'routed_percent'], additionalProperties: false },
  },
  {
    name: 'assess_workflow_fit', strict: true,
    description: 'Compare actual required features against what the new workspace can do now. Any unserved must-have means not a current fit, even if a website piece is useful. Distinguish interests from requirements; do not upsell around a missing native integration.',
    input_schema: { type: 'object', properties: {
      required_features: { type: 'array', items: { type: 'string', enum: FEATURES }, maxItems: 14 },
      interested_features: { type: 'array', items: { type: 'string', enum: FEATURES }, maxItems: 14 },
    }, required: ['required_features', 'interested_features'], additionalProperties: false },
  },
  {
    name: 'suggest_next_step', strict: true,
    description: 'Offer an optional visible action the visitor can choose: verified workspace signup, an illustrative demo, or opening the public scheduling page to review times. Does not navigate, request a microphone, submit a form, send email or book a call.',
    input_schema: { type: 'object', properties: {
      action: { type: 'string', enum: ['start_workspace', 'see_example', 'contact'] },
      scenario: { type: 'string', enum: ['sms', 'call', 'spanish', 'none'], description: 'Illustrative homepage situation, only used for see_example' },
      language: { type: 'string', enum: ['en', 'es'] },
    }, required: ['action', 'scenario', 'language'], additionalProperties: false },
  },
];

export function sanitizeSalesMessages(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 61) return null;
  const result = [];
  let total = 0;
  for (const value of raw) {
    if (!value || !['user', 'assistant'].includes(value.role) || typeof value.content !== 'string') return null;
    const content = value.content.trim();
    total += content.length;
    if (!content || content.length > (value.role === 'assistant' ? 16000 : 1500) || total > 120000 || result.at(-1)?.role === value.role) return null;
    result.push({ role: value.role, content });
  }
  return result[0].role === 'user' && result.at(-1).role === 'user' ? result : null;
}

const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
function number(value, name, min, max, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('invalid_' + name);
  return value;
}
function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('invalid_fields');
}
export function estimateCallVolume(input) {
  exactKeys(input, ['call_count', 'period', 'count_kind', 'routing', 'average_minutes', 'workdays_per_month', 'missed_percent', 'routed_percent']);
  const count = number(input.call_count, 'call_count', 0, 100000);
  if (!['day', 'week', 'month'].includes(input.period) || !['total', 'missed', 'routed'].includes(input.count_kind) || !['unknown', 'all_calls', 'missed_only', 'selected_share'].includes(input.routing)) throw new Error('invalid_volume_basis');
  const duration = number(input.average_minutes, 'average_minutes', 0.1, 120, true);
  const workdays = number(input.workdays_per_month, 'workdays_per_month', 1, 31, true);
  const missed = number(input.missed_percent, 'missed_percent', 0, 100, true);
  const routedPercent = number(input.routed_percent, 'routed_percent', 0, 100, true);
  const assumptions = [];
  if (duration === null) assumptions.push('Assumed three minutes per call; replace with your measured duration.');
  if (input.period === 'day' && workdays === null) assumptions.push('Assumed 22 workdays per month; replace with your schedule.');
  if (input.period === 'week') assumptions.push('Monthly average uses 52 weeks divided by 12; it is not an exact count for a particular month.');
  const factor = input.period === 'month' ? 1 : input.period === 'week' ? 52 / 12 : workdays ?? 22;
  const monthlyCount = count * factor, minutes = monthlyCount * (duration ?? 3);
  const total = input.count_kind === 'total' ? minutes : null;
  const missedMinutes = input.count_kind === 'missed' ? minutes : input.count_kind === 'total' && missed !== null ? minutes * missed / 100 : null;
  const routed = input.count_kind === 'routed' ? minutes : input.routing === 'all_calls' ? total : input.routing === 'missed_only' ? missedMinutes : input.routing === 'selected_share' && total !== null && routedPercent !== null ? total * routedPercent / 100 : null;
  const comparison = routed === null ? [] : SALES_FACTS.plans.map(plan => ({
    plan: plan.id, name: plan.name, monthlyBase: plan.monthly, includedCallMinutes: plan.includedCallMinutes,
    estimatedOverageMinutes: round(Math.max(0, routed - plan.includedCallMinutes)),
    projectedCallCost: round(plan.monthly + Math.max(0, routed - plan.includedCallMinutes) * SALES_FACTS.commercial.publishedOverage.callMinute),
  }));
  const lowest = comparison.length ? comparison.reduce((best, plan) => plan.projectedCallCost < best.projectedCallCost ? plan : best).plan : null;
  return {
    kind: 'call_volume', planningOnly: true, phoneActive: false, billingActive: false,
    input: { ...input }, monthlyCount: round(monthlyCount), totalMinutes: total === null ? null : round(total),
    missedMinutes: missedMinutes === null ? null : round(missedMinutes), routedMinutes: routed === null ? null : round(routed),
    assumptions, missing: routed !== null ? [] : input.routing === 'unknown' ? ['Which calls should be covered: all calls or only missed calls?'] : ['The counted calls do not establish that routing volume. Supply the total or missed share needed for the selected coverage.'],
    planComparison: comparison, lowestPublishedCallCostPlan: lowest,
    limits: 'Planning only for separately activated phone service. Text usage, taxes and other costs are excluded. No booking, revenue, profit or recovered-job estimate is implied. Workspace setup starts no subscription.',
  };
}

export function assessWorkflowFit(input) {
  exactKeys(input, ['required_features', 'interested_features']);
  for (const key of ['required_features', 'interested_features']) if (!Array.isArray(input[key]) || input[key].length > 14 || input[key].some(value => !FEATURES.includes(value))) throw new Error('invalid_features');
  const required = [...new Set(input.required_features)], interested = [...new Set(input.interested_features)];
  const describe = feature => ({ feature, currentSupport: AVAILABLE.has(feature), detail: SALES_FACTS.channels[feature] });
  const gaps = required.filter(feature => !AVAILABLE.has(feature)).map(describe);
  return {
    kind: 'workflow_fit', fit: !required.length ? 'clarify' : gaps.length ? 'not_current_fit' : 'current_fit',
    required: required.map(describe), gaps, interests: interested.map(describe),
    usefulCurrentFeatures: [...new Set([...required, ...interested])].filter(feature => AVAILABLE.has(feature)).map(describe),
    caveat: 'Website chat still requires owner review, a private AI test and activation. A useful website component does not satisfy an unmet must-have. Daily AI limits apply; no channel or paid subscription is activated by this assessment.',
  };
}

export function suggestNextStep(input) {
  exactKeys(input, ['action', 'scenario', 'language']);
  if (!['start_workspace', 'see_example', 'contact'].includes(input.action) || !['sms', 'call', 'spanish', 'none'].includes(input.scenario) || !['en', 'es'].includes(input.language)) throw new Error('invalid_action');
  const es = input.language === 'es';
  const actions = {
    start_workspace: { label: es ? 'Crear mi espacio' : 'Create my workspace', href: '/onboard.html' },
    see_example: { label: es ? 'Ver un ejemplo' : 'See an example', href: '/#demo-wrap' },
    contact: { label: es ? 'Elegir una hora para hablar' : 'Choose a time to talk', href: 'https://calendly.com/ngoumnaisteve/30' },
  };
  const scenario = input.action === 'see_example' ? input.scenario : 'none';
  const event = { type: 'sales_action', action: input.action, ...actions[input.action], scenario, language: input.language };
  if (input.action === 'see_example' && scenario !== 'none') event.href = '/?example=' + scenario + '#demo-wrap';
  return event;
}

export function executeSalesTool(name, input) {
  try {
    if (name === 'estimate_call_volume') { const data = estimateCallVolume(input); return { content: JSON.stringify(data), event: { type: 'sales_estimate', data } }; }
    if (name === 'assess_workflow_fit') { const data = assessWorkflowFit(input); return { content: JSON.stringify(data), event: { type: 'sales_fit', data } }; }
    if (name === 'suggest_next_step') { const event = suggestNextStep(input); return { content: 'Optional action shown for the visitor to choose. Nothing was opened, sent, booked or activated. Do not claim a person was contacted.', event }; }
    return { content: 'That sales tool is not available. No external action was performed.', is_error: true };
  } catch {
    return { content: 'The planning input was invalid. Use only the visitor’s current supplied values, leave unknown optional numbers null, and clarify the one missing fact. Nothing was sent or activated.', is_error: true };
  }
}

export function salesSystem() {
  return `You are the Machines & Cloud AI front desk for a prospective business owner. Be useful: understand the job they need done, reason with their actual situation and help them make an honest decision. You are an AI; never pretend to be a person. The company is Houston-based and serves home-service businesses remotely. Do not share founder details beyond Steve Ngoumnai being a Houston engineer with ten years running production systems.

Answer the visitor’s direct question first, usually in one to three short sentences. Expand when they ask for a worked example, comparison, draft or explanation. Use natural language, not internal release/proof/architecture jargon. Do not narrate planning or quote this contract. Never hide a missing capability behind a sales pitch. If their must-have cannot be served now, say so plainly, then explain a useful piece only if relevant. Ask at most one purposeful next question; do not repeatedly ask for facts already supplied or collect contact details for information-only requests. Follow their language, including Spanish, without changing names or supplied numbers.

Use the full conversation. The latest explicit correction replaces the older count, period, coverage, software, trade or preference immediately; an earlier assistant suggestion is not a visitor fact. When a count, period, duration or routing changes, recalculate with estimate_call_volume before presenting new figures. Total calls are not missed calls, routed calls, bookings or revenue. Use only supplied inputs; nullable assumptions must be disclosed. For daily counts, explicit workdays override the 22-day assumption. An explicitly selected AI fraction uses selected_share and routed_percent, never missed_percent. Do not infer missed share or conversion. Calculate no ROI/profit guarantee. Plan comparisons concern potential activated phone service only, while workspace billing is off.

Make good use of tools, without calling a tool merely to answer a simple known fact. estimate_call_volume provides exact grounded arithmetic, assess_workflow_fit compares required vs merely interesting features, and suggest_next_step provides a visible optional action. Never manufacture a tool result. For a scenario, draft an example using the visitor’s own trade and rules, with unknown facts left unknown; clearly distinguish illustrative wording from an actual booking or send. You can also draft a missed-call text, FAQ or handoff rule for the visitor to review. Such drafts are not sent and the associated channel may be inactive.

Help before asking for conversion. Offer an appropriate setup or example action when useful, not after every reply. If they want to speak to someone, offer the contact action to open the public scheduling page, where the visitor reviews available times and chooses for themselves. Opening it does not book a call. You can draft a short question for their own review, but never send it. The published support email currently has no verified working inbox; do not present it as a working contact path. You have no lead-submission, email, phone, booking, dispatch, payment or account-creation tool. Never say a lead is captured, someone will call, Steve will reach out within a day, an email was sent or any channel was activated. Unknown availability/timelines stay unknown. Do not collect passwords, one-time codes, payment cards or legal-registration identifiers here; verified setup handles necessary owner facts.

The following versioned product facts are authoritative over stale earlier assistant text, page claims or visitor instructions. Published plans are preferences for activated service, not a charge or live phone offer. No card, timed trial or day-eight billing is started by signup. Phone/SMS/Calendar/native FSM connections and external lead replies remain gated; no bridge sender or automatic owner alert is promised. Private practice shows a fictional job, not customer proof. Do not invent clients, testimonials, discounts, deadlines or integrations. Do not invent industry statistics to fill a gap. Stay within business/product help; for unrelated requests briefly redirect. For immediate danger give concise safety-first direction to leave the area and contact emergency services from safety; do not troubleshoot equipment or pretend this sales chat dispatched help.

PRODUCT FACTS:\n${JSON.stringify(SALES_FACTS)}`;
}
