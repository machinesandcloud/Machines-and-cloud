import {createHash} from 'node:crypto';
export const PHASE='core-calendar-borrowed-launch-v10-20261025';
export const NATIVE_MAIL_SOURCES_SHA256='0000000000000000000000000000000000000000000000000000000000000000';
// BEGIN_NATIVE_MAIL: same control ledger; injectable effects only for offline checks.
export function createNativeMailCommand({control,persistControl,readFile,lstat,execFile,now=()=>Date.now(),sourcePin=NATIVE_MAIL_SOURCES_SHA256,uid=process.getuid(),approval}){
 const prep='/tmp/mc-calendar-v10-mail-prep-20261025',configPath=prep+'/mail-sources.json',navigationPath=prep+'/mail-navigation.json',binaryPath=prep+'/native-mail',swiftPath=prep+'/native-mail.swift',zero='0'.repeat(64);
 const reject=code=>{const error=Error('Native mail rejected: '+code);error.code='native_mail_'+code;throw error;};
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),keys=(o,k)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===[...k].sort().join('|'),pin=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!==zero;
 const gmail=url=>{try{const u=new URL(url);return u.origin==='https://mail.google.com'&&u.pathname==='/mail/u/0/'&&!u.username&&!u.password&&!u.port&&!u.search;}catch{return false;}};
 async function bytes(path,mode,max=65536){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.uid!==uid||(s.mode&0o7777)!==mode||s.size<1||s.size>max)reject('file_custody');return Buffer.from(await readFile(path));}
 async function verified(c){
  if(!pin(sourcePin))reject('sources_unbound');
  const raw=await bytes(configPath,0o600);if(hash(raw)!==sourcePin)reject('sources_changed');let cfg;try{cfg=JSON.parse(raw);}catch{reject('sources_shape');}
  if(!keys(cfg,['version','phaseId','state','issuedAt','expiresAt','limits','helper','navigation','sources','approval','candidateCommit'])||cfg.version!==1||cfg.phaseId!==PHASE||cfg.state!=='READY'||!keys(cfg.limits,['invocations','messageReads'])||cfg.limits.invocations!==40||cfg.limits.messageReads!==3||!keys(cfg.helper,['path','sha256','sourcePath','sourceSHA256'])||cfg.helper.path!==binaryPath||cfg.helper.sourcePath!==swiftPath||!pin(cfg.helper.sha256)||!pin(cfg.helper.sourceSHA256)||!keys(cfg.navigation,['path','sha256'])||cfg.navigation.path!==navigationPath||!pin(cfg.navigation.sha256)||!Array.isArray(cfg.sources)||cfg.sources.length!==6)reject('sources_shape');
  if(!keys(approval,['phaseId','packetSHA256','candidateCommit','approvedAt','approvalExpiresAt'])||approval.phaseId!==PHASE||!pin(approval.packetSHA256)||!(/^[a-f0-9]{40}$/.test(approval.candidateCommit||''))||!keys(cfg.approval,['packetSHA256','approvedAt','approvalExpiresAt'])||cfg.approval.packetSHA256!==approval.packetSHA256||cfg.approval.approvedAt!==approval.approvedAt||cfg.approval.approvalExpiresAt!==approval.approvalExpiresAt||cfg.candidateCommit!==approval.candidateCommit)reject('approval_unbound');
  const issued=Date.parse(cfg.issuedAt),expiry=Date.parse(cfg.expiresAt),approved=Date.parse(approval.approvedAt),approvalEnd=Date.parse(approval.approvalExpiresAt),at=now();if(![issued,expiry,approved,approvalEnd,at].every(Number.isFinite)||approved>issued||approved>at||approvalEnd<=approved||approvalEnd-approved>4*3600000||issued>at||expiry<=at||expiry-issued>4*3600000||expiry<=issued||cfg.expiresAt!==approval.approvalExpiresAt)reject('expired');
  const permittedSources={'account-meta':'metadata','owner-rows':'metadata','owner-open':'action','owner-message-meta':'metadata','owner-extract':'message','owner-return':'action'},sourceTypes=Object.fromEntries(Object.entries(permittedSources).map(([name,type])=>[prep+'/mail-js/'+name+'.js',type]));
  if(new Set(cfg.sources.map(s=>s?.path)).size!==cfg.sources.length||cfg.sources.some(s=>!keys(s,['path','sha256','type'])||!Object.hasOwn(sourceTypes,s.path)||sourceTypes[s.path]!==s.type||!pin(s.sha256)))reject('source_allowlist');
  if(hash(await bytes(binaryPath,0o700,10000000))!==cfg.helper.sha256||hash(await bytes(swiftPath,0o600))!==cfg.helper.sourceSHA256)reject('helper_changed');
  const navRaw=await bytes(navigationPath,0o600);if(hash(navRaw)!==cfg.navigation.sha256)reject('navigation_changed');let nav;try{nav=JSON.parse(navRaw);}catch{reject('navigation_shape');}
  if(!keys(nav,['version','phaseId','windowID','tabID','chromePID','origin','accountPath','originalURL','searchURLs','issuedAt','expiresAt','approvalExpiresAt','state'])||nav.version!==1||nav.phaseId!==PHASE||nav.windowID!==1802417929||nav.tabID!==1802419976||nav.chromePID!==691||nav.origin!=='https://mail.google.com'||nav.accountPath!=='/mail/u/0/'||nav.originalURL!=='https://mail.google.com/mail/u/0/#inbox'||nav.state!=='READY'||nav.issuedAt!==cfg.issuedAt||nav.expiresAt!==cfg.expiresAt||nav.approvalExpiresAt!==approval.approvalExpiresAt||!Array.isArray(nav.searchURLs)||!nav.searchURLs.length||nav.searchURLs.length>12||new Set(nav.searchURLs).size!==nav.searchURLs.length||nav.searchURLs.some(url=>!gmail(url)||!new URL(url).hash.startsWith('#search/')))reject('navigation_shape');
  if(c.mode==='url'){if(!keys(c,['action','mode','url'])||typeof c.url!=='string'||c.url!==nav.originalURL&&!nav.searchURLs.includes(c.url))reject('navigation_not_approved');return {cfg,nav,type:'navigation',restore:c.url===nav.originalURL,argument:c.url,sourceHash:null};}
  if(!keys(c,['action','mode','source']))reject('command_shape');const source=cfg.sources.find(s=>s.path===c.source);if(!source||c.mode==='private'&&source.type!=='message'||c.mode==='read'&&source.type==='message')reject('source_not_approved');
  if(hash(await bytes(source.path,0o600))!==source.sha256)reject('script_changed');return {cfg,nav,type:source.type,restore:false,argument:source.path,sourceHash:source.sha256};
 }
 function publicResult(c,stdout){let value;try{value=JSON.parse(stdout);}catch{reject('output_unconfirmed');}
  if(c.mode==='private'){if(!keys(value,['privateMailDataSaved'])||value.privateMailDataSaved!==true)reject('output_unconfirmed');return {privateMailDataSaved:true};}
  if(c.mode==='url'){if(!keys(value,['targetMailNavigationDispatched'])||value.targetMailNavigationDispatched!==true)reject('output_unconfirmed');return {targetMailNavigationDispatched:true};}
  const booleans=['accountMatch','phaseMatch','recipientMatch','subjectMatch','timeMatch','found','ready','clicked','ownerReceipt'];
  if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length||Object.keys(value).some(key=>booleans.includes(key)?typeof value[key]!=='boolean':key==='matches'?!Number.isSafeInteger(value[key])||value[key]<0||value[key]>6:key==='phaseId'?value[key]!==PHASE:true))reject('output_unconfirmed');
  return {nativeMail:JSON.parse(JSON.stringify(value))};
 }
 let serial=Promise.resolve();
 return c=>{const work=serial.then(async()=>{
  if(c?.action!=='nativeMail'||!['url','read','private'].includes(c.mode))reject('command_shape');
  const v=await verified(c),n=control.native;if(!n||n.maxInvocations!==40||n.maxMessageReads!==3||!Number.isSafeInteger(n.invocations)||n.invocations<0||!Number.isSafeInteger(n.messageReads)||n.messageReads<0||n.invocations>40||n.messageReads>3||typeof n.unknown!=='boolean'||typeof n.restoreAttempted!=='boolean'||!Array.isArray(n.rows)||n.rows.length!==n.invocations)reject('ledger_invalid');
  if(n.restoreAttempted||n.unknown&&!v.restore)reject('unknown_or_cleanup_only');
  if(n.invocations>=(v.restore?40:39)||v.type==='message'&&n.messageReads>=3)reject('budget_exhausted');
  const priorUnknown=n.unknown,row={id:n.invocations+1,mode:c.mode,type:v.type,sourceSHA256:v.sourceHash,configurationSHA256:sourcePin,navigationSHA256:v.cfg.navigation.sha256,restore:v.restore,state:'reserved_unknown',at:new Date(now()).toISOString()};
  n.invocations++;if(v.type==='message')n.messageReads++;if(v.restore)n.restoreAttempted=true;n.unknown=true;n.rows.push(row);
  try{await persistControl();}catch{reject('reservation_unconfirmed');}
  try{
   // Local awaits may withdraw source/clock authority: fence again after fsync.
   const current=await verified(c);if(current.type!==v.type||current.argument!==v.argument||current.sourceHash!==v.sourceHash)reject('authority_changed');
   const dispatchAt=now();if(!Number.isFinite(dispatchAt)||dispatchAt<Date.parse(current.cfg.issuedAt)||dispatchAt>=Date.parse(current.cfg.expiresAt)||dispatchAt>=Date.parse(approval.approvalExpiresAt))reject('expired');
   const result=await execFile(binaryPath,[c.mode,v.argument],{timeout:15000,maxBuffer:65536,encoding:'utf8',killSignal:'SIGKILL'});
   const reply=publicResult(c,result.stdout);row.state='observed';row.completedAt=new Date(now()).toISOString();n.unknown=priorUnknown;
   try{await persistControl();}catch{n.unknown=true;row.state='unknown';reject('completion_unconfirmed');}return reply;
  }catch(error){n.unknown=true;row.state='unknown';row.reason=typeof error?.code==='string'&&error.code.startsWith('native_mail_')?error.code:'native_mail_execution_unconfirmed';row.completedAt=new Date(now()).toISOString();try{await persistControl();}catch{}reject(row.reason.replace(/^native_mail_/,''));}
 });serial=work.catch(()=>{});return work;};
}

export function freshNativeMailState(){return {maxInvocations:40,maxMessageReads:3,invocations:0,messageReads:0,rows:[],unknown:false,restoreAttempted:false};}
