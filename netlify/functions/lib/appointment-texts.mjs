// A booking may invite the recipient to start SMS. It never grants texting consent.
import { managedSMSConsent, deliveryTenant } from './managed-consent.mjs';
import { messagingSender } from './messaging-activation.mjs';
import { isSupportedSelfServiceClient } from './setup.mjs';
import { strictRead } from './accounts.mjs';
import { belongsToWorkspace } from './workspace-identity.mjs';

export async function appointmentTextInvitation(c, booking) {
  if (!isSupportedSelfServiceClient(c) || !booking?.id || !belongsToWorkspace(c, booking) || booking.websiteSetupCheck || booking.simulation || !/^\+1[2-9]\d{9}$/.test(booking.phone || '')) return null;
  try {
    const current = await strictRead('clients', c.slug);
    if (!isSupportedSelfServiceClient(current) || deliveryTenant(c) !== deliveryTenant(current)) return null;
    const permission = await managedSMSConsent(current, booking.phone);
    if (permission?.transactional && !permission.suppressed) return null;
    const sender = await messagingSender(current);
    if (!sender || !/^\+1[2-9]\d{9}$/.test(sender.number)) return null;
    return { version: 1, bookingId: booking.id, number: sender.number, business: String(current.business.name).slice(0, 100), language: booking.language === 'es' ? 'es' : 'en', keyword: booking.language === 'es' ? 'CITAS' : 'APPOINTMENTS', restartRequired: permission?.suppressed === true };
  } catch { return null; } // Optional invitations cannot hide an already saved visit.
}

export function appointmentTextVoiceInstruction(invitation) {
  if (!invitation) return '';
  const restart = invitation.restartRequired ? 'If you previously stopped texts, first send START to remove that block. ' : '';
  return ` Optional appointment texts: tell the caller they can text ${invitation.keyword} from the mobile number saved for their visit to ${invitation.number}. ${restart}We will reply with the appointment-text question; a separate YES or SÍ is required. This booking and the phone call alone do not give texting permission. Do not say a text has been sent or consent recorded.`;
}
