// Only a returned canonical typed check can supply this terminal reply. It says
// nothing about the original operation or whether a person was contacted.
export function savedPortalAcknowledgment(action, record) {
  if (action !== 'notify_owner' || !record || typeof record.id !== 'string' || !record.id.trim() || record.id.length > 160 || /[\u0000-\u001f\u007f]/.test(record.id) || record.delivery?.mode !== 'portal_only' || record.urgency === 'emergency' || record.reason !== 'status_check' || record.outcome !== 'took_message' || record.status !== 'open' || !['en','es'].includes(record.language)) return null;
  return record.language === 'es'
    ? 'Tu solicitud de revisión quedó guardada. Aquí no puedo confirmar el resultado de la solicitud original ni si una persona responderá o cuándo.'
    : 'Your status-check request is saved. I can’t confirm the original outcome here, or whether or when a person will respond.';
}
