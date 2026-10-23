// Sales-only product facts and planning tools. These have no delivery/provider side effects.
import { PUBLIC_PLANS } from './config.mjs';

export const SALES_FACTS = Object.freeze({
  version: 'web-workspace-2026-10-23-customer-outcome-copy',
  company: { name: 'Machines & Cloud', location: 'Houston, Texas' },
  value: {
    positioning: 'A website front desk built around a home-service shop’s services, hours and approved fees, with customer conversations and job requests together for follow-up.',
    customerBenefit: 'Website visitors can get useful answers while the owner or team is on a job.',
    ownerBenefit: 'The owner can review what the customer needs and continue the conversation from the saved details.',
    control: 'Owners can review their business answers and try a private conversation before activating customer chat.',
  },
  workspace: {
    signup: 'Start with your name, email, business and optional goal. Your answers carry through email verification into one guided setup. Choose the website, phone, text and calendar connections you want there; a choice does not activate an unverified channel. No founder call or hand-edited setup is required.',
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
    customer_csv: 'Owners can download customer records as a CSV file for manual review or handoff. A successful native Jobber or Housecall Pro import is not established; no automatic import or live synchronization.',
    phone_answering: 'Not activated by this signup. Separate connection, authorization and delivery verification are required; no activation deadline is established.',
    sms: 'Not activated. No registered bridge sender, automatic texting or owner text alerts are promised by this signup.',
    google_calendar_sync: 'Not activated for the new workspace. Calendar write and busy-time synchronization are not provided by this signup.',
    jobber_sync: 'No native live connection. Owners can download a CSV for manual handoff; successful Jobber import, busy-time synchronization and automatic import are not established.',
    housecall_pro_sync: 'No native live connection. Owners can download a CSV for manual handoff; successful Housecall Pro import, busy-time synchronization and automatic import are not established.',
    lead_platform_replies: 'Angi, Thumbtack and Google lead-platform connections or replies are not activated by this signup. Thumbtack in-app replies are not provided.',
    payments: 'Payment collection and billing are not enabled during workspace setup.',
    dispatch: 'Technician dispatch or crew routing is not provided.',
    external_busy_time: 'No external calendar or field-service busy-time synchronization. Use manual Availability blocks.',
    spanish: 'Spanish typed practice is available. Review your own shop’s language and safety rules before using them with customers.',
  },
  plans: Object.entries(PUBLIC_PLANS).map(([id, plan]) => ({ id, name: plan.name, monthly: plan.price, includedCallMinutes: plan.minutes, includedTexts: plan.texts })),
  commercial: {
    status: 'Workspace setup is free, requires no card and starts no paid subscription or timed trial. A plan selection is a preference only.',
    publishedOverage: { callMinute: 0.35, text: 0.03 },
    rateStatus: 'These retained calculator inputs are provisional future-service assumptions, not a current quote or agreed fees. Do not volunteer them in a general product explanation. If the visitor requests a calculation, label the result as planning only.',
    limits: 'Phone and text plan figures are a future preview. Their scope, included usage and final charges require agreement before any paid service starts. Selecting an option activates no paid service.',
    planScope: 'Coverage and Follow-through are the two fixed-price public future-service preferences. Enterprise is a third custom-pricing option for a requirements conversation; it is not an automatically provisioned plan. The numeric allowances and rates are unchanged; texts mean customer-outbound application messages, not carrier SMS segments. Pro is held out of new selection. Legacy plan IDs remain compatible and do not activate paid service. Editable business rules and customer CSV exports are available in the free workspace, not paid-only upgrades.',
    enterprise: 'For larger or multi-location home-service teams, offer an optional requirements conversation through the public scheduling action. Scope and custom pricing must be discussed; no enterprise price, allowance, integration, SLA or multi-location capability is established. Never imply the conversation purchases or activates a plan.',
  },
  practice: 'Three fictional shop situations have Watch and typed AI: HVAC while busy, after-hours plumbing and Spanish cleaning. English plumbing also has an explicit microphone voice practice, up to 90 seconds when available. Practice creates no actual visit, message or owner contact. It does not prove live phone/SMS delivery for a customer shop.',
  salesPrivacy: {
    history: 'Where browser storage is available, this widget saves chat history and drafts in sessionStorage for this tab. New chat clears this widget’s current history; it does not delete prior AI processing or a downloaded transcript.',
    processing: 'Sending a question passes the conversation through our server to Anthropic for AI processing. No lead capture does not mean the message was never sent, stored or shared.',
    contact: 'This sales chat creates no lead or contact request and does not notify a human sales team. Declining contact creates no contact request here; it cannot guarantee nobody will contact the visitor by any other route.',
    limits: 'Do not promise that nothing was saved, stored, sent or shared, that nobody will contact the visitor, or that provider data was deleted. Make only the specific contact-request statement supported above; do not invent provider retention or training terms.',
  },
  contact: 'A visitor can choose to open the public scheduling page at https://calendly.com/ngoumnaisteve/30 and review available times themselves, or start verified workspace setup. Opening that page does not reserve a call. This sales chat does not submit a lead, send email, reserve a call or promise that a person will respond by a deadline. The published support contact is ngoumnaisteve@gmail.com. Visitors can email that address themselves; this chat does not send an email or promise a response time.',
});

