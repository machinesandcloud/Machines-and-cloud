# Independent offline exact-union verification; writes only a caller-selected fresh scratchpad receipt.
import subprocess, pathlib, hashlib, json, tempfile, re, sys
P=pathlib.Path
sha=lambda b:hashlib.sha256(b).hexdigest()
show=lambda ref,path:subprocess.check_output(['git','show',ref+':'+path])
base='577961c6a406be22a7fb479db055145881776729'
cal=json.loads(P('scratchpad/calendar-busy-source-v4-20261024.json').read_text())['files']
convo={x['path']:x['sha256'] for x in json.loads(P('scratchpad/conversation-history-source-freeze-v3.json').read_text())['sourceFiles']}
activity=json.loads(P('scratchpad/full-offer-activity-independent-acceptance.json').read_text())['finalSource']
result={'method':'Byte-exact accepted Git objects and three-way merge. Only simultaneous empty-base insertions concatenate Activity/Calendar then Conversation; the shared public allowlist line adds the two independently accepted module names in that order. No runtime mutation.','referenceMatches':{},'nonOverlapMatches':{},'union':{}}
refs={'activity':('20efd08',activity),'calendar':('8a89fa5',cal),'conversation':('5b3bb6735c7dd0058603ceadd0ee6a4970d12d9d',convo)}
for name,(ref,m) in refs.items():
 result['referenceMatches'][name]={path:sha(show(ref,path))==h for path,h in m.items()}
result['nonOverlapMatches']['calendar']={p:sha(P(p).read_bytes())==h for p,h in cal.items() if p not in ['netlify/functions/client.mjs','netlify/functions/lib/store.mjs']}
shared=['desk.html','desk.css','netlify/functions/client.mjs','netlify/functions/lib/store.mjs','scripts/build-site.mjs']
result['nonOverlapMatches']['conversation']={p:sha(P(p).read_bytes())==h for p,h in convo.items() if p not in shared}
# Activity differences must all be exact later accepted Calendar or Conversation files or the shared union.
allowed=set(shared)|set(cal)|set(convo)
result['nonOverlapMatches']['activity']={p:sha(P(p).read_bytes())==h for p,h in activity.items() if p not in allowed}
with tempfile.TemporaryDirectory(prefix='integration-union-',dir='scratchpad') as temp:
 def merge(path,a,b,c):
  paths=[]
  for suffix,data in [('a',a),('base',b),('b',c)]:
   f=P(temp)/suffix;f.write_bytes(data);paths.append(str(f))
  r=subprocess.run(['git','merge-file','-p','--diff3',*paths],capture_output=True)
  assert r.returncode in [0,1],r.stderr
  return r
 for path in ['netlify/functions/client.mjs','netlify/functions/lib/store.mjs']:
  r=merge(path,show('20efd08',path),show(base,path),show('8a89fa5',path));assert r.returncode==0
  result['union']['activityPlusCalendar:'+path]={'exact':r.stdout==show('1863ec8',path),'expectedSha256':sha(r.stdout)}
 for path in shared:
  r=merge(path,show('1863ec8',path),show(base,path),show('5b3bb67',path))
  def resolve(m):
   a,b,c=m.groups()
   if b==b'':return a+c
   assert path=='scripts/build-site.mjs'
   assert a==b.replace(b"'desk-requests.js',",b"'desk-requests.js', 'desk-activity.js',")
   assert c==b.replace(b"'desk-requests.js',",b"'desk-requests.js', 'desk-conversations.js',")
   return a.replace(b"'desk-activity.js',",b"'desk-activity.js', 'desk-conversations.js',")
  expected=re.sub(rb'<<<<<<<.*?\n(.*?)\|\|\|\|\|\|\|.*?\n(.*?)=======\n(.*?)>>>>>>>[^\n]*\n',resolve,r.stdout,flags=re.S)
  assert b'<<<<<<<' not in expected
  result['union']['combined:'+path]={'exact':expected==P(path).read_bytes(),'expectedSha256':sha(expected)}
result['packaging']={p:P('dist',p).read_bytes()==P(p).read_bytes() for p in ['desk.html','desk.css','desk-activity.js','desk-conversations.js','desk-connections.js']}
html=P('desk.html').read_text();allowlist=P('scripts/build-site.mjs').read_text()
result['packaging']['bothModulesMountedOnce']=all(html.count('src="'+p+'"')==1 and allowlist.count("'"+p+"'")==1 for p in ['desk-activity.js','desk-conversations.js'])
result['packaging']['privatePathsAbsent']=not any(P('dist',p).exists() for p in ['.env','local.env','netlify/functions','scratchpad','product','AGENTS.md','CLAUDE.md'])
gate=json.loads(P('scratchpad/full-offer-required-gate-r2.json').read_text());result['requiredGate']={'path':'scratchpad/full-offer-required-gate-r2.json','checks':len(gate['checks']),'all47Exit0':len(gate['checks'])==47 and all(x['exitCode']==0 for x in gate['checks']),'preEqualsPost':gate['sourceBefore']==gate['sourceAfter'],'currentMatches':{p:sha(P(p).read_bytes())==h for p,h in gate['sourceAfter'].items()}}
# Broad current tracked source/asset/config/test snapshot. Historical pre/post guarantee is the gate253 plus the actual-browser affected source guard; this broader snapshot is current-only.
tracked=subprocess.check_output(['git','ls-files','-z']).decode().split('\0')
selected=[p for p in tracked if p and not p.startswith(('scratchpad/','product/','.github/')) and (p.startswith(('netlify/','scripts/','assets/')) or P(p).suffix.lower() in ['.html','.js','.css','.mjs','.json','.toml','.svg','.png','.jpg','.webp','.ico','.woff','.woff2'] or p in ['_headers','_redirects','.env.example'])]
result['currentTrackedSourceAssetsConfigTests']={p:sha(P(p).read_bytes()) for p in selected if P(p).is_file()}
result['changedFromHead']=[p for p,h in result['currentTrackedSourceAssetsConfigTests'].items() if sha(show('HEAD',p))!=h]
result['ok']=all(all(m.values()) for m in result['referenceMatches'].values()) and all(all(m.values()) for m in result['nonOverlapMatches'].values()) and all(m['exact'] for m in result['union'].values()) and all(result['packaging'].values()) and result['requiredGate']['all47Exit0'] and result['requiredGate']['preEqualsPost'] and all(result['requiredGate']['currentMatches'].values()) and set(result['changedFromHead']).issubset({'netlify.toml','scripts/workspace-billing-check.mjs'})
result['head']=subprocess.check_output(['git','rev-parse','HEAD']).decode().strip()
result['firstReceiptDisposition']='All source union/packaging/gate checks passed. First receipt expected two gate files to remain uncommitted; Root committed them unchanged as7033364 during review. Current gate hashes remain exact. This is a QA staging assumption, not product failure.'
output=sys.argv[1];assert re.fullmatch(r'scratchpad/[a-z0-9-]+\.json',output) and not P(output).exists();P(output).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'output':output,'ok':result['ok'],'gateSourcePaths':len(gate['sourceAfter']),'trackedSnapshotPaths':len(result['currentTrackedSourceAssetsConfigTests']),'changedFromHead':result['changedFromHead']}));assert result['ok']
