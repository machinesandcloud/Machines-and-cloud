import assert from 'node:assert/strict';import{readFileSync,writeFileSync,existsSync,createWriteStream,readdirSync}from'node:fs';import{resolve}from'node:path';import{spawn,spawnSync}from'node:child_process';import{createHash}from'node:crypto';
const cwd=resolve('.'),prefix='scratchpad/guided-walkthrough-required-final',output=prefix+'.json',guard=resolve('scratchpad/tenant-isolation-required-network-guard.mjs'),ledger=prefix+'-network.jsonl';
for(const path of[output,ledger])assert.equal(existsSync(path),false,'Preserve prior receipt: '+path);
const sha=value=>createHash('sha256').update(value).digest('hex'),fileSha=path=>sha(readFileSync(path));
const config=readFileSync('netlify.toml','utf8'),guide=readFileSync('CLAUDE.md','utf8');
const command=config.match(/^\s*command\s*=\s*"([^"]+)"/m)?.[1],documented=guide.match(/The deploy gate runs `([^`]+)`/)?.[1];assert.ok(command);assert.equal(documented,command,'Current deploy-gate sentence must exactly match Netlify');
const commands=command.split(' && ');assert.equal(commands.length,33);assert.equal(commands.filter(c=>c==='node scripts/tenant-isolation-check.mjs').length,1);for(const c of commands)assert.match(c,/^node scripts\/[a-z0-9-]+\.mjs$/);
const tracked=spawnSync('git',['ls-files','-z'],{cwd,encoding:'utf8'});assert.equal(tracked.status,0);
const relevant=tracked.stdout.split('\0').filter(p=>p&&/^(assets\/|netlify\/|scripts\/|package(?:-lock)?\.json$|netlify\.toml$|CLAUDE\.md$|[^/]+\.(?:html|js|css)$)/.test(p));
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):[p+'/'+e.name]);
const files=[...new Set([...relevant,...walk('netlify/functions').filter(p=>p.endsWith('.mjs')),'scripts/tenant-isolation-check.mjs','scripts/guided-walkthrough-ui-check.mjs'])].sort();
const hashes=()=>Object.fromEntries(files.map(path=>[path,fileSha(path)]));
const historical=['scratchpad/intake-engineering-check.json','scratchpad/public-build-manifest.json'].map(path=>({path,bytes:existsSync(path)?readFileSync(path):null}));
const report={at:new Date().toISOString(),scope:'Exact current33-command Netlify deploy gate; every command in a fresh network-guarded process. No commit, push, deploy, account or provider effect.',command,documentedCommand:documented,exactCommandEquality:true,commandCount:commands.length,runnerHash:fileSha(import.meta.filename),guardHash:fileSha(guard),sourceBefore:hashes(),steps:[],historicalArtifacts:[],network:[],stoppedOnFailure:false};
const environment={...process.env};for(const key of Object.keys(environment))if(/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|ADMIN_|NETLIFY_|BLOBS_|MC_CALENDAR_|MC_SELF_SERVICE_AI_)/.test(key))delete environment[key];
Object.assign(environment,{MC_MEMORY_STORE:'1',MC_FAKE_MODEL:'1',MC_LOCAL_NO_KEYS:'1',NODE_ENV:'test',NODE_OPTIONS:'--import '+guard,MC_REQUIRED_GUARD_LEDGER:resolve(ledger)});
try{
 for(let i=0;i<commands.length;i++){
  const command=commands[i],path=command.slice(5),log=prefix+'-'+String(i+1).padStart(2,'0')+'-'+path.split('/').at(-1).replace(/\.mjs$/,'.txt');assert.equal(existsSync(log),false);
  const started=Date.now(),stream=createWriteStream(log,{flags:'wx'});const child=spawn(process.execPath,[path],{cwd,env:{...environment,MC_REQUIRED_COMMAND:command},stdio:['ignore','pipe','pipe']});child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
  const result=await new Promise(resolveResult=>{const timer=setTimeout(()=>{child.kill('SIGTERM');},120000);child.once('error',error=>{clearTimeout(timer);resolveResult({exitCode:null,error:error.message});});child.once('exit',(code,signal)=>{clearTimeout(timer);resolveResult({exitCode:code,signal});});});await new Promise(r=>stream.end(r));
  const step={number:i+1,command,log,logHash:fileSha(log),durationMs:Date.now()-started,...result,passed:result.exitCode===0};report.steps.push(step);console.log(JSON.stringify({step:step.number,command,passed:step.passed,durationMs:step.durationMs}));
  if(!step.passed){report.stoppedOnFailure=true;break;}
 }
}catch(error){report.runnerError={message:error.message,stack:error.stack};}
finally{
 for(const artifact of historical){const generated=existsSync(artifact.path)?readFileSync(artifact.path):null,fresh=prefix+'-'+artifact.path.split('/').at(-1);if(generated){assert.equal(existsSync(fresh),false);writeFileSync(fresh,generated,{flag:'wx'});}if(artifact.bytes)writeFileSync(artifact.path,artifact.bytes);report.historicalArtifacts.push({path:artifact.path,shaBefore:artifact.bytes?sha(artifact.bytes):null,freshResult:generated?fresh:null,shaFresh:generated?sha(generated):null,shaRestored:existsSync(artifact.path)?fileSha(artifact.path):null,restored:!!artifact.bytes&&fileSha(artifact.path)===sha(artifact.bytes)});}
 report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.network=existsSync(ledger)?readFileSync(ledger,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];report.summary={passed:report.steps.filter(s=>s.passed).length,failed:report.steps.filter(s=>!s.passed).length,executed:report.steps.length,required:33,deniedPhysicalAttempts:report.network.reduce((n,r)=>n+r.deniedPhysicalAttempts,0),actualExternalRequests:0,sourceStable:report.sourceStable,historicalArtifactsRestored:report.historicalArtifacts.every(a=>a.restored)};writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report.summary}));
 if(report.summary.failed||report.summary.executed!==33||!report.sourceStable||!report.summary.historicalArtifactsRestored||report.runnerError||report.summary.deniedPhysicalAttempts)process.exitCode=1;
}
