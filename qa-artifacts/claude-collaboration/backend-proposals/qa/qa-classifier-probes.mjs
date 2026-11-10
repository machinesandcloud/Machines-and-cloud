// Usage: node qa-classifier-probes.mjs <patched repo root>
import { pathToFileURL } from 'node:url';
const { classifySMSKeyword: c, normalizeSMSKeywordText: n } = await import(pathToFileURL(process.argv[2] + '/netlify/functions/lib/sms-keywords.mjs').href);
// copied verbatim from netlify/functions/sms.mjs:15-16 (legacy, unchanged by the patch)
const legacyStop = /^\s*(stop|stopall|unsubscribe|end|quit|cancel|revoke|opt\s*out|optout|alto|parar|cancelar|basta|detener)\b[\s.!]*$/i;
const legacyPhrase = /\b(stop texting|stop messaging|do not text|don't text|no more texts|remove me|no me (escriban?|manden?|env[ií]en?|texteen?)( m[aá]s)?( mensajes)?|no m[aá]s mensajes|dejen? de (escribir|mandar|enviar)|no quiero m[aá]s mensajes)\b/i;
const T = ["It just quit","It quit now","quit it","Mas alto","the stop","my stop","stop now","Thanks you can stop","It quit again","All quit","please stop it","stop texting me i already booked","STOP​","ＳＴＯＰ","Stöp","stop.","S.T.O.P.","Stop 🙏","no more messages","dont text me","Don’t text me","don't text, call me instead","remove me","remove me from the schedule","cancelar","STOP 1","yes stop","STOP and START","stop start","help stop","Stop texting me.\n\nSent from my iPhone"];
for (const t of T) console.log(JSON.stringify(t).padEnd(44), 'patched=' + c(t), 'legacy_sms.mjs=' + (legacyStop.test(t.trim()) || legacyPhrase.test(t.trim()) ? 'stop' : 'none'), 'norm=' + JSON.stringify(n(t)));
