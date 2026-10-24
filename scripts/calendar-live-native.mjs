// Dedicated regular Chrome handoff. Importing this module opens no browser.
// The caller must hold the current, approved guard's single native reservation.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { TARGET } from './calendar-live-guard.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
const fail = code => { throw new Error('Calendar native handoff: ' + code); };
export async function runAppleScript(script) {
  // Secrets are sent over stdin, never process arguments, files or stdout.
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/osascript', ['-'], { stdio:['pipe','pipe','pipe'] });
    let output='', size=0; const timer=setTimeout(()=>child.kill('SIGTERM'),20000);
    child.stdout.on('data', chunk => { size+=chunk.length; if(size>4096)child.kill('SIGTERM'); else output+=chunk; });
    // AppleScript can echo its source in an error. Never expose stderr.
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error('Native Chrome unavailable')); });
    child.on('exit', code => { clearTimeout(timer); code===0&&size<=4096 ? resolve(output.trim()) : reject(new Error('Native Chrome command failed; no retry performed')); });
    child.stdin.end(script);
  });
}
export function ownedTabCloseScript(windowId,tabId) {
  if(!Number.isSafeInteger(windowId)||windowId<1||!Number.isSafeInteger(tabId)||tabId<1)fail('close_binding');
  return `if application "Google Chrome" is not running then error "Dedicated browser not running"
tell application "Google Chrome"
if not (exists window id ${windowId}) then error "Dedicated window missing"
if not (exists tab id ${tabId} of window id ${windowId}) then error "Dedicated tab missing"
set controlledTab to tab id ${tabId} of window id ${windowId}
close controlledTab
if (exists window id ${windowId}) then
if (exists tab id ${tabId} of window id ${windowId}) then error "Dedicated tab still present"
end if
return "owned-calendar-target-absent"
end tell`;
}
export function ownedTabPresenceScript(windowId,tabId) {
  if(!Number.isSafeInteger(windowId)||windowId<1||!Number.isSafeInteger(tabId)||tabId<1)fail('close_binding');
  // Existence only: never read a URL or inspect any other window/tab. Avoid
  // launching Chrome merely to determine that its original window is absent.
  return `if application "Google Chrome" is not running then return "owned-calendar-window-absent"
tell application "Google Chrome"
if not (exists window id ${windowId}) then return "owned-calendar-window-absent"
if not (exists tab id ${tabId} of window id ${windowId}) then return "owned-calendar-tab-absent-in-present-window"
return "owned-calendar-target-present"
end tell`;
}
export function createNativeHandoff({ execute=runAppleScript, now=()=>Date.now() }={}) {
  let windowId=null, tabId=null, attempted=false, seeded=false, navigated=false, closed=false, closeAttempted=false,absenceReadAttempted=false,closeReceipt=null;
  const closeFailure=code=>{const error=new Error('Calendar native handoff: '+code);if(closeReceipt)Object.defineProperty(error,'nativeCloseReceipt',{value:structuredClone(closeReceipt),enumerable:false});throw error;};
  const inWindow=command=>`tell application "Google Chrome"\nif not (exists window id ${windowId}) then error "Dedicated window missing"\nif not (exists tab id ${tabId} of window id ${windowId}) then error "Dedicated tab missing"\ntell tab id ${tabId} of window id ${windowId}\n${command}\nend tell\nend tell`;
  return {
    async open({slug,token,authorizationUrl,state,expiresAt}) {
      try {
      if(attempted||closed)fail('one_window_only');
      if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug||'')||!/[a-f0-9]{64}/.test(token||'')||token.length!==64||!/[a-f0-9]{64}/.test(state||'')||state.length!==64)fail('binding');
      if(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=now()||Date.parse(expiresAt)>now()+11*60000)fail('pending_expiry');
      const destination=new URL(authorizationUrl);
      if(destination.origin!=='https://accounts.google.com'||destination.pathname!=='/o/oauth2/v2/auth'||destination.searchParams.get('state')!==state||destination.searchParams.get('redirect_uri')!==TARGET.origin+'/api/google/callback')fail('oauth_target');
      const desk=TARGET.origin+'/desk?c='+slug+'#setup';
      attempted=true;
      const result=await execute(`tell application "Google Chrome"\nactivate\nset controlledWindow to make new window with properties {mode:"normal"}\nset index of controlledWindow to 1\nset controlledTab to active tab of controlledWindow\nset URL of controlledTab to ${quote(desk)}\nreturn (id of controlledWindow as text) & "," & (id of controlledTab as text)\nend tell`);
      if(!/^\d{1,12},\d{1,12}$/.test(String(result)))fail('new_window_identity');
      [windowId,tabId]=String(result).split(',').map(Number);
      // Polling reads only the exact new window's origin, never a Google URL,
      // OAuth code, cookies, existing tabs or another browser session.
      let ready=false;
      for(let attempt=0;attempt<10;attempt++) {
        const origin=await execute(inWindow('execute javascript "location.origin"'));
        if(origin===TARGET.origin){ready=true;break;}
        if(!['null','chrome://newtab','chrome-search://local-ntp'].includes(origin))fail('new_window_origin');
        await execute('delay 0.2');
      }
      if(!ready)fail('new_window_not_ready');
      const pending={slug,state,expiresAt,sessionBinding:hash(token)};
      const js=`(()=>{if(location.origin!==${JSON.stringify(TARGET.origin)}||location.pathname!=="/desk"||new URLSearchParams(location.search).get("c")!==${JSON.stringify(slug)})throw Error("Wrong handoff page");sessionStorage.setItem("mc-onboarding-session-v1",${JSON.stringify(token)});sessionStorage.setItem("mc-calendar-pending-v1",${JSON.stringify(JSON.stringify(pending))});return "controlled-calendar-state-seeded"})()`;
      if(await execute(inWindow('execute javascript '+quote(js)))!=='controlled-calendar-state-seeded')fail('seed_not_confirmed');
      seeded=true;
      await execute(inWindow('set URL to '+quote(destination.href))); navigated=true;
      return {windowId,tabId,seeded:true,navigated:true,expiresAt,nativePhysicalRequestsCounted:false};
      } catch(error) { if(Number.isInteger(windowId)&&Number.isInteger(tabId))Object.defineProperty(error,"ownedNativeTab",{value:{windowId,tabId},enumerable:false});throw error; }
    },
    async close() {
      if(windowId===null)fail('no_owned_window');
      if(closed)return structuredClone(closeReceipt);
      if(closeAttempted)closeFailure('close_outcome_unconfirmed');
      closeAttempted=true;
      closeReceipt={windowId,tabId,closed:false,scope:'original_window',globalTabDestructionConfirmed:false,closeCommandOutcome:'unconfirmed',absenceReadOutcome:'not_needed',provenance:'close_unconfirmed'};
      let commandConfirmed=false;
      try {commandConfirmed=await execute(ownedTabCloseScript(windowId,tabId))==='owned-calendar-target-absent';}
      catch {closeReceipt.closeCommandOutcome='failed';}
      if(commandConfirmed){closed=true;Object.assign(closeReceipt,{closed:true,closeCommandOutcome:'confirmed',provenance:'close_command_confirmed'});return structuredClone(closeReceipt);}
      absenceReadAttempted=true;
      closeReceipt.absenceReadOutcome='unconfirmed';
      try {
        const observation=await execute(ownedTabPresenceScript(windowId,tabId));
        if(observation==='owned-calendar-window-absent'){
          // This confirms only the saved window's absence. The command's cause
          // remains unknown; a user could have moved its tab elsewhere.
          closed=true;Object.assign(closeReceipt,{closed:true,absenceReadOutcome:'window_absent',provenance:'scoped_window_absence_observed'});return structuredClone(closeReceipt);
        }
        if(observation==='owned-calendar-tab-absent-in-present-window')closeReceipt.absenceReadOutcome='saved_window_present_tab_absent';
        if(observation==='owned-calendar-target-present')closeReceipt.absenceReadOutcome='target_present';
      } catch {closeReceipt.absenceReadOutcome='failed';}
      closeFailure('close_unconfirmed');
    },
    state:()=>({windowId,tabId,attempted,seeded,navigated,closed,closeAttempted,absenceReadAttempted,closeReceipt:closeReceipt?structuredClone(closeReceipt):null})
  };
}
