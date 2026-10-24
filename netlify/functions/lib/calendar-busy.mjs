// Busy intervals only, never event titles, attendees' identities or descriptions.
// Uses the owner's existing events.owned grant, target and calendarRead allowance.
import { createHash } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead } from './accounts.mjs';
import { workspaceTenant, supportedWorkspace } from './workspace-identity.mjs';
import { configurationRevision } from './setup.mjs';
import { CalendarError, CALENDAR_AVAILABILITY_CONSENT_VERSION, calendarConnectionEnabled, getCalendarConnection, googleAccessToken } from './calendar-connection.mjs';
import { calendarExecutionPolicy, guardedCalendarFetch, assertCalendarExecution } from './calendar-execution.mjs';
import { addDays, canonicalWindow, isoDateValid } from './availability.mjs';

export const CALENDAR_BUSY_FIELDS='timeZone,nextPageToken,items(id,status,transparency,start,end,extendedProperties/private,attendees(self,responseStatus),recurrence)';
const STORE='calendar_busy', ZONE='America/Chicago', TTL=60000, FRESH=5000, MAX_PAGES=4;
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=()=>{throw new CalendarError('calendar_busy_unavailable','Calendar availability could not be confirmed. Offer an owner callback; do not promise an arrival window.',503);};
export function calendarWallInstant(date,minutes=0,zone=ZONE) {
  if(!isoDateValid(date)||!Number.isInteger(minutes)||minutes<0||minutes>1440)fail();
  if(minutes===1440)return calendarWallInstant(addDays(date,1),0,zone);
  const target=Date.parse(date+'T00:00:00Z')+minutes*60000;
  let instant=target,formatter;
  try{formatter=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}catch{fail();}
  for(let n=0;n<6;n++){const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).filter(v=>v.type!=='literal').map(v=>[v.type,Number(v.value)])),local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);if(local===target)return instant;instant+=target-local;}
  fail();
}
export function calendarWindowInterval(date,window) {
  const p=/^(\d+)-(\d+)$/.exec(canonicalWindow(window));
  if(!p||Number(p[2])<=Number(p[1]))fail();
  return {start:calendarWallInstant(date,Number(p[1])),end:calendarWallInstant(date,Number(p[2]))};
}
function eventInstant(value,zone) {
  if(value?.date&&value.dateTime===undefined)return calendarWallInstant(value.date,0,zone);
  const text=value?.dateTime;
  if(typeof text!=='string')fail();
  if(/(?:Z|[+-]\d\d:\d\d)$/.test(text)){const n=Date.parse(text);if(!Number.isFinite(n))fail();return n;}
  const m=/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):00$/.exec(text);
  if(!m||Number(m[2])>23||Number(m[3])>59)fail();
  return calendarWallInstant(m[1],Number(m[2])*60+Number(m[3]),value.timeZone||zone);
}
function normalizedEvent(event,zone) {
  if(event?.status==='cancelled'||event?.transparency==='transparent'||event?.attendees?.some(a=>a.self===true&&a.responseStatus==='declined'))return null;
  if(!event||typeof event.id!=='string'||!event.id||event.id.length>1024||event.recurrence)fail();
  const start=eventInstant(event.start,zone),end=eventInstant(event.end,zone);
  if(end<=start)fail();
  return {id:event.id,start,end,owner:typeof event.extendedProperties?.private?.mcOwner==='string'?event.extendedProperties.private.mcOwner:null};
}
async function authority(c,scope) {
  const current=await strictRead('clients',c.slug),connection=await getCalendarConnection(c.slug);
  if(!supportedWorkspace(current)||workspaceTenant(current)!==scope.tenant||configurationRevision(current)!==scope.configurationRevision||!['testing','live'].includes(current.status)||!connection||connection.availabilityConsentVersion!==CALENDAR_AVAILABILITY_CONSENT_VERSION||connection.connectionId!==scope.connectionId||connection.targetId!==scope.targetId||connection.grantEpoch!==scope.grantEpoch||!calendarConnectionEnabled()||process.env.CALENDAR_DELIVERY_ENABLED!=='true'||calendarExecutionPolicy()?.digest!==scope.policyDigest)fail();
  await assertCalendarExecution(current,{targetId:scope.targetId});
  return connection;
}
async function calendarRequired(c) {
  const current=await strictRead('clients',c.slug),retained=await strictRead('calendar_connections',c.slug);
  if(!supportedWorkspace(current)||workspaceTenant(current)!==workspaceTenant(c))fail();
  const selected=current.onboarding?.desiredChannels?.includes('calendar'),owned=retained?.tenantIdentity===workspaceTenant(c);
  return selected||(owned&&!['not_connected','disconnected'].includes(retained.status));
}
export async function calendarBusyProjection(c,date,days,{fresh=false,accessToken,deadline=Date.now()+15000}={}) {
  if(!supportedWorkspace(c))return null; // Preserve legacy/manual scheduling.
  if(!await calendarRequired(c))return null;
  const connection=await getCalendarConnection(c.slug),policy=calendarExecutionPolicy();
  if(connection&&connection.availabilityConsentVersion!==CALENDAR_AVAILABILITY_CONSENT_VERSION)throw new CalendarError('calendar_consent_required','Review the updated Calendar access and reconnect before checking availability or offering a visit.',409);
  if(!connection||!policy||!calendarConnectionEnabled()||process.env.CALENDAR_DELIVERY_ENABLED!=='true'||(process.env.SERVICE_WORKER_KEY||'').length<32)fail();
  if(!isoDateValid(date)||!Number.isInteger(days)||days<1||days>14)fail();
  const scope={tenant:workspaceTenant(c),configurationRevision:configurationRevision(c),connectionId:connection.connectionId,targetId:connection.targetId,grantEpoch:connection.grantEpoch,policyDigest:policy.digest},from=calendarWallInstant(date),to=calendarWallInstant(addDays(date,days));
  const key=c.slug+'/'+hash(JSON.stringify([scope,date,days]));
  await authority(c,scope);
  const cached=await strictRead(STORE,key);
  if(!fresh&&cached&&cached.version===1&&cached.from===from&&cached.to===to&&cached.tenant===scope.tenant&&cached.connectionId===scope.connectionId&&cached.policyDigest===scope.policyDigest&&Number.isFinite(cached.checkedAt)&&cached.checkedAt<=Date.now()&&Date.now()-cached.checkedAt<TTL&&Array.isArray(cached.intervals)&&cached.intervals.length<=1000&&cached.intervals.every(e=>typeof e.id==='string'&&e.id&&Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>e.start&&(e.owner===null||/^[a-f0-9]{64}$/.test(e.owner))))return {...cached,scope};
  const generation=await atomicUpdate(STORE,key,previous=>{if(previous?.requestGeneration!==undefined&&(!Number.isSafeInteger(previous.requestGeneration)||previous.requestGeneration<1))fail();const n=(previous?.requestGeneration||0)+1;return {value:{...previous,requestGeneration:n},result:n};});
  const token=accessToken||await googleAccessToken(c.slug,connection.connectionId,{deadline}),intervals=[];
  let pageToken=null,zone=null;const seen=new Set();
  for(let page=0;page<MAX_PAGES;page++) {
    const params=new URLSearchParams({timeMin:new Date(from).toISOString(),timeMax:new Date(to).toISOString(),singleEvents:'true',showDeleted:'false',maxResults:'250',fields:CALENDAR_BUSY_FIELDS});if(pageToken)params.set('pageToken',pageToken);
    let response,data;
    try{response=await guardedCalendarFetch(c,'calendarRead',`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.targetId)}/events?${params}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))},{targetId:connection.targetId,busyRange:{from,to},deadline,authorize:async()=>{await authority(c,scope);return true;}});data=await response.json();}catch(error){if(String(error.code||'').startsWith('calendar_'))throw error;fail();}
    if(!response.ok||!Array.isArray(data.items)||data.items.length>250||typeof data.timeZone!=='string'||!data.timeZone||zone&&zone!==data.timeZone)fail();
    zone=data.timeZone;calendarWallInstant(date,0,zone); // Validate IANA timezone even for an empty result.
    for(const item of data.items){const e=normalizedEvent(item,zone);if(e&&e.end>from&&e.start<to){if(seen.has(e.id))fail();seen.add(e.id);intervals.push(e);}}
    if(!data.nextPageToken){await authority(c,scope);const value={version:1,tenant:scope.tenant,connectionId:scope.connectionId,policyDigest:scope.policyDigest,from,to,checkedAt:Date.now(),intervals,requestGeneration:generation};await atomicUpdate(STORE,key,previous=>{if(previous?.requestGeneration!==generation)fail();return {value};});return {...value,scope};}
    if(typeof data.nextPageToken!=='string'||data.nextPageToken.length>2048||data.nextPageToken===pageToken)fail();pageToken=data.nextPageToken;
  }
  fail(); // Incomplete pagination must never become an empty calendar.
}
export async function assertCalendarBusyProjection(c,projection,{fresh=false}={}) {
  if(!projection){if(supportedWorkspace(c)&&await calendarRequired(c))fail();return;}
  if(!Number.isFinite(projection.checkedAt)||Date.now()<projection.checkedAt||Date.now()-projection.checkedAt>=(fresh?FRESH:TTL))fail();
  await authority(c,projection.scope);
  if(Date.now()-projection.checkedAt>=(fresh?FRESH:TTL))fail();
}
// Local reservations and their exact owned Google copies share an identity. The
// sweep counts that identity once, including overlapping old/new move holds.
export function calendarOccupiedCount(c,state,projection,date,window,excludeBookingId=null) {
  if(!projection)return null;
  const target=calendarWindowInterval(date,window),segments=[],identities=new Map();
  for(const [id,slots]of Object.entries(state.reservations||{})) {
    const eventId='mc'+hash(`machinesandcloud:calendar:v1:${workspaceTenant(c)}:${id}`),owner=hash(workspaceTenant(c)+':'+id);identities.set(eventId,{id,owner});
    if(id===excludeBookingId)continue;
    for(const slot of slots){const split=slot.indexOf('|');if(split<0)fail();const day=slot.slice(0,split),parts=/^(\d+)-(\d+)$/.exec(slot.slice(split+1));if(!parts)fail();const start=calendarWallInstant(day,Number(parts[1])),end=calendarWallInstant(day,Number(parts[2]));segments.push({start,end,id:'local:'+id});}
  }
  for(const e of projection.intervals) {
    if(!Number.isFinite(e.start)||!Number.isFinite(e.end)||e.end<=e.start)fail();
    const managed=identities.get(e.id),owns=managed?.owner===e.owner;
    // A move's own Google event can intersect its new window; exclude only the
    // exact deterministic ID and private owner tag, not an arbitrary prefix.
    const ownEvent=excludeBookingId&&e.id==='mc'+hash(`machinesandcloud:calendar:v1:${workspaceTenant(c)}:${excludeBookingId}`)&&e.owner===hash(workspaceTenant(c)+':'+excludeBookingId);
    if(ownEvent)continue;
    segments.push({...e,id:owns?'local:'+managed.id:'external:'+e.id});
  }
  const edges=[];for(const s of segments){const start=Math.max(target.start,s.start),end=Math.min(target.end,s.end);if(start<end){edges.push({at:start,delta:1,id:s.id},{at:end,delta:-1,id:s.id});}}
  edges.sort((a,b)=>a.at-b.at||a.delta-b.delta);const active=new Map();let max=0;
  for(const e of edges){const n=(active.get(e.id)||0)+e.delta;if(n)active.set(e.id,n);else active.delete(e.id);max=Math.max(max,active.size);}
  return max;
}
