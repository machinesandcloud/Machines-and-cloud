// Independent actual-handler reproduction. Synthetic memory only; no provider transport.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
let physicalAttempts=0;
const deny=()=>{physicalAttempts++;throw new Error('Independent QA forbids physical transport');};
net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;
syncBuiltinESMExports();globalThis.fetch=deny;
for(const name of Object.keys(process.env))if(/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|CALENDAR_|MANAGED_|MC_SELF_SERVICE_AI_PROOF|PHONE_ACQUISITION|SERVICE_|NETLIFY|BLOBS)/.test(name))delete process.env[name];
const origin='https://full-offer-qa.example.test';
Object.assign(process.env,{MC_MEMORY_STORE:'1',MC_FAKE_MODEL:'1',NODE_ENV:'test',URL:origin,PUBLIC_SITE_URL:origin,SERVICE_DELIVERY_ENABLED:'false'});
const hash=v=>createHash('sha256').update(v).digest('hex');
const sources=['desk.js','desk-requests.js','netlify/functions/client.mjs','netlify/functions/lib/request-followthrough.mjs','netlify/functions/lib/store.mjs','netlify/functions/lib/workspace-identity.mjs','index.html','industry-home-services.html'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,hash(readFileSync(p))]));
const sourceBefore=hashes();
const store=await import('../netlify/functions/lib/store.mjs');
const {newClient}=await import('../netlify/functions/lib/config.mjs');
const {workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs');
const handler=(await import('../netlify/functions/client.mjs')).default;

const client={...newClient({slug:'conversation-qa',ownerKey:'unused-fixture',owner:{name:'QA Owner',email:'qa-owner@example.test'},business:{name:'QA Services'}}),status:'testing',onboarding:{version:1}};
await store.saveClient(client);const token=hash('conversation-qa-token');await store.put('access_sessions',hash(token),{scope:'onboarding',status:'active',email:client.owner.email,expiresAt:new Date(Date.now()+3600000).toISOString()});
async function read(query=''){const r=await handler(new Request(origin+'/api/client?c='+client.slug+query,{headers:{Origin:origin,Authorization:'Bearer '+token}}));assert.equal(r.status,200);return r;}
const evidence=[];
for(const length of [13,41]){
 const contact='local-'+length;const conv=await store.getConversation(client,'web',contact);conv.messages=Array.from({length},(_,i)=>({role:i%2?'assistant':'user',at:new Date().toISOString(),content:'CONV'+length+'_MESSAGE_'+String(i+1).padStart(3,'0')+'_END'}));await store.saveConversation(conv);
 const owner=await(await read()).json(),shown=owner.conversations.find(row=>row.contact===contact),csv=await(await read('&export=conversations')).text(),retained=await store.getConversation(client,'web',contact);
 evidence.push({originalMessages:length,ordinaryUIProjectionMessages:shown.messages.length,retainedMessages:retained.messages.length,firstMessageInUI:JSON.stringify(shown).includes('CONV'+length+'_MESSAGE_001_END'),firstMessageInCSV:csv.includes('CONV'+length+'_MESSAGE_001_END'),thirteenthMessageFromEndInCSV:csv.includes('CONV'+length+'_MESSAGE_'+String(length-12).padStart(3,'0')+'_END')});
}
const result={at:new Date().toISOString(),base:'577961c6a406be22a7fb479db055145881776729',mode:'Independent actual owner GET/export handlers and actual conversation save; synthetic memory, physical transport forbidden',evidence,sourceBefore,sourceAfter:hashes(),physicalAttempts,interpretation:'Ordinary UI provides the last12 only. CSV recovers retained messages13to40, but saveConversation drops anything older than40 so fullconversation is not recoverable after41messages. No ordinary detail endpoint was found.'};assert.deepEqual(result.sourceBefore,result.sourceAfter);assert.equal(physicalAttempts,0);writeFileSync('scratchpad/full-offer-conversation-first.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({evidence,physicalAttempts,sourceStable:true}));
