// Prepare one exact manually observed message for the Calendar actor.
// This parser does not open Gmail, read browser state, send mail or exchange links.
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {TARGET} from './calendar-live-guard.mjs';
export function exactCalendarMessage(input,{requestedAt,now=Date.now()}={}) {
  if(!input||Object.keys(input).sort().join(',')!=='link,receivedAt,recipient,subject'||input.recipient!==TARGET.ownerEmail||input.subject!=='Your Machines & Cloud sign-in link')throw Error('Exact controlled sign-in message required');
  const requested=Date.parse(requestedAt),received=Date.parse(input.receivedAt);
  if(!Number.isFinite(requested)||!Number.isFinite(received)||requested>now||received<requested-5000||received>now+60000||now-requested>20*60000)throw Error('Message is not the newly requested current link');
  let url;try{url=new URL(input.link);}catch{throw Error('Exact one-use customer sign-in destination required');}
  const fragment=new URLSearchParams(url.hash.slice(1));
  if(url.origin!==TARGET.origin||url.username||url.password||url.pathname!=='/onboard.html'||url.searchParams.get('plan')!=='starter'||[...url.searchParams.keys()].length!==1||[...fragment.keys()].join(',')!=='verify'||!/^[a-f0-9]{64}$/.test(fragment.get('verify')||''))throw Error('Exact one-use customer sign-in destination required');
  return {recipient:TARGET.ownerEmail,token:fragment.get('verify'),exactMessageConfirmed:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length!==6||process.argv[2]!=='--prepare')throw Error('arguments');
    const [input,requestedAt,output]=process.argv.slice(3),stat=await lstat(input);
    const repository=await realpath(fileURLToPath(new URL('../',import.meta.url)));
    for(const file of [input,output]){const parent=await realpath(dirname(resolve(file)));if(parent===repository||parent.startsWith(repository+'/'))throw Error('private path');}
    if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o600||stat.uid!==process.getuid())throw Error('private permissions');
    const prepared=exactCalendarMessage(JSON.parse(await readFile(input,'utf8')),{requestedAt});
    await writeFile(output,JSON.stringify(prepared),{mode:0o600,flag:'wx'});
    process.stdout.write(JSON.stringify({prepared:true,recipient:TARGET.ownerEmail,tokenPrinted:false})+'\n');
  } catch {
    // URL/JSON/fs errors may retain input text or paths. Never echo the error.
    process.stderr.write(JSON.stringify({ok:false,error:'Private sign-in message could not be prepared; no token is displayed'})+'\n');process.exitCode=1;
  }
}