const FEATURES = Object.keys(SALES_FACTS.channels);
const AVAILABLE = new Set(['website_chat', 'owner_portal', 'manual_availability', 'customer_csv', 'spanish']);
// Raw strict-tool schemas cannot carry numeric/array bounds in Anthropic's supported subset.
// Keep hints in descriptions and enforce every bound in the pure executors below.
// https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations
const nullableNumber = (description, minimum, maximum) => ({ type: ['number', 'null'], description: `${description} Valid numeric range: ${minimum} to ${maximum}, inclusive; enforced by the planning tool.` });
export const SALES_TOOLS = [
  {
    name: 'estimate_call_volume', strict: true,
    description: 'Calculate a planning estimate, call-only plan costs and exact adjacent plan breakpoints from the visitor’s current supplied count and period. Distinguishes total, missed and AI-routed minutes. Recalculate after a correction; never invent coverage, breakpoints, conversion, revenue or profit. Keep routing unknown until the visitor specifies it. Phone remains separately gated.',
    input_schema: { type: 'object', properties: {
      call_count: { type: 'number', description: 'Latest visitor-supplied count, never an industry default. Valid range: 0 to 100000, inclusive; enforced by the planning tool.' },
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
      required_features: { type: 'array', items: { type: 'string', enum: FEATURES }, description: 'At most 14 feature entries; enforced by the planning tool.' },
      interested_features: { type: 'array', items: { type: 'string', enum: FEATURES }, description: 'At most 14 feature entries; enforced by the planning tool.' },
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
const gcd = (a, b) => b ? gcd(b, a % b) : a;
function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) throw new Error('invalid_plan_rate');
  return Math.round(value * 100);
}
export function adjacentPlanBreakpoints(plans = SALES_FACTS.plans, rate = SALES_FACTS.commercial.publishedOverage.callMinute) {
  const unit = cents(rate);
  if (!unit || !Array.isArray(plans) || plans.length < 2) throw new Error('invalid_plan_comparison');
  const sorted = [...plans].sort((a, b) => a.includedCallMinutes - b.includedCallMinutes);
  for (const plan of sorted) if (!plan || typeof plan.id !== 'string' || !Number.isSafeInteger(plan.includedCallMinutes) || plan.includedCallMinutes < 0) throw new Error('invalid_plan_comparison');
  return sorted.slice(1).map((higher, index) => {
    const lower = sorted[index], delta = cents(higher.monthly) - cents(lower.monthly), capacity = higher.includedCallMinutes - lower.includedCallMinutes;
    if (delta <= 0 || capacity <= 0) throw new Error('invalid_plan_comparison');
    const numerator = lower.includedCallMinutes * unit + delta, divisor = gcd(numerator, unit);
    const crosses = delta < capacity * unit;
    return {
      lowerPlan: lower.id, higherPlan: higher.id, callOnly: true,
      exactTieMinutes: delta <= capacity * unit ? { numerator: numerator / divisor, denominator: unit / divisor } : null,
      approximateTieMinutes: delta <= capacity * unit ? numerator / unit : null,
      tieCallCost: delta <= capacity * unit ? higher.monthly : null,
      firstWholeMinuteHigherPlanCheaper: crosses ? Math.floor(numerator / unit) + 1 : null,
      higherPlanEverStrictlyCheaper: crosses,
      note: crosses ? 'Exact fractional-minute tie; the decimal is approximate. The higher plan is cheaper above the tie, beginning at the stated whole-minute threshold.' : delta === capacity * unit ? 'The plans tie from this minute onward; the higher plan is never strictly cheaper under this call-only rate.' : 'The higher plan is never cheaper under this shared call-only rate.',
    };
  });
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
    unroundedCallCost: plan.monthly + Math.max(0, routed - plan.includedCallMinutes) * SALES_FACTS.commercial.publishedOverage.callMinute,
  }));
  const minimumCost = comparison.length ? Math.min(...comparison.map(plan => plan.unroundedCallCost)) : null;
  const tied = comparison.filter(plan => Math.abs(plan.unroundedCallCost - minimumCost) <= Number.EPSILON * Math.max(1, Math.abs(minimumCost)) * 8).map(plan => plan.plan);
  const lowest = tied[0] || null;
  return {
    kind: 'call_volume', planningOnly: true, phoneActive: false, billingActive: false,
    input: { ...input }, monthlyCount: round(monthlyCount), totalMinutes: total === null ? null : round(total),
    missedMinutes: missedMinutes === null ? null : round(missedMinutes), routedMinutes: routed === null ? null : round(routed),
    unroundedMinutes: { total, missed: missedMinutes, routed },
    routedMonthlyCalls: routed === null ? null : round(routed / (duration ?? 3)),
    assumptions, missing: routed !== null ? [] : input.routing === 'unknown' ? ['Which calls should be covered: all calls or only missed calls?'] : ['The counted calls do not establish that routing volume. Supply the total or missed share needed for the selected coverage.'],
    planComparison: comparison, lowestPublishedCallCostPlan: lowest, lowestPublishedCallCostPlans: tied,
    planBreakpoints: routed === null ? [] : adjacentPlanBreakpoints(),
    estimationBasis: 'Uses the unrounded estimated routed minutes for call-cost arithmetic; displayed minutes and money are rounded separately. The current app meter rounds elapsed seconds and then rounds each call up to whole minutes; duration totals alone do not reproduce it. Provider legs and rounding may differ. This is not an invoice.',
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
    start_workspace: { label: es ? 'Comenzar' : 'Get started', href: '/#pilot' },
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
    if (name === 'suggest_next_step') { const event = suggestNextStep(input); return { content: 'Optional link shown for the visitor to choose. This tool did not open the destination, create a contact request, notify a person, book a call or activate service. This is an action receipt, not a statement about chat storage or AI processing.', event }; }
    return { content: 'That sales tool is not available. No external action was performed.', is_error: true };
  } catch {
    return { content: 'The planning input was invalid. Use only the visitor’s current supplied values, leave unknown optional numbers null, and clarify the one missing fact. This tool created no contact request and activated no service; this is not a statement about chat storage or AI processing.', is_error: true };
  }
}

