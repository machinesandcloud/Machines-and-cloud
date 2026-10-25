// V8 owner-mail adapter: the existing supplemental journal owns every effect.
// No I/O or native work occurs on import.
import {createHash} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {createNativeMailCommand,PHASE} from './calendar-native-mail.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!=='0'.repeat(64);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
export const MAIL_BINDING_PATH='/tmp/mc-calendar-v10-private-20261025/mail-execution-binding.json';
const CONFIG='/tmp/mc-calendar-v10-mail-prep-20261025/mail-sources.json';
const FACTORY=new URL('./calendar-native-mail.mjs',import.meta.url);
export function assertMailPhaseAuthority(state,input,{expiresAt,now=Date.now()}){
 const restore=input?.mode==='url'&&input.url==='https://mail.google.com/mail/u/0/#inbox';
 if(!state||state.closed||state.nativeStarted&&!state.nativeRestored||!Number.isFinite(Date.parse(expiresAt))||now>=Date.parse(expiresAt)||!restore&&(state.halted||['cleanup','closed'].includes(state.phase)))throw Error('Mail current phase authority withdrawn');
}
export function validateMailExecutionBinding(value,{packet,packetSHA256,now=Date.now()}){
 if(!exact(value,['version','state','phaseId','packetSHA256','candidateCommit','approvedAt','approvalExpiresAt','factorySHA256','configSHA256'])||value.version!==1||value.state!=='READY'||value.phaseId!==PHASE||packet.phaseId!==PHASE||packet.approved!==true||value.packetSHA256!==packetSHA256||!hash(packetSHA256)||value.candidateCommit!==packet.candidateCommit||!/^[a-f0-9]{40}$/.test(value.candidateCommit||'')||value.approvedAt!==packet.approvedAt||value.approvalExpiresAt!==packet.approvalExpiresAt||!hash(value.factorySHA256)||!hash(value.configSHA256))throw Error('Mail execution binding mismatch');
 const start=Date.parse(value.approvedAt),end=Date.parse(value.approvalExpiresAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(now)||now<start||now>=end||end<=start||end-start>4*3600000)throw Error('Mail execution binding expired');
 return value;
}
export async function createCalendarMail({packet,packetSHA256,bindingSHA256,helper,authorize,now=()=>Date.now(),read=readFile,stat=lstat,uid=process.getuid()}){
 if(!hash(bindingSHA256))throw Error('Mail execution binding SHA required');
 const bytes=async(path,mode,max=100000)=>{const s=await stat(path);if(!s.isFile()||s.isSymbolicLink()||s.uid!==uid||(s.mode&0o7777)!==mode||s.size<1||s.size>max)throw Error('Mail private/source custody changed');return Buffer.from(await read(path));};
 async function verify(){
  const directory=await stat('/tmp/mc-calendar-v10-private-20261025');if(!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==uid||(directory.mode&0o7777)!==0o700)throw Error('Mail private directory custody changed');
  const raw=await bytes(MAIL_BINDING_PATH,0o600);if(sha(raw)!==bindingSHA256)throw Error('Mail execution binding changed');
  const binding=validateMailExecutionBinding(JSON.parse(raw),{packet,packetSHA256,now:now()});
  if(sha(await bytes(CONFIG,0o600))!==binding.configSHA256||sha(await bytes(FACTORY,0o644))!==binding.factorySHA256)throw Error('Mail source/config changed');
  validateMailExecutionBinding(binding,{packet,packetSHA256,now:now()});return binding;
 }
 await verify();let serial=Promise.resolve();
 return input=>{const operation=serial.then(async()=>{
  const binding=await verify();authorize(input);
  const snapshot=await helper('native-mail-snapshot');let revision=snapshot.nativeRevision;
  if(!Number.isSafeInteger(revision)||revision<0)throw Error('Mail journal revision unavailable');
  const control={native:structuredClone(snapshot.native)};
  const persistControl=async()=>{const saved=await helper('native-mail-save',{expectedRevision:revision,native:control.native});revision=saved.nativeRevision;};
  const factory=createNativeMailCommand({control,persistControl,readFile:read,lstat:stat,now,uid,sourcePin:binding.configSHA256,approval:{phaseId:packet.phaseId,packetSHA256,candidateCommit:packet.candidateCommit,approvedAt:packet.approvedAt,approvalExpiresAt:packet.approvalExpiresAt},execFile:async(path,args)=>{
   await verify();authorize(input);
   const result=await helper('native-mail-dispatch',{expectedRevision:revision,invocationId:control.native.invocations,mode:args[0],argument:args[1]});
   revision=result.nativeRevision;control.native.rows.at(-1).dispatchState='observed';return {stdout:result.stdout};
  }});
  return factory(input);
 });serial=operation.catch(()=>{});return operation;};
}
