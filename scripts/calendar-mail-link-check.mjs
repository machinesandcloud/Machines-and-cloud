import assert from 'node:assert/strict';
import {exactCalendarMessage} from './calendar-mail-link.mjs';import {TARGET} from './calendar-live-guard.mjs';
const now=Date.parse('2026-10-24T22:00:00Z'),requestedAt=new Date(now-10000).toISOString();
const good={recipient:TARGET.ownerEmail,subject:'Your Machines & Cloud sign-in link',receivedAt:new Date(now-5000).toISOString(),link:TARGET.origin+'/onboard.html?plan=starter#verify='+'a'.repeat(64)};
assert.equal(exactCalendarMessage(good,{requestedAt,now}).token,'a'.repeat(64));
let negatives=0;
for(const mutate of [x=>x.recipient='other@example.test',x=>x.subject='Other',x=>x.receivedAt=new Date(now-60000).toISOString(),x=>x.link=x.link.replace('/onboard.html','/admin.html'),x=>x.link=x.link.replace(TARGET.origin,'https://other.example.test'),x=>x.link+='&verify='+'b'.repeat(64),x=>x.link=x.link.replace('starter','growth')]){const input={...good};mutate(input);assert.throws(()=>exactCalendarMessage(input,{requestedAt,now}));negatives++;}
process.stdout.write(JSON.stringify({passed:negatives+1,failed:0,physicalRequests:0,browserReads:0,messageTokensPrinted:0})+'\n');
