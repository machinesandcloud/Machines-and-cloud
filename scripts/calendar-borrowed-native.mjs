// Proof-only fixed borrowed Chrome handoff; import performs no native/network work.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export const BORROWED_TARGET=Object.freeze({mode:'borrowed_regular_tab_v1',chromePID:691,windowId:1802417929,tabId:1802419976,originalURL:'https://mail.google.com/mail/u/0/#inbox',maxActions:24});
const sha=x=>createHash('sha256').update(x).digest('hex'),fail=code=>{throw Error('Borrowed Calendar handoff: '+code);};
export function validateBorrowedBinding(b){if(!b||Object.keys(b).sort().join(',')!==[...Object.keys(BORROWED_TARGET),'helperSHA256'].sort().join(',')||Object.entries(BORROWED_TARGET).some(([k,v])=>b[k]!==v)||!/^[a-f0-9]{64}$/.test(b.helperSHA256||''))fail('binding');return b;}
export async function runBorrowedSwift({path,pin,input}){
 const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o700||s.uid!==process.getuid()||sha(await readFile(path))!==pin)fail('helper_custody');
 if(!['prepare_restore','clear_restore','verify_restore'].includes(input.mode)&&Date.now()>=Date.parse(input.expiresAt))fail('expired_before_dispatch');
 return new Promise((done,reject)=>{const c=spawn(path,[],{stdio:['pipe','pipe','pipe']});let out='',size=0;const timer=setTimeout(()=>c.kill('SIGKILL'),20000);c.stdout.on('data',x=>{size+=x.length;if(size>16384)c.kill('SIGKILL');else out+=x;});c.stderr.on('data',()=>{});c.on('error',()=>{clearTimeout(timer);reject(Error('Borrowed Calendar native result unconfirmed'));});c.on('exit',code=>{clearTimeout(timer);if(code!==0||size>16384){reject(Error('Borrowed Calendar native result unconfirmed'));return;}try{const v=JSON.parse(out);if(!v||typeof v!=='object'||Array.isArray(v))throw Error();done(v);}catch{reject(Error('Borrowed Calendar native result unconfirmed'));}});c.stdin.end(JSON.stringify(input));});
}
export function createBorrowedNativeHandoff({binding,directory,phaseId,record,execute,authorize=()=>{},now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 validateBorrowedBinding(binding);binding=structuredClone(binding);if(!/^core-calendar-[a-z0-9-]{8,80}$/.test(phaseId||'')||typeof record!=='function')fail('phase');
 const path=resolve(directory,'calendar-borrowed-native');let actions=0,attempted=false,seedMayExist=false,seeded=false,navigated=false,restoreAttempted=false,receipt=null,context=null,poisoned=false;
 const run=execute||((input)=>runBorrowedSwift({path,pin:binding.helperSHA256,input}));
 async function call(mode,{cleanup=false}={}){
  if(poisoned||!context||actions>=binding.maxActions||!cleanup&&actions>=binding.maxActions-7)fail('action_reserve');
  if(!cleanup&&now()>=Date.parse(context.expiresAt))fail('expired');
  const n=++actions;try{await record(`borrowed-native-${String(n).padStart(2,'0')}-reserved.json`,{phaseId,action:mode,invocation:n,at:new Date(now()).toISOString(),state:'reserved_unknown'});}catch{poisoned=true;fail('reservation_unconfirmed');}
  if(!cleanup&&now()>=Date.parse(context.expiresAt))fail('expired_before_native');await authorize({cleanup});if(!cleanup&&now()>=Date.parse(context.expiresAt))fail('expired_before_native');
  let v;try{v=await run({...context,mode,phaseId,chromePID:binding.chromePID,windowId:binding.windowId,tabId:binding.tabId,originalURL:binding.originalURL,seedMayExist});}catch{throw Error('Borrowed Calendar native result unconfirmed; no mutation retry');}
  await record(`borrowed-native-${String(n).padStart(2,'0')}-observed.json`,{phaseId,action:mode,invocation:n,result:v});return v;
 }
 const errorWithReceipt=()=>{const e=Error('Borrowed Calendar restoration unconfirmed');Object.defineProperty(e,'nativeRestoreReceipt',{value:structuredClone(receipt),enumerable:false});throw e;};
 return {
  async open(input){
   if(attempted)fail('one_handoff_only');if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(input.slug||'')||!/[a-f0-9]{64}/.test(input.token||'')||input.token.length!==64||!/[a-f0-9]{64}/.test(input.state||'')||input.state.length!==64||!Number.isFinite(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=now()||Date.parse(input.expiresAt)>now()+11*60000)fail('input');
   const u=new URL(input.authorizationUrl);if(u.origin!=='https://accounts.google.com'||u.pathname!=='/o/oauth2/v2/auth'||u.searchParams.get('state')!==input.state||u.searchParams.get('redirect_uri')!=='https://machinesandcloud.com/api/google/callback')fail('oauth_target');
   attempted=true;context={slug:input.slug,token:input.token,state:input.state,authorizationUrl:input.authorizationUrl,expiresAt:input.expiresAt};
   try{
    await record('borrowed-native-original.json',{phaseId,...BORROWED_TARGET,ownerKeyInitiallyAbsent:null,pendingKeyInitiallyAbsent:null});
    const borrowed=await call('borrow');if(borrowed.ok!==true||borrowed.foregroundConfirmed!==true||borrowed.navigationDispatched!==true)fail('borrow_unconfirmed');
    let a;for(let n=0;n<5;n++){a=await call('inspect_storage');if(a.pending===true){await wait(200);continue;}break;}
    if(a?.ok!==true||a.ownerKeyAbsent!==true||a.pendingKeyAbsent!==true)fail('existing_owner_storage');
    await record('borrowed-native-storage-admission.json',{phaseId,ownerKeyInitiallyAbsent:true,pendingKeyInitiallyAbsent:true,sessionBinding:sha(input.token),stateBinding:sha(input.state)});
    seedMayExist=true;const result=await call('seed_navigate');if(result.ok!==true||result.seeded!==true||result.navigationDispatched!==true)fail('seed_navigation_unconfirmed');seeded=true;navigated=true;
    return {windowId:binding.windowId,tabId:binding.tabId,chromePID:binding.chromePID,seeded,navigated,borrowed:true,foregroundConfirmed:true,initialStorageAbsent:true,nativeActions:actions,nativePhysicalRequestsCounted:false,expiresAt:input.expiresAt};
   }catch(e){Object.defineProperty(e,'ownedNativeTab',{value:{windowId:binding.windowId,tabId:binding.tabId},enumerable:false});throw e;}
  },
  async observe(){if(!attempted||restoreAttempted)fail('not_borrowed');return {...await call('observe'),nativeActions:actions};},
  async restore(){
   if(receipt?.restored)return structuredClone(receipt);if(!attempted||!context)fail('not_borrowed');if(restoreAttempted)errorWithReceipt();restoreAttempted=true;
   receipt={windowId:binding.windowId,tabId:binding.tabId,chromePID:binding.chromePID,scope:'borrowed_tab',restored:false,tabRestored:false,storageRestored:false,storageOutcome:'unconfirmed',verificationOutcome:'unconfirmed',nativeActions:actions};
   try{
    const prep=await call('prepare_restore',{cleanup:true});
    if(prep.atOriginalInbox===true){receipt.tabRestored=true;receipt.verificationOutcome='original_inbox';if(!seedMayExist){receipt.storageRestored=true;receipt.storageOutcome='untouched';}}
    else{
     if(prep.ok!==true||!(prep.navigationDispatched===true||prep.atPrivacy===true))fail('restore_navigation_unconfirmed');
     let cleared;for(let n=0;n<3;n++){cleared=await call('clear_restore',{cleanup:true});if(cleared.pending===true){await wait(200);continue;}break;}
     if(cleared?.storageRestored===true){receipt.storageRestored=true;receipt.storageOutcome=cleared.storageOutcome;}else if(cleared?.storageOutcome==='conflict')receipt.storageOutcome='conflict';
     let observed;for(let n=0;n<3;n++){observed=await call('verify_restore',{cleanup:true});if(observed.pending===true){await wait(200);continue;}break;}receipt.tabRestored=observed.ok===true&&observed.atOriginalInbox===true;receipt.verificationOutcome=receipt.tabRestored?'original_inbox':observed.changed===true?'changed':'unconfirmed';
    }
   }catch{}
   receipt.nativeActions=actions;receipt.restored=receipt.tabRestored&&receipt.storageRestored;if(!receipt.restored)errorWithReceipt();return structuredClone(receipt);
  },
  state:()=>({mode:binding.mode,attempted,seedMayExist,seeded,navigated,restoreAttempted,nativeActions:actions,receipt:receipt?structuredClone(receipt):null})
 };
}