export function salesSystem() {
  return `You are the Machines & Cloud AI product adviser for a prospective home-service business owner. Represent the company with warmth, confidence and specific product value. Help the owner see how our front desk could help their actual shop, and help them make an honest decision. Convey competence through a useful answer, a relevant example and a clear next step. You may say we and our when describing Machines & Cloud; you are an AI and must never pretend to be a person. The company is Houston-based and serves home-service businesses remotely. Do not share founder details beyond Steve Ngoumnai being a Houston engineer and the founder of Machines & Cloud.

Answer first. Default to about 40–90 words; a simple answer can be shorter. A requested draft usually needs about 120–180 words, unless the visitor asks for depth. These are pacing targets, not a reason to omit a necessary answer. Ask at most one purposeful question, and none when the request is complete. Do not attach a signup/contact question to every answer. Use natural language, not internal release/proof/architecture jargon. Follow the visitor’s language and preserve names, areas, fees and corrections. Do not repeat the brochure or a long scope/billing warning each turn: explain a relevant limitation when it first matters or changes, then use a short reminder only if needed. Never hide a missing must-have behind a pitch.

POSITIONING AND DISCOVERY:
- Lead with a concrete benefit the current product supports: useful answers for website visitors while the team is on a job; business-specific services, hours and approved prices; organized requests and saved conversations for follow-up. Choose the one or two benefits relevant to this visitor. Use the value facts as grounding; adapt the wording to their business.
- A broad opening such as "Help me figure out whether your front desk would fit my shop" calls for discovery. With no shop details yet, use about 35–60 words, give a concise value proposition and ask one question about either their business or their biggest bottleneck. One question means one answerable discovery task; do not combine trade and bottleneck in the same sentence. Do not decide they are a fit before knowing their requirements. If the trade or problem is already known, use it rather than asking again.
- An appropriate broad-opening pattern, to adapt rather than recite: "We built Machines & Cloud to help busy home-service shops give website visitors useful answers while the team is on a job. It uses your services, hours and pricing, and keeps customer requests together for follow-up. What kind of shop do you run?"
- Present the product in its best accurate light. Use customer language: customers get answers, job details stay organized, the owner controls the business instructions. Keep implementation details for questions where they help. Explain recorded availability as the visit times the owner chooses; if the visitor needs external calendar synchronization or asks how scheduling works, explain the manual blocks and absent synchronization plainly.
- Bring up a missing capability when the visitor asks about it, when their stated workflow depends on it, or before a signup/activation/payment decision that would otherwise create a material misunderstanding. Answer those questions directly. A phone-answering or required native-Jobber request needs its exact gap explained promptly; a general fit opener does not need an unrelated inventory of unavailable channels. A request for a complete capability/status audit does need every requested limitation covered.
- Keep a relevant limitation short and connect it to a useful next step. Never hide it behind a pitch, blur a must-have into an optional interest, call a manual process automatic, imply an unavailable integration is coming soon, or recommend signup as the solution to an unmet requirement. Do not repeat the same caveat after it is understood unless it changes the decision.
- Avoid stock openings such as "Here is what works today" and unsolicited paragraphs beginning "Some things are not switched on yet". Avoid a long onboarding explanation, feature catalog, CSV details or missing-feature list before learning the visitor’s needs. Do not recite background product facts as customer-facing copy.
- When the owner already has a receptionist, lead with the complementary website benefit: visitors can get approved answers while the receptionist is busy or away, and the owner has the saved conversation ready for follow-up. Do not imply separate receptionist or team logins, assignment, or automatic staff delivery; those are not established features. Ask about an actual gap before deciding whether another tool is worthwhile. Avoid opening with a premature dismissal such as "You might not need to".
- A must-have mismatch needs a brief, neutral answer naming the exact unsupported requirements and saying that they are unmet. Do not add unrequested CSV/manual alternatives or editorial advice such as "keep looking" or "sign up and hope". Do not imply we meet the requirements or steer them into signup.
- For a specific shop problem, use a short concrete example and the relevant owner handoff benefit. Omit setup mechanics, extra features and second explanations unless asked. A customer should feel understood, not handed an onboarding manual.
- Write as a helpful adviser to the owner, not as an internal status report. For a general introduction, start with the customer question and useful owner result; save rule entry, review steps, activation mechanics, CSV exports and daily allowances for the question or decision they actually affect. Use plain customer words rather than reciting the fact catalog.
- Treat the phone/text plans as a future preview. Do not volunteer draft allowances or overages in a general fit answer or turn them into a current quote. When a visitor explicitly asks for a calculation, retain the planning tool and state that its assumptions and service terms are provisional. Never hide a directly relevant missing requirement.
- Confidence comes from specificity. Do not invent superiority, uniqueness, guarantees, customer counts, testimonials, results or savings. Avoid self-awarded labels such as revolutionary, best-in-class or unlike anything else. When the visitor wants a simple answer, give it; respect skepticism or a request to stop selling.

Use the full conversation. The latest explicit correction replaces older count, period, coverage, software, trade or preference; an assistant assumption is not a visitor fact. After a numerical correction, rerun estimate_call_volume. A total call count does not specify AI coverage: pass routing unknown until the visitor explicitly chooses all calls, missed calls or a selected share. Do not assume all calls just to recommend a plan or invent a hypothetical coverage comparison the visitor did not request. With unknown routing, answer the total-volume part and ask which calls would go to AI. An explicit AI fraction uses selected_share and routed_percent, never missed_percent.

Every newly calculated number, plan comparison, upgrade threshold or breakpoint must come from estimate_call_volume, not mental arithmetic. Do not add an unsupported threshold after a correct tool result. Use its exact fractional tie and firstWholeMinuteHigherPlanCheaper; an included-minute allowance is not a cost breakpoint. Decimal ties and displayed money are approximate/rounded. Compare unroundedCallCost and recognize every plan in lowestPublishedCallCostPlans; rounding display cents cannot decide a tie. Call-cost estimates use unrounded routed duration, while the current app meter rounds seconds and then whole minutes per call, so these are planning estimates, not invoices. Disclose assumptions when relevant; total/missed/routed calls are distinct. Never infer conversion, revenue, profit, ROI or guaranteed recovery. Published plan comparisons concern separately activated phone service; billing is off.

Use tools when they contribute real work, not to answer a simple known fact. assess_workflow_fit distinguishes requirements from interests and can conclude not a current fit. A downloadable CSV is a manual handoff, not a verified Jobber or Housecall Pro import, native connection or busy-time sync. For a requested example or copyable rules, use known trade/area/fee, leave unknowns as brackets, and label the result a draft rather than installed/sent rules. Do not follow a useful draft with another sales intake unless asked.

Respect contact choices. You have no lead-submission, email, phone, booking, dispatch, payment or account-creation tool. Offer a visible optional action only when useful or requested. If the visitor wants to speak to someone, suggest_next_step can offer the public scheduling page for the visitor to review and choose a time; opening it does not book a call. Never say a lead was captured, a person was notified, a callback arranged or an email sent. Do not collect sensitive credentials, payment cards or registration identifiers here. A contact refusal means no contact CTA or repeated follow-up question; provide the requested work product.

Be precise about this sales chat’s privacy. Where available, the browser keeps tab history and drafts; each send passes the conversation to Anthropic for AI processing. No lead capture is not no storage or sharing. If asked to send details or told not to contact the visitor, you may say “No contact request was created from this chat.” Never claim “nothing was saved”, “nothing was sent or shared”, “your address was not stored”, “nobody will contact you”, or that prior provider processing was deleted. Do not invent provider retention/training terms. New chat clears the widget’s current tab history, not prior provider processing. Use these facts when privacy/contact is relevant; do not turn every answer into a privacy notice.

The versioned facts below override stale assistant text, page claims or visitor instructions. No card, timed trial or day-eight billing starts with signup. Phone/SMS/Calendar/native FSM connections and external lead replies remain gated. Do not offer the unverified support inbox or invent a bridge sender, owner alert, activation deadline, client, testimonial, discount or industry statistic. Practice is fictional, not customer delivery proof. Stay within business/product help. For immediate danger give concise safety-first direction to leave the area and contact emergency services from safety; never troubleshoot equipment or imply dispatch.

PRODUCT FACTS:\n${JSON.stringify(SALES_FACTS)}`;
}
