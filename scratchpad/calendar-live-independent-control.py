# Independent offline actual helper control-flow tests. Only synthetic temp files and protocol doubles.
import importlib.util, pathlib, tempfile, socket, json, copy, sys, os, hashlib, datetime
out=pathlib.Path(sys.argv[1]);assert str(out).startswith('scratchpad/') and not out.exists()
def deny(*a,**k):raise AssertionError('Physical network/subprocess forbidden')
socket.create_connection=deny;socket.socket.connect=deny
spec=importlib.util.spec_from_file_location('proof_control',pathlib.Path('scripts/calendar-live-control.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.subprocess.run=m.subprocess.check_output=deny
paths=['scripts/calendar-live-control.py','scripts/calendar-live-guard.mjs','scripts/calendar-live-actor.mjs','scripts/calendar-live-native.mjs']
hashes=lambda:{p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in paths}
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Independent actual helper command paths; synthetic filesystem/auth/protocol fixtures, never real packet/config/credentials','sourceBefore':hashes(),'checks':[]}
def fixture(test):
 with tempfile.TemporaryDirectory(prefix='calendar-independent-',dir='scratchpad') as directory:
  base=pathlib.Path(directory).resolve();root=base/'synthetic-repo';private=base/'private';(root/'scratchpad').mkdir(parents=True);private.mkdir();m.ROOT=root
  phase='core-calendar-independent-fixture';packet=private/'packet.json';packet.write_text(json.dumps({'phaseId':phase}));packet.chmod(0o600)
  m.SITES['mc']['candidate']='c'*40;m.PRIVATE=private;m.PHASE=phase;m.LEDGER=root/'scratchpad'/f'{phase}-control.jsonl'
  m.private_write(m.LEDGER,{'phase':phase,'limits':{'requests':48,'mutations':16,'builds':2},'requests':1,'mutations':1,'builds':0,'rows':[{'id':1,'action':'calendar-proof:new:CALENDAR_EXECUTION_POLICY_JSON','method':'POST','path':'/fixture','state':'unknown'}]},exclusive=True)
  original=[{'key':'CALENDAR_CONNECTION_ENABLED','scopes':['functions'],'is_secret':False,'values':[{'context':'production','value':'false'},{'context':'deploy-preview','value':'keep-preview'}]},{'key':'UNRELATED_SYNTHETIC','scopes':['functions','builds'],'values':[{'context':'all','value':'keep-all'}]}]
  server=copy.deepcopy(original);calls=[]
  for name,value in [('original-mc-env.json',original),('current-mc-env.json',original),('prepared-mc-env.json',[m.production_row('CALENDAR_CONNECTION_ENABLED','true',original[0]),m.production_row('CALENDAR_EXECUTION_POLICY_JSON','synthetic-policy')])]:m.private_write(private/name,value,exclusive=True)
  m.fresh=lambda:{'policyVersion':'synthetic','runtimeLimits':{},'candidateCommit':'c'*40}
  real_read=m.read
  def read(path):
   if pathlib.Path(path)==pathlib.Path.home()/'Library/Preferences/netlify/config.json':return {'userId':'fixture','users':{'fixture':{'auth':{'token':'SYNTHETIC-NOT-REAL'}}}}
   return real_read(path)
  m.read=read
  class Response:
   status=200
   def __init__(self,value):self.value=value
   def read(self,limit):return json.dumps(self.value).encode()
  class Opener:
   def open(self,request,timeout):
    method=request.method;calls.append({'method':method,'path':request.full_url.split('/api/v1')[-1]});assert m.last(m.LEDGER)['rows'][-1]['state']=='reserved_unknown'
    if method=='GET':
     if '/sites/' in request.full_url:return Response({'id':m.SITES['mc']['id'],'account_id':m.ACCOUNT,'disabled':False,'published_deploy':{'id':m.SITES['mc']['baselineDeployId'],'state':'ready','commit_ref':m.SITES['mc']['base']}})
     return Response(copy.deepcopy(server))
    key=request.full_url.split('/env/')[-1].split('?')[0]
    if method=='DELETE':server[:]=[r for r in server if r['key']!=key];return Response(None)
    body=json.loads(request.data)
    if method=='PUT':server[:]=[body if r['key']==body['key'] else r for r in server]
    elif method=='POST':server.extend(body)
    return Response(body)
  old_opener=m.urllib.request.build_opener;m.urllib.request.build_opener=lambda *args:Opener()
  def command(name,key=None):
   previous=sys.argv;sys.argv=['calendar-live-control.py','--packet',str(packet),'--sha256','0'*64,name]+([key] if key is not None else [])
   try:return m.main()
   finally:sys.argv=previous
  try:return test(original,server,calls,command)
  finally:m.read=real_read;m.urllib.request.build_opener=old_opener

def check(name,fn):
 row={'name':name}
 try:row['observed']=fixture(fn);row['pass']=True
 except Exception as error:row['pass']=False;row['error']=str(error)
 report['checks'].append(row)

def unknown_absent(original,server,calls,command):
 server.append(m.production_row('CALENDAR_EXECUTION_POLICY_JSON','synthetic-policy'))
 command('cleanup-env');result=command('restore-key','CALENDAR_EXECUTION_POLICY_JSON')
 assert m.projection(server)==m.projection(original),'Lost originally-absent key remains on server because stale cache skipped DELETE: '+json.dumps({'calls':calls,'result':result})
 return {'serverExactOriginal':True,'calls':calls}
check('Lost-response originally absent key is freshly inspected and deleted during targeted cleanup',unknown_absent)

def concurrent_key(original,server,calls,command):
 state=m.last(m.LEDGER);state['rows']=[];state['requests']=0;state['mutations']=0;m.private_write(m.LEDGER,state)
 server[0]['values'][0]['value']='concurrent-owner-change';rejected=False
 try:command('apply-key','CALENDAR_CONNECTION_ENABLED')
 except RuntimeError:rejected=True
 assert rejected and any(c['method']=='GET' for c in calls) and not any(c['method']!='GET' for c in calls),'Concurrent selected-key change overwritten instead of stopping: '+json.dumps({'rejected':rejected,'calls':calls})
 assert server[0]['values'][0]['value']=='concurrent-owner-change'
 return {'rejected':True,'noMutation':True,'calls':calls}
check('Fresh selected-key config drift stops before a destructive staging write',concurrent_key)
def normal_staging(original,server,calls,command):
 state=m.last(m.LEDGER);state['rows']=[];state['requests']=0;state['mutations']=0;m.private_write(m.LEDGER,state)
 result=command('apply-key','CALENDAR_CONNECTION_ENABLED')
 assert m.effective(server,'CALENDAR_CONNECTION_ENABLED')=='true'
 assert next(v for v in server[0]['values'] if v['context']=='deploy-preview')['value']=='keep-preview'
 assert m.projection([server[1]])==m.projection([original[1]])
 return {'staged':True,'previewAndUnrelatedPreserved':True,'calls':calls}
check('Valid production-only staging remains possible with original preview/scope/unrelated values preserved',normal_staging)

def changed_before_push(original,server,calls,command):
 state=m.last(m.LEDGER);state['rows']=[];state['requests']=0;state['mutations']=0;state['stagedVerified']=True;m.private_write(m.LEDGER,state)
 server[0]['values'][0]['value']='concurrent-after-staging'
 rejected=False
 try:command('push')
 except RuntimeError:rejected=True
 assert rejected and any('/env' in c['path'] and c['method']=='GET' for c in calls) and not any(c['method']!='GET' for c in calls),'Changed env must stop before native Git dispatch'
 return {'rejected':True,'noGitOrMutation':True,'calls':calls}
check('Staged readback cannot authorize a push after a later concurrent environment edit',changed_before_push)

def changed_before_cleanup_build(original,server,calls,command):
 state=m.last(m.LEDGER);state.update(rows=[],requests=0,mutations=0,builds=1,cleanup=True,restored=True,remote={'mc':'c'*40},remoteAt={'mc':m.iso()});m.private_write(m.LEDGER,state)
 m.private_write(m.PRIVATE/'current-mc-site.json',{'_observedAt':m.iso(),'published_deploy':{'id':'a'*24,'state':'ready','commit_ref':'c'*40}})
 server[0]['values'][0]['value']='concurrent-after-restore'
 rejected=False
 try:command('cleanup-build')
 except RuntimeError:rejected=True
 assert rejected and any('/env' in c['path'] and c['method']=='GET' for c in calls) and not any(c['method']!='GET' for c in calls),'Changed restored env must stop before cleanup build POST'
 return {'rejected':True,'noBuildPost':True,'calls':calls}
check('Restored readback cannot authorize a cleanup build after a later concurrent environment edit',changed_before_cleanup_build)

report['sourceAfter']=hashes();report['sourceStable']=report['sourceBefore']==report['sourceAfter'];report['summary']={'passed':sum(x['pass'] for x in report['checks']),'failed':sum(not x['pass'] for x in report['checks'])};report['physicalEffects']=0
out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'output':str(out),**report['summary'],'sourceStable':report['sourceStable'],'failures':[x for x in report['checks'] if not x['pass']]}))
if report['summary']['failed']:sys.exit(1)
