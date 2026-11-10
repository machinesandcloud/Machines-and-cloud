import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {buildConnectionJourney as after} from '../../../netlify/functions/lib/connection-journey.mjs';
import {buildConnectionJourney as before} from './baseline-connection-journey.mjs';
const c={status:'live',onboarding:{version:1,desiredChannels:['web']},setupProof:{reviewedRevision:'R',testedRevision:'R',testMode:'live'}};
const row=(fn,web,website=null)=>fn(c,{},null,{revision:'R',channels:{web}},website).channels.find(r=>r.id==='web');
const cases=[];
for(const [id,blockers,target] of [['review',[{id:'review'}],'know'],['test',[{id:'test'}],'test'],['model_only',[{id:'model'}],'setup'],['unknown_unready',[],'setup']]){
 const web={active:true,ready:false,blockers},r=row(after,web);assert.equal(r.active,false);assert.match(r.detail,/unavailable/i);assert.equal(r.action.target,target);assert.equal(web.active,true);assert.equal(r.verification.working,false);cases.push({case:id,state:'PASS',target});
}
const bad=row(before,{active:true,ready:false,blockers:[]});assert.match(bad.detail,/switched on/i);
const now=new Date(Date.now()-1000).toISOString(),website={originAllowed:true,observation:{state:'found',at:now},setupRequest:{state:'complete',at:now},customerChat:{available:true}};
const good=row(after,{active:true,ready:true,blockers:[]},website);assert.equal(good.active,true);assert.equal(good.status,'active');
const out={state:'PASS',cases,baselineUnknownUnreadyContradiction:true,readyActivePreserved:true,proofAndFlagMutation:false,physicalRequests:0};writeFileSync(new URL('./projection-focused.json',import.meta.url),JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(out));
