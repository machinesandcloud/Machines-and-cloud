import concurrent.futures, hashlib, json, os, re, shlex, subprocess, time, sys
from pathlib import Path
from datetime import datetime, timezone
root=Path.cwd()
prefix=sys.argv[1] if len(sys.argv)>1 else "core-delivery-required"
assert re.fullmatch(r"[a-z0-9-]+",prefix)
command=re.search(r'^  command = "(.*)"$',Path('netlify.toml').read_text(),re.M).group(1)
commands=[shlex.split(value.strip()) for value in command.split('&&')]
assert len(commands)==30
paths=set(subprocess.check_output(['git','ls-files']).decode().splitlines())|set(subprocess.check_output(['git','ls-files','--others','--exclude-standard']).decode().splitlines())
paths=sorted(p for p in paths if (p.endswith(('.js','.mjs','.html','.css')) and not p.startswith('scratchpad/')) or p=='netlify.toml')
def hashes():return {p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths if Path(p).is_file()}
before=hashes(); started=datetime.now(timezone.utc).isoformat()
env=os.environ.copy()
for key in list(env):
 if re.match(r'^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|NETLIFY|CALENDAR_|VOICE_ACTIVATION|MESSAGING_ACTIVATION|PHONE_ACQUISITION|PHONE_ACTIVATION|SERVICE_WORKER|PLATFORM_DATA|MC_PLATFORM_SMS|SERVICE_DELIVERY)',key):env.pop(key)
env.update(MC_MEMORY_STORE='1',MC_FAKE_MODEL='1',MC_LOCAL_NO_KEYS='1')
results=[]
def run(index,argv):
 began=time.monotonic();log=Path('scratchpad')/('%s-%02d-%s.txt'%(prefix,index+1,Path(argv[1]).stem))
 try:
  child=subprocess.run(argv,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=240)
  log.write_bytes(child.stdout); code=child.returncode
 except subprocess.TimeoutExpired as error:
  log.write_bytes(error.stdout or b'');code=124
 result={'index':index+1,'command':shlex.join(argv),'exitCode':code,'seconds':round(time.monotonic()-began,3),'log':str(log)}
 print(json.dumps(result),flush=True);return result
first=run(0,commands[0]);results.append(first)
if first['exitCode']==0:
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
  pending=[executor.submit(run,index,argv) for index,argv in enumerate(commands[1:-1],1)]
  results.extend(future.result() for future in concurrent.futures.as_completed(pending))
 if all(row['exitCode']==0 for row in results):results.append(run(len(commands)-1,commands[-1]))
after=hashes();changed=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)]
receipt={'startedAt':started,'completedAt':datetime.now(timezone.utc).isoformat(),'scope':'All30 required Netlify commands locally in fresh child processes; generated assets first, independent middle checks in three processes, static build last. Provider credentials removed, fake model and memory storage requested; individual SDK checks intercept their synthetic transport. No live service acceptance.','passed':sum(r['exitCode']==0 for r in results),'failed':sum(r['exitCode']!=0 for r in results),'expectedCommands':30,'sourceStable':not changed,'changedSource':changed,'before':before,'after':after,'results':sorted(results,key=lambda r:r['index'])}
(Path('scratchpad')/(prefix+'-result.json')).write_text(json.dumps(receipt,indent=2)+'\n')
raise SystemExit(0 if len(results)==30 and not changed and receipt['failed']==0 else 1)
