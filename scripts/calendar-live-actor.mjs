// Fixed command adapter for calendar-live-guard. No I/O at import or by default.
import { createHash } from 'node:crypto';
import { readFile,writeFile,lstat,access,open } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createController,TARGET,RUNTIME_LIMITS,plan } from './calendar-live-guard.mjs';
import { createNativeHandoff } from './calendar-live-native.mjs';
import {createBorrowedNativeHandoff} from './calendar-borrowed-native.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const canon=value=>Array.isArray(value)?value.map(canon):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canon(value[key])])):value;
const digest=value=>hash(JSON.stringify(canon(value)));
const stores=['calendar_connections','calendar_deliveries','calendar_oauth'];
const envKeys=['CALENDAR_CONNECTION_ENABLED','CALENDAR_DELIVERY_ENABLED','CALENDAR_EXECUTION_POLICY_JSON','CALENDAR_EXECUTION_APPROVED_VERSION'];
const root=fileURLToPath(new URL('../',import.meta.url));
export function createActor({controller:c,packet:p,helper,native,privateRead,privateWrite,netlifyToken,now=()=>Date.now()}) {
  let token=null,slug=null,current=null,binding=null,job=null;const sessions=[];
  const headers=()=>({'Content-Type':'application/json',Origin:TARGET.origin,...(token?{Authorization:'Bearer '+token}:{})});
  const app=async(body,path=slug?'/api/client?c='+slug:'/api/access')=>{
    const result=await c.request({url:TARGET.origin+path,method:body?'POST':'GET',headers:headers(),...(body?{body}:{})});
    if(path.startsWith('/api/client?')&&!body)current=result.data;
    return result.data;
  };
  const blob=async(store,key='')=>{
    const route=p.blobRoutes.find(row=>row.store===store);
    // The Netlify SDK preserves ':' and '/' in record paths. Encoding ':'
    // changes budget/health lookups before the API issues its signed URL.
    const result=await c.request({url:route.origin+route.prefix+encodeURIComponent(key).replace(/%2F/gi,'/').replace(/%3A/gi,':'),headers:{Authorization:'Bearer '+netlifyToken}});
    return result.data;
  };
  const metadata=()=>c.request({url:'https://api.netlify.com/api/v1/sites/'+TARGET.siteId,headers:{Authorization:'Bearer '+netlifyToken}});
  const budget=()=>blob('calendar_execution_budgets','calendar-v1:'+p.policyVersion);
  const times=()=>{if(!p.fixture.availabilitySelection)return p.fixture;const s=c.state().selection;if(!s)throw Error('Select checked available times before creating a visit');return {date:s.create.date,window:s.create.window,moveDate:s.move?.date,moveWindow:s.move?.window};};
  const preview=moving=>({action:'visit_availability',expectedRevision:current.configurationRevision,date:p.fixture.availabilitySelection.from,days:p.fixture.availabilitySelection.days,...(moving?{visitId:binding.visitId,expectedVisitRevision:(current.bookings||[]).find(row=>row.id===binding.visitId)?.ownerVisit?.revision}:{})});
  const visit=()=>({action:'create_visit',expectedRevision:current.configurationRevision,submissionId:p.fixture.visitSubmissionId,customer_name:'Alex Example',phone:'(713) 555-0142',address:'12 Oak St, Katy, TX (synthetic test)',issue:'Internal Calendar lifecycle verification',date:times().date,window:times().window});
  return {async command(input) {
    if(!input||typeof input!=='object'||!['baseline','request-link','exchange','create-workspace','owner','census-bind','stage','publish','ready','start','native-open','native-confirm','native-close','native-restore','native-observe','select-times','create','move','probe-old','cancel-visit','probe-cancelled','receipt','budget','cleanup','disconnect','cancel-workspace','signout-all','restore','cleanup-build','closed','status'].includes(input.action))throw Error('Unknown fixed Calendar command');
    const action=input.action;
    if(action==='status')return {guard:c.state(),control:await helper('status')};
    if(action==='baseline'){const site=(await metadata()).data;const env=await helper('env');return {commit:site.published_deploy?.commit_ref,state:site.published_deploy?.state,disabled:site.disabled,environmentSnapshotSHA256:env.snapshotSHA256};}
    if(action==='request-link'){await app({action:'request_link',email:TARGET.ownerEmail,plan:'starter'},'/api/access');return {requested:true,recipient:TARGET.ownerEmail};}
    if(action==='exchange') {
      const message=await privateRead(input.file);await c.registerExactMessageToken(message);
      const response=await app({action:'exchange',token:message.token},'/api/access');token=response.session;if(!sessions.includes(token))sessions.push(token);
      return {signedIn:true,recipient:response.email,expiresAt:response.expiresAt};
    }
    if(action==='create-workspace'){const response=await app(p.fixture.signupFields,'/api/onboard');slug=response.slug;await app();return {created:true,slug};}
    if(action==='owner'){await app();return {slug,configurationRevision:current.configurationRevision,calendar:current.connections?.calendar,visits:(current.bookings||[]).map(row=>({id:row.id,status:row.status}))};}
    if(action==='census-bind') {
      if(binding)throw Error('Cohort is immutable');await c.next('census');
      const client=await blob('clients',slug),identity=hash(JSON.stringify([slug,client.ownerKey,TARGET.ownerEmail]));
      const snapshot=[];
      for(const store of stores) {
        const first=await blob(store),rows=[];
        for(const entry of first.blobs||[]){const value=await blob(store,entry.key);rows.push({key:entry.key,digest:digest(value),inCohort:value.slug===slug||store==='calendar_connections'&&entry.key===slug||store==='calendar_deliveries'&&entry.key.startsWith(slug+'/')});}
        await blob(store);snapshot.push({kind:store,rows:rows.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)});
      }
      const primary=await privateRead(input.file||'prior-primary-observation.json');
      const ids=[p.fixture.visitSubmissionId,p.fixture.oldWindowProbeSubmissionId,p.fixture.cancelledWindowProbeSubmissionId].map(submission=>hash(identity+':'+submission).slice(0,32));
      const policy={version:p.policyVersion,expiresAt:new Date(now()+60*60000).toISOString(),tenant:{slug,identity},googleClientIdHash:p.googleClientIdHash,targetIdHash:hash(primary.primaryCalendarId),censusDigest:digest(snapshot),censusMode:'clean_initial',bookingIds:ids,limits:{...RUNTIME_LIMITS}};
      binding=await c.bindCohort({...primary,policy});await privateWrite('calendar-binding.json',binding);await c.next('publish');return {slug,visitId:binding.visitId,eventId:binding.eventId,policyDigest:binding.digest,expiresAt:policy.expiresAt};
    }
    if(action==='stage') {
      await helper('prepare','calendar-binding.json');
      const values={CALENDAR_CONNECTION_ENABLED:'true',CALENDAR_DELIVERY_ENABLED:'true',CALENDAR_EXECUTION_POLICY_JSON:JSON.stringify(binding.policy),CALENDAR_EXECUTION_APPROVED_VERSION:p.policyVersion};
      for(const key of envKeys)await c.stageEnvironment({key,value:values[key],context:'production',scopes:['functions']},()=>helper('apply-key',key));
      const readback=await helper('env');if(readback.stagedVerified!==true)throw Error('Staged environment not verified');
      await c.recordStagedEnvironment({policyDigest:binding.digest,oldDeploymentCommit:TARGET.baselineCommit,oldSnapshotUnchanged:true,newCandidateCommit:p.candidateCommit,calendarConnection:true,calendarDelivery:true,otherServiceGatesOff:true,evidenceSHA256:readback.snapshotSHA256});
      return {staged:true,settings:4};
    }
    if(action==='publish'){await helper('remote');return c.publish(async()=>{const receipt=await helper('push');return {pushedCommit:receipt.pushed,buildsTriggered:1};});}
    if(action==='ready'){const result=await metadata();if(result.data.published_deploy?.state==='ready'&&result.data.published_deploy?.commit_ref===p.candidateCommit){await privateWrite('initial-ready-deployment.json',{siteId:TARGET.siteId,commit:p.candidateCommit,deployId:result.data.published_deploy.id});await c.next('calendar');}return {commit:result.data.published_deploy?.commit_ref,state:result.data.published_deploy?.state};}
    if(action==='start'){await app();await budget();await app({action:'start_calendar_connection',availabilityConsentVersion:'2026-10-24-busy-v1',expectedRevision:current.configurationRevision});return {started:true,ownerMustReviewGoogle:true};}
    if(action==='native-open'){await budget();return c.beginNativeHandoff(input=>native.open(input));}
    if(action==='native-confirm'){const connection=await blob('calendar_connections',slug);await app();const used=await budget();if(connection.status!=='connected'||current.connections?.calendar?.connected!==true||used.used?.tokenExchange!==1||used.used?.calendarRead<1)return {connected:false,pending:true};return c.confirmNativeCompletion();}
    if(action==='native-observe'){if(!p.native||!c.state().nativeStarted)throw Error('Borrowed native handoff not started');return native.observe();}
    if(action==='native-restore'){if(c.state().nativeRestored)return {alreadyRestored:true};return c.restoreNativeHandoff(()=>native.restore());}
    if(action==='native-close'){if(c.state().nativeClosed)return {alreadyClosed:true};return c.closeNativeHandoff(()=>native.close());}
    if(action==='budget'){const row=await budget();return {used:row.used,policyDigest:row.policyDigest};}
    if(action==='select-times'){if(!p.fixture.availabilitySelection)throw Error('Packet does not declare checked-window selection');await app();await budget();await app(preview(false));return {selected:true,selection:c.state().selection};}
    if(action==='create'){await app();await budget();const result=await app(visit());return {visit:result.visit,localSaved:result.localSaved};}
    if(action==='move'){await app();await budget();if(p.fixture.availabilitySelection){await app(preview(true));await budget();}const own=(current.bookings||[]).find(row=>row.id===binding.visitId)?.ownerVisit;return app({action:'reschedule_visit',expectedRevision:current.configurationRevision,expectedVisitRevision:own?.revision,submissionId:p.fixture.moveSubmissionId,visitId:binding.visitId,date:times().moveDate,window:times().moveWindow});}
    if(action==='probe-old'||action==='probe-cancelled') {
      await app();await budget();const body=visit();body.submissionId=action==='probe-old'?p.fixture.oldWindowProbeSubmissionId:p.fixture.cancelledWindowProbeSubmissionId;
      if(action==='probe-cancelled'){body.date=times().moveDate;body.window=times().moveWindow;}
      const response=await app(body);await app();return {expectedRejection:response.error,noSecondVisit:true};
    }
    if(action==='cancel-visit'){await app();await budget();const own=(current.bookings||[]).find(row=>row.id===binding.visitId)?.ownerVisit;return app({action:'cancel_visit',expectedRevision:current.configurationRevision,expectedVisitRevision:own?.revision,submissionId:p.fixture.cancelSubmissionId,visitId:binding.visitId});}
    if(action==='receipt') {
      job=await blob('calendar_deliveries',`${slug}/${binding.policy.tenant.identity}/${binding.visitId}`);
      if(!['synced','cancelled'].includes(job.state))return {state:job.state,reasonCode:job.reasonCode,nextAttemptAt:job.nextAttemptAt,observed:false};
      await blob('health','calendarDelivery:lastDispatch');await blob('health','calendarDelivery:lastRun');await budget();
      const observed=await c.observeReceipt({stage:input.stage,visitId:binding.visitId,eventId:binding.eventId,targetHash:binding.policy.targetIdHash,sourceRevision:job.sourceRevision,confirmed:true,ownedRemoteConfirmed:true});return {stage:input.stage,state:job.state,eventId:job.eventId,confirmedAt:job.receipt.confirmedAt,...observed,ordinaryScheduled:observed.accepted===true&&observed.scheduledDispatchObserved===true};
    }
    if(action==='cleanup'){await c.next('cleanup');return {cleanupOnly:true};}
    if(action==='disconnect')return app({action:'disconnect_calendar'});
    if(action==='cancel-workspace')return app({action:'cancel',reason:'Internal Calendar verification complete; retain audit records'});
    if(action==='signout-all'){for(const session of sessions){token=session;await app({action:'sign_out'},'/api/access');}token=null;return {sessionsRevoked:sessions.length};}
    if(action==='restore'){if(!c.state().environmentAttempted.length)return {settingsUntouched:true,restorationNotNeeded:true};await helper('cleanup-env');for(const key of c.state().environmentAttempted)await c.restoreEnvironment(key,()=>helper('restore-key',key));const result=await helper('env');await c.confirmEnvironmentRestored(result);return {restored:true,snapshotSHA256:result.snapshotSHA256};}
    if(action==='cleanup-build'){await helper('site');await helper('remote');await c.cleanupPublish(()=>helper('cleanup-build'));return {cleanupBuildRequested:true};}
    if(action==='closed'){await metadata();if(c.state().counters.builds>0&&!c.state().cleanupPublished)return {closed:false,cleanupDeploymentPending:true,guard:c.state()};if(c.state().environmentAttempted.length){const readback=await helper('env');if(readback.originalEnvironmentRestored!==true)throw Error('Final cleanup environment readback not confirmed');}await c.next('closed');await c.closePersistence();return {closed:true,guard:c.state(),control:await helper('status')};}
  }};
}

