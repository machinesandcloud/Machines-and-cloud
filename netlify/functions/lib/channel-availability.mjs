// One public source of truth for which services a NEW workspace can start today.
// Every surface (homepage, onboarding, desk Connections and the sales desk facts)
// reads this projection instead of writing its own availability claim.
//
// It is derived only from the same platform gates the service workers enforce.
// channelAvailability() is a pure read of configuration: no store access, no provider
// request and no customer data. currentChannelAvailability() adds two aggregate store
// reads (usage brake, shared resource ledger) and is what public surfaces serve.
// Per-workspace readiness (reviewed rules, payment, cohort admission, carrier review) stays in the desk's own connection journey.
import { phoneAcquisitionAvailable } from './phone-activation.mjs';
import { voiceActivationAvailable } from './voice-activation.mjs';
import { messagingActivationAvailable } from './messaging-activation.mjs';
import { calendarConnectionEnabled } from './calendar-connection.mjs';
import { calendarDeliveryEnabled } from './calendar-delivery.mjs';
import { calendarExecutionPolicy } from './calendar-execution.mjs';
import { managedResourceAdmissionPolicy } from './managed-resource-admission.mjs';
import { thumbtackAnyConfigurationReady } from './thumbtack-environment.mjs';
import { workspaceBillingConfiguration } from './workspace-billing.mjs';
import { privateEncryptionAvailable } from './private-encryption.mjs';
import { strictRead } from './accounts.mjs';

export const CHANNEL_AVAILABILITY_VERSION = 1;
export const CHANNEL_IDS = Object.freeze(['web', 'voice', 'sms', 'calendar', 'thumbtack', 'angi']);
export const CHANNEL_STATUS = Object.freeze({
  available: Object.freeze({ status: 'Available now', note: '' }),
  team_setup: Object.freeze({ status: 'Setup with our team', note: 'We’ll set this up with you; it is not live yet.' }),
});
const LABELS = Object.freeze({ web: 'Website chat', voice: 'Phone answering', sms: 'Text messaging', calendar: 'Google Calendar', thumbtack: 'Thumbtack', angi: 'Angi' });

const safely = fn => { try { return fn() === true; } catch { return false; } };
// Managed numbers, brands and campaigns are admitted only for an explicit cohort
// unless the operator approved self-service admission. A cohort is real service
// for its selected shops, but a new owner still needs our team to set it up.
function selfServiceResources(kinds) {
  const p = (() => { try { return managedResourceAdmissionPolicy(); } catch { return null; } })();
  return !!p && p.mode === 'self_service' && kinds.every(kind => p.accountLimits?.[kind] > 0 && p.tenantLimits?.[kind] > 0);
}
// A self-service Calendar policy can still name a pilot tenant list, or allow zero
// connections; neither lets a new owner connect, so neither is "Available now".
const CALENDAR_START = ['oauthStart', 'tokenExchange', 'eventCreate', 'totalRequests'];
function calendarSelfService() {
  const p = (() => { try { return calendarExecutionPolicy(); } catch { return null; } })();
  return p?.mode === 'self_service' && !Object.hasOwn(p, 'tenants') && CALENDAR_START.every(k => p.limits?.[k] > 0 && p.tenantLimits?.[k] > 0) && safely(calendarConnectionEnabled) && safely(calendarDeliveryEnabled);
}
// Service intake and onboarding seal owner details with the platform key; without it
// a new owner cannot save phone or texting details.
const platformKey = () => safely(() => privateEncryptionAvailable('platform'));

