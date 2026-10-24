import assert from 'node:assert/strict';
import {exactCalendarMessage} from './calendar-mail-link.mjs';import {TARGET} from './calendar-live-guard.mjs';
const now=Date.parse('2026-10-24T22:00:00Z'),requestedAt=new Date(now-10000).toISOString();
const good={recipient:TARGET.ownerEmail,subject:'Your Machines & Cloud sign-in link',receivedAt:new Date(now-5000).toISOString(),link:TARGET.origin+'/onboard.html?plan=starter#verify='+'a'.repeat(64)};
assert.equal(exactCalendarMessage(good,{requestedAt,now}).token,'a'.repeat(64));
let negatives=0;
for(const mutate of [x=>x.recipient='other@example.test',x=>x.subject='Other',x=>x.receivedAt=new Date(now-60000).toISOString(),x=>x.link=x.link.replace('/onboard.html','/admin.html'),x=>x.link=x.link.replace(TARGET.origin,'https://other.example.test'),x=>x.link+='&verify='+'b'.repeat(64),x=>x.link=x.link.replace('starter','growth')]){const input={...good};mutate(input);assert.throws(()=>exactCalendarMessage(input,{requestedAt,now}));negatives++;}
try{exactCalendarMessage({...good,link:'https://[malformed]/'+'a'.repeat(64)},{requestedAt,now});assert.fail('Malformed URL accepted');}catch(error){assert.equal(error.input,undefined);assert(!error.stack.includes('a'.repeat(64)));negatives++;}
const minute={...good,receivedAt:'2026-10-24T21:59:00.000Z',receivedPrecision:'minute'};
assert.equal(exactCalendarMessage(minute,{requestedAt,now}).token,'a'.repeat(64));
let minuteNegatives=0;
for(const input of [
 {...minute,receivedPrecision:'second'},
 {...minute,receivedPrecision:'hour'},
 {...minute,receivedAt:'2026-10-24T21:59:01.000Z'},
 {...minute,receivedAt:'2026-10-24T21:59:00.001Z'},
 {...minute,receivedAt:'2026-10-24T21:58:00.000Z'},
 {...minute,receivedAt:'2026-10-24T22:02:00.000Z'},
 {...minute,recipient:'ngoumnaisteve+mc-calendar-20261024@gmail.com'},
 {...minute,unobserved:true}
]){assert.throws(()=>exactCalendarMessage(input,{requestedAt,now}));minuteNegatives++;}
assert.throws(()=>exactCalendarMessage(minute,{requestedAt:new Date(now-21*60000).toISOString(),now}));minuteNegatives++;
assert.throws(()=>exactCalendarMessage(minute,{requestedAt,now:NaN}));minuteNegatives++;
process.stdout.write(JSON.stringify({passed:negatives+2+minuteNegatives,failed:0,physicalRequests:0,browserReads:0,messageTokensPrinted:0,minutePrecision:'Explicit interval; executor independently selects exact newest post-request message'})+'\n');