async function executeCLI(packetPath,approvedSHA) {
  const packet=JSON.parse(await readFile(packetPath,'utf8')),directory=dirname(resolve(packetPath));
  // Neither ledger can be reopened. Validate the app guard before initializing
  // the supplemental fixed48 control adapter. No approval is generated here.
  for(const name of ['-ledger.jsonl','-control.jsonl']){try{await access(resolve(root,'scratchpad',packet.phaseId+name));throw Error('Existing phase artifact; do not reset/resume');}catch(error){if(error.code!=='ENOENT')throw error;}}
  const c=await createController({mode:'execute',approvedPacketPath:packetPath,approvedPacketSHA256:approvedSHA});
  const run=promisify(execFile);
  async function helper(command,input) {
    const value=input==='calendar-binding.json'?resolve(directory,input):input;
    const args=[resolve(root,'scripts/calendar-live-control.py'),'--packet',resolve(packetPath),'--sha256',approvedSHA,command,...(value?[value]:[])];
    try{return JSON.parse((await run('python3',args,{cwd:root,maxBuffer:100000,timeout:120000})).stdout);}catch{throw Error('Fixed control adapter failed; inspect private receipt, never retry unknown effects');}
  }
  await helper('init');
  const config=JSON.parse(await readFile(resolve(process.env.HOME,'Library/Preferences/netlify/config.json'),'utf8')),user=config.users[config.userId],netlifyToken=user.auth?.token||user.token;
  if(!netlifyToken)throw Error('Existing Netlify authentication unavailable');
  async function privateRead(file) {
    if(file==='prior-primary-observation.json'){const raw=await readFile(resolve(root,'scratchpad/core-calendar-primary-settings-observation.json'),'utf8'),row=JSON.parse(raw);if(row.account!==TARGET.calendarAccount||!String(row.ownerLabelObserved||'').endsWith('(Owner)')||row.calendarIdLabelObserved!=='Calendar ID'||typeof row.calendarIdObserved!=='string'||!row.calendarIdObserved)throw Error('Historical owned-primary observation unavailable');return {primaryAccount:row.account,primaryOwnedUIConfirmed:true,primaryCalendarId:row.calendarIdObserved,primaryUIEvidenceSHA256:hash(raw)};}
    if(!/^[a-z0-9-]+\.json$/.test(file||''))throw Error('Exact private basename required');
    const path=resolve(directory,file),stat=await lstat(path);
    if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o600||stat.uid!==process.getuid())throw Error('Private0600 input required');
    return JSON.parse(await readFile(path,'utf8'));
  }
  const privateWrite=async(name,value)=>{const h=await open(resolve(directory,name),'wx',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync();}finally{await h.close();}};
  const native=packet.native?createBorrowedNativeHandoff({binding:packet.native,directory,phaseId:packet.phaseId,record:privateWrite,authorize:input=>c.assertNativeAuthority(input)}):createNativeHandoff();
  const actor=createActor({controller:c,packet,helper,native,privateRead,privateWrite,netlifyToken});
  process.stdout.write(JSON.stringify({ready:true,phase:packet.phaseId,nativeBrowserNotOpened:true})+'\n');
  for await(const line of createInterface({input:process.stdin,terminal:false})) {
    try{const result=await actor.command(JSON.parse(line));process.stdout.write(JSON.stringify({ok:true,result})+'\n');}
    catch(error){process.stdout.write(JSON.stringify({ok:false,error:error.code||'command_failed',guard:c.state()})+'\n');}
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]!=='--execute')process.stdout.write(JSON.stringify({...plan(),adapter:'Fixed JSON-lines commands; --execute requires private approved packet and SHA. Default is inert.'},null,2)+'\n');
  else await executeCLI(process.argv[3],process.argv[4]);
}
