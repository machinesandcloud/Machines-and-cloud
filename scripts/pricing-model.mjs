// Research calculator only: no provider calls, customer records, runtime prices or billing changes.
import { PLANS } from '../netlify/functions/lib/config.mjs';
const round = n => Math.round(n * 100) / 100;
const voiceBands = { lean: 0.10, planning: 0.18, stress: 0.30 };
const paymentPercent = 0.029, paymentFixed = 0.30;
const fixedTenantService = 15, webAIReserve = 5, optionalSupportReserve = 15;
const sms = { outgoingSegment: 0.0128, incomingSegment: 0.0108, segmentsPerOutgoingMessage: 2, incomingMessagesPerOutgoing: 0.35, ownerAlertsPerOutgoing: 0.10, segmentsPerOwnerAlert: 2, aiReplyFraction: 0.35, aiCostPerReply: 0.025 };
const costPerLogicalText = sms.outgoingSegment * sms.segmentsPerOutgoingMessage + sms.incomingSegment * sms.incomingMessagesPerOutgoing + sms.ownerAlertsPerOutgoing * sms.segmentsPerOwnerAlert * sms.outgoingSegment + sms.aiReplyFraction * sms.aiCostPerReply;
const supportedOutgoingSegmentCost = costPerLogicalText / sms.segmentsPerOutgoingMessage;
function economics(price, minutes, textCost, voiceCost, support = 0) {
  const directVariable = minutes * voiceCost + textCost;
  const technicalCost = directVariable + fixedTenantService + webAIReserve;
  const fee = price * paymentPercent + paymentFixed;
  const cost = technicalCost + support + fee;
  return { cost: round(cost), technicalCost: round(technicalCost), variableCost: round(directVariable), paymentFee: round(fee), supportReserve: support, contribution: round(price - cost), serviceContributionMarginPercent: round((price - cost) / price * 100) };
}
function capacity(available, costPerMinute) {
  return { feasible: available >= 0, maxMinutes: available >= 0 ? Math.floor(available / costPerMinute) : null, shortfallAtZeroMinutes: round(Math.max(0, -available)) };
}
const current = [];
for (const [id, plan] of Object.entries(PLANS)) for (const utilization of [0.25, 0.50, 1]) for (const [band, voiceCost] of Object.entries(voiceBands)) current.push({ plan: id, price: plan.price, utilization, band, includedMinutes: plan.minutes, includedLogicalTexts: plan.texts, usedMinutes: plan.minutes * utilization, usedLogicalTexts: plan.texts * utilization, ...economics(plan.price, plan.minutes * utilization, plan.texts * utilization * costPerLogicalText, voiceCost), loaded: economics(plan.price, plan.minutes * utilization, plan.texts * utilization * costPerLogicalText, voiceCost, optionalSupportReserve) });
const candidate = [{ id: 'starter', price: 99, minutes: 150, outgoingSegments: 250 }, { id: 'growth', price: 249, minutes: 400, outgoingSegments: 750 }, { id: 'pro', price: 449, minutes: 800, outgoingSegments: 1500 }];
const revised = candidate.flatMap(plan => Object.entries(voiceBands).map(([band, voiceCost]) => ({ ...plan, band, carrierOnlyFloor: economics(plan.price, plan.minutes, plan.outgoingSegments * sms.outgoingSegment, voiceCost), withUnmeteredSMSAndReplyAI: economics(plan.price, plan.minutes, plan.outgoingSegments * supportedOutgoingSegmentCost, voiceCost), withSupport: economics(plan.price, plan.minutes, plan.outgoingSegments * supportedOutgoingSegmentCost, voiceCost, optionalSupportReserve) })));
const budgets = candidate.flatMap(plan => [0.60, 0.65, 0.70].map(target => {
  const serviceBudget = plan.price * (1 - target - paymentPercent) - paymentFixed;
  const afterFixed = serviceBudget - fixedTenantService - webAIReserve;
  const capacityWithHiddenSMS = Object.fromEntries(Object.entries(voiceBands).map(([band, unit]) => [band, capacity(afterFixed - plan.outgoingSegments * supportedOutgoingSegmentCost, unit)]));
  const capacityCarrierOnlyFloor = Object.fromEntries(Object.entries(voiceBands).map(([band, unit]) => [band, capacity(afterFixed - plan.outgoingSegments * sms.outgoingSegment, unit)]));
  const capacityIncluding15Support = Object.fromEntries(Object.entries(voiceBands).map(([band, unit]) => [band, capacity(afterFixed - optionalSupportReserve - plan.outgoingSegments * supportedOutgoingSegmentCost, unit)]));
  return { plan: plan.id, targetMarginPercent: target * 100, totalServiceCostBudget: round(serviceBudget), variableBudgetAfter15ServiceAnd5Web: round(afterFixed), outgoingSegments: plan.outgoingSegments,
    capacityWithHiddenSMS, capacityCarrierOnlyFloor, capacityIncluding15Support,
    maxIncludedMinutes: Object.fromEntries(Object.entries(capacityWithHiddenSMS).map(([band, value]) => [band, value.maxMinutes])),
    maxMinutesCarrierOnlyFloor: Object.fromEntries(Object.entries(capacityCarrierOnlyFloor).map(([band, value]) => [band, value.maxMinutes])),
    maxMinutesIncluding15Support: Object.fromEntries(Object.entries(capacityIncluding15Support).map(([band, value]) => [band, value.maxMinutes])) };
}));
const overages = { voiceAt49Cents: Object.fromEntries(Object.entries(voiceBands).map(([band, unit]) => [band, { marginalMarginPercent: round((0.49 * (1 - paymentPercent) - unit) / 0.49 * 100), floorAt60Percent: round(unit / (1 - 0.60 - paymentPercent)) }])), segmentAt5Cents: { carrierOnlyMarginPercent: round((0.05 * (1 - paymentPercent) - sms.outgoingSegment) / 0.05 * 100), includingDistributedInboundOwnerAndAI: round((0.05 * (1 - paymentPercent) - supportedOutgoingSegmentCost) / 0.05 * 100) }, oldLogicalTextAt3Cents: { cost: round(costPerLogicalText * 10000) / 10000, marginalMarginPercent: round((0.03 * (1 - paymentPercent) - costPerLogicalText) / 0.03 * 100) } };
const prompt = { assumedFreshInputTokens: 2000, assumedOutputTokens: 200, opusInputPerMillion: 4, opusOutputPerMillion: 20, singleRequestCost: round((2000 * 4 + 200 * 20) / 1e6 * 10000) / 10000, threeRequestsCost: round(3 * (2000 * 4 + 200 * 20) / 1e6 * 10000) / 10000 };
console.log(JSON.stringify({ asOf: '2026-10-22', status: 'research only; assumptions not provider receipts; billing remains off', assumptions: { voiceBands, voiceMinuteBasis: 'Assumed1:1 published-meter minute and all-in provider-cost minute as a sensitivity proxy only. App-rounded elapsed minutes, per-leg provider-rounded minutes and Vapi duration differ; actual reconciliation and rounding uplift are unmeasured.', marginDefinition: 'Service contribution after modeled service costs and card fees, before acquisition, development, taxes, refunds and other omitted costs; not gross or net margin.', paymentPercent, paymentFixed, fixedTenantService, webAIReserve, optionalSupportReserve, supportBasis: '15min/mo at assumed$60/h', sms, costPerLogicalText, supportedOutgoingSegmentCost, additionalStripeBillingIfEnabled: 0.007, simultaneousAllowanceUtilization: 'same25/50/100percent for minutes and outgoing logical texts; not observed customer behavior' }, current, revised, budgets, overages, webPromptExample: prompt }, null, 2));