const DETAIL = Object.freeze({
  web: { available: 'Answer questions and gather job details from your website, with each request saved for your follow-up.' },
  voice: {
    available: 'Choose your business number and how calls reach your front desk. Calls are answered after your approval and a test call.',
    team_setup: 'Save your business number and call preferences. Calls are not answered yet.',
  },
  sms: {
    available: 'Register your front desk sender for two-way customer texting. Texting starts after carrier approval and a setup text.',
    team_setup: 'Save your texting preferences. No sender is registered and no texts are sent yet.',
  },
  calendar: {
    available: 'Connect your Google calendar so saved visits and changes follow your schedule.',
    team_setup: 'Save the Google account you want to use. Visits stay in your workspace Schedule until Calendar sync is live.',
  },
  thumbtack: {
    native: 'Bring Thumbtack leads and messages into your Inbox and reply in the same conversation.',
    intake: 'Get Thumbtack lead notifications in your Inbox. Replies stay in Thumbtack for now.',
  },
  angi: { available: 'Bring new Angi leads into your Inbox after Angi turns on delivery for your account. Replies stay in Angi.' },
});

function entry(id, available, detail, extra = {}) {
  const state = available ? 'available' : 'team_setup';
  return { id, label: LABELS[id], state, available, ...CHANNEL_STATUS[state], detail, ...extra };
}

// Returns the same object shape for every caller.
export function channelAvailability(hold = {}) {
  const voice = hold.voice !== true && platformKey() && safely(phoneAcquisitionAvailable) && safely(voiceActivationAvailable) && selfServiceResources(['numbers']);
  const sms = hold.sms !== true && platformKey() && safely(phoneAcquisitionAvailable) && safely(messagingActivationAvailable) && selfServiceResources(['numbers', 'brands', 'campaigns']);
  const calendar = calendarSelfService();
  const thumbtackReplies = safely(thumbtackAnyConfigurationReady);
  let billing = false;
  try { const b = workspaceBillingConfiguration(); billing = b.newPurchasesEnabled === true && b.mode === 'live' && b.webhookConfigured === true; } catch { billing = false; }
  const channels = [
    entry('web', true, DETAIL.web.available),
    entry('voice', voice, DETAIL.voice[voice ? 'available' : 'team_setup']),
    entry('sms', sms, DETAIL.sms[sms ? 'available' : 'team_setup']),
    entry('calendar', calendar, DETAIL.calendar[calendar ? 'available' : 'team_setup']),
    // Self-serve lead notifications need no partner credentials. Native replies do.
    entry('thumbtack', true, DETAIL.thumbtack[thumbtackReplies ? 'native' : 'intake'], { replies: thumbtackReplies }),
    entry('angi', true, DETAIL.angi.available, { replies: false }),
  ];
  return { version: CHANNEL_AVAILABILITY_VERSION, channels, billing: { available: billing } };
}

// Phone and texting also stop for every new owner when the usage brake is on or the
// shared number/registration allowance is used up. Two aggregate reads, no tenant
// data; any read failure keeps the conservative state.
export async function currentChannelAvailability() {
  const view = channelAvailability();
  if (!view.channels.some(row => ['voice', 'sms'].includes(row.id) && row.available)) return view;
  try {
    const [brake, ledger] = await Promise.all([strictRead('health', 'brake'), strictRead('managed_resource_admission', 'twilio_v1')]);
    if (brake?.on === true) return channelAvailability({ voice: true, sms: true });
    const p = managedResourceAdmissionPolicy();
    if (!p || ledger && ledger.providerAccountHash !== p.providerAccountHash) return channelAvailability({ voice: true, sms: true });
    const used = ledger?.used || {}, b = p.bounds, fits = need => Object.entries(need).every(([k, v]) => (used[k] || 0) + v <= p.accountLimits[k]);
    const number = { numbers: 1, setupCents: b.numberSetupCents, monthlyCents: b.numberMonthlyCents };
    const texting = { numbers: 1, brands: 1, campaigns: 1, setupCents: b.numberSetupCents + b.brandSetupCents + b.campaignSetupCents, monthlyCents: b.numberMonthlyCents + b.campaignMonthlyCents };
    return channelAvailability({ voice: !fits(number), sms: !fits(texting) });
  } catch { return channelAvailability({ voice: true, sms: true }); }
}

export const channelById = (view, id) => view.channels.find(row => row.id === id) || null;
