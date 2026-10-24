#!/usr/bin/env python3
"""Calendar proof's fixed supplemental48-request control adapter. No effects on import."""
import argparse, contextlib, datetime as dt, fcntl, hashlib, json, os, pathlib, re, subprocess, sys, urllib.error, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
PRIVATE=None; PHASE=None; LEDGER=None; MANIFEST=None; APPROVAL_SHA=None
ACCOUNT='69797d78f01c70674ffef858'
SITES={'mc':{'id':'f87916f1-bcc4-4171-a96f-2900cbf0b6dc','base':'e8fac43d98f9cbd95ab29378c5506393ea7fad18','candidate':None,'cwd':str(ROOT),'remote':'https://github.com/machinesandcloud/Machines-and-cloud.git'}}
MC_KEYS=['CALENDAR_CONNECTION_ENABLED','CALENDAR_DELIVERY_ENABLED','CALENDAR_EXECUTION_APPROVED_VERSION','CALENDAR_EXECUTION_POLICY_JSON']
def fail(s): raise RuntimeError(s)
def now(): return dt.datetime.now(dt.timezone.utc)
def iso(): return now().isoformat().replace('+00:00','Z')
def digest(v): return hashlib.sha256(v if isinstance(v,bytes) else (v if isinstance(v,str) else json.dumps(v,separators=(',',':'),sort_keys=True)).encode()).hexdigest()
def read(p): return json.loads(pathlib.Path(p).read_text())
def private_write(path,value,exclusive=False):
    flags=os.O_WRONLY|os.O_CREAT|(os.O_EXCL if exclusive else os.O_TRUNC)
    fd=os.open(path,flags,0o600)
    with os.fdopen(fd,'w') as f: json.dump(value,f,separators=(',',':'));f.write('\n');f.flush();os.fsync(f.fileno())
def last(path):
    lines=pathlib.Path(path).read_text().splitlines()
    if not lines: fail('Empty control ledger')
    return json.loads(lines[-1])
def primary_fixed():
    # Guard metadata<=12 and Blobs<=60 leave this adapter exactly48 of120.
    # No shared counter can be reset or borrowed from another phase.
    if LEDGER is None or PHASE is None: fail('Initialize exact approved phase')
def fresh():
    raw=pathlib.Path(MANIFEST).read_bytes()
    if digest(raw)!=APPROVAL_SHA: fail('Approved packet bytes changed')
    m=json.loads(raw);expiry=dt.datetime.fromisoformat(m['approvalExpiresAt'].replace('Z','+00:00'))
    if m.get('approved') is not True or m.get('phaseId')!=PHASE or m.get('scope')!='owned_calendar_busy_lifecycle_v2' or now()>=expiry: fail('Approved phase expired or unavailable')
    if m.get('target',{}).get('siteId')!=SITES['mc']['id'] or m['target'].get('accountId')!=ACCOUNT: fail('Wrong target')
    if not re.fullmatch('[a-f0-9]{40}',m.get('candidateCommit','')): fail('Candidate not frozen')
    SITES['mc']['candidate']=m['candidateCommit']
    return m
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
@contextlib.contextmanager
def locked():
    primary_fixed()
    fd=os.open(LEDGER,os.O_RDWR|os.O_APPEND)
    with os.fdopen(fd,'r+') as f:
        fcntl.flock(f,fcntl.LOCK_EX);s=last(LEDGER)
        if s.get('phase')!=PHASE or s.get('limits')!={'requests':48,'mutations':16,'builds':2}: fail('Supplemental ledger contract changed')
        def append(): f.write(json.dumps(s,separators=(',',':'))+'\n');f.flush();os.fsync(f.fileno())
        yield s,append
def reserve(s,append,action,method,path,build=False,cleanup=False,request_units=1):
    primary_fixed()
    if not cleanup: fresh()
    mutation=method not in ['GET','GIT-GET']
    if mutation and any(r['action']==action for r in s['rows']): fail('Mutation already attempted; no retry of known/unknown effects')
    if mutation and not cleanup and any(r['method'] not in ['GET','GIT-GET'] and r['state'] in ['reserved_unknown','unknown'] for r in s['rows']): fail('Prior unknown mutation requires reconciliation/cleanup')
    if not isinstance(request_units,int) or request_units<1 or request_units>6: fail('Invalid physical request reservation')
    if s['requests']+request_units>48 or mutation and s['mutations']>=16 or build and s['builds']>=2: fail('Fixed remaining control budget exhausted')
    # Keep six cleanup environment mutations, one cleanup build and readback room.
    if not cleanup and (s['requests']+request_units>30 or mutation and s['mutations']>=10 or build and s['builds']>=1): fail('Cleanup allowance is reserved')
    if build and action not in ['push:mc','build:mc:cleanup']: fail('Unapproved build')
    s['requests']+=request_units;s['mutations']+=int(mutation);s['builds']+=int(build)
    row={'id':s['requests'],'action':action,'method':method,'path':path,'state':'reserved_unknown','at':iso(),'buildReserved':build,'physicalRequestReservation':request_units};s['rows'].append(row);append();return row
def request(s,append,action,site,path,method='GET',body=None,build=False,cleanup=False):
    if not path.startswith(('/sites/','/accounts/'+ACCOUNT+'/env','/deploys/')): fail('Control path forbidden')
    if path.startswith('/accounts/') and 'site_id='+SITES[site]['id'] not in path: fail('Site scope missing')
    row=reserve(s,append,action,method,path,build,cleanup)
    cfg=read(pathlib.Path.home()/'Library/Preferences/netlify/config.json');u=cfg['users'][cfg['userId']];token=u.get('auth',{}).get('token') or u.get('token')
    if not token: fail('Native Netlify authentication unavailable')
    headers={'Authorization':'Bearer '+token};data=None
    if body is not None: data=json.dumps(body,separators=(',',':')).encode();headers['Content-Type']='application/json';row['requestSHA256']=digest(data);append()
    try:
        req=urllib.request.Request('https://api.netlify.com/api/v1'+path,data=data,headers=headers,method=method)
        try:
            response=urllib.request.build_opener(NoRedirect()).open(req,timeout=25);status=response.status;raw=response.read(12000000)
        except urllib.error.HTTPError as e: status=e.code;raw=e.read(12000000)
        try: value=json.loads(raw) if raw else None
        except Exception: value=None
        private_write(PRIVATE/f'control-response-{row["id"]:03d}.json',{'status':status,'body':value})
        row.update(state='observed',status=status,responseSHA256=digest(raw));append()
        if not 200<=status<300: fail('Netlify control HTTP '+str(status)+'; private response retained, no retry')
        return value
    except Exception:
        if row['state']=='reserved_unknown': row['state']='unknown';append()
        raise
def env_path(site,key=None): return '/accounts/'+ACCOUNT+'/env'+('/'+key if key else '')+'?site_id='+SITES[site]['id']
def env_row(rows,key):
    found=[r for r in rows if r['key']==key]
    if len(found)>1: fail('Ambiguous environment key')
    return found[0] if found else None
def effective(rows,key):
    r=env_row(rows,key);v=[x for x in (r or {}).get('values',[]) if x.get('context') in ['production','all']]
    if len(v)>1: fail('Ambiguous production/all value for '+key)
    return v[0]['value'] if v else ''
def row_body(r): return {k:r[k] for k in ['key','scopes','values','is_secret'] if k in r}
def cache(site): return PRIVATE/f'current-{site}-env.json'
def env_get(s,append,site,cleanup=False):
    value=request(s,append,'env:'+site,site,env_path(site),cleanup=cleanup)
    if not isinstance(value,list): fail('Invalid environment response')
    original=PRIVATE/f'original-{site}-env.json'
    if not original.exists(): private_write(original,value,exclusive=True)
    private_write(cache(site),value)
    keys=MC_KEYS
    return {'site':site,'rows':len(value),'snapshotSHA256':digest(value),'selected':[{'key':k,'present':env_row(value,k) is not None,'effectiveSHA256':digest(effective(value,k)),'scopes':(env_row(value,k) or {}).get('scopes',[])} for k in keys]}
def put_rows(s,append,site,wanted,prefix,cleanup=False):
    current=read(cache(site));new=[]
    for r in wanted:
        old=env_row(current,r['key'])
        if old:
            request(s,append,prefix+':'+r['key'],site,env_path(site,r['key']),'PUT',r,cleanup=cleanup)
            current=[r if x['key']==r['key'] else x for x in current];private_write(cache(site),current)
        else: new.append(r)
    if new:
        request(s,append,prefix+':new:'+','.join(r['key'] for r in new),site,env_path(site),'POST',new,cleanup=cleanup)
        current+=new;private_write(cache(site),current)
def production_row(key,value,current=None,scope='functions'):
    if current:
        # Preserve original contexts/scopes; only replace or append production.
        if any(v.get('context')=='all' for v in current.get('values',[])): fail('Inherited all-context key requires explicit preservation review')
        r=row_body(current)
        if r.get('scopes')!=['functions']: fail('Existing Calendar key is not Functions-only; preserve and review before effects')
        r['values']=[v for v in r['values'] if v.get('context')!='production']+[{'context':'production','value':value}]
        if scope not in r['scopes']: fail('Existing key lacks required scope')
        return r
    return {'key':key,'scopes':[scope],'values':[{'context':'production','value':value}]}
def projection(rows):
    # Provider IDs/timestamps may change on PUT. Compare every effective context,
    # scope and secret flag, while retaining the untouched raw originals privately.
    return sorted([{'key':row['key'],'scopes':sorted(row.get('scopes',[])),
                    'is_secret':row.get('is_secret',False),
                    'values':sorted([{key:value[key] for key in ['context','context_parameter','value'] if key in value}
                                     for value in row.get('values',[])],key=lambda value:json.dumps(value,sort_keys=True))}
                   for row in rows],key=lambda row:row['key'])
def prepare(binding_path):
    b=read(binding_path);m=fresh();policy=b.get('policy')
    if not isinstance(policy,dict) or policy.get('version')!=m['policyVersion'] or policy.get('limits')!=m['runtimeLimits'] or not re.fullmatch('[a-z0-9][a-z0-9-]{0,39}',policy.get('tenant',{}).get('slug','')) or not re.fullmatch('[a-f0-9]{64}',policy['tenant'].get('identity','')): fail('Unbound policy')
    if digest(policy)!=b.get('digest'): fail('Policy digest mismatch')
    expiry=dt.datetime.fromisoformat(policy['expiresAt'].replace('Z','+00:00'))
    if not now()+dt.timedelta(minutes=45)<expiry<=now()+dt.timedelta(minutes=60): fail('Stale policy; do not replace/reissue it')
    original=read(PRIVATE/'original-mc-env.json');current=read(cache('mc'))
    if projection(original)!=projection(current): fail('Environment changed since original capture')
    for key in ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','CALENDAR_TOKEN_ENCRYPTION_KEY','SERVICE_WORKER_KEY']:
        if not effective(current,key): fail('Required existing Calendar configuration missing')
    if digest(effective(current,'GOOGLE_CLIENT_ID'))!=m['googleClientIdHash']: fail('Google client identity changed')
    for key in ['PHONE_ACQUISITION_ENABLED','VOICE_ACTIVATION_ENABLED','MESSAGING_ACTIVATION_ENABLED','SERVICE_DELIVERY_ENABLED','MC_PLATFORM_SMS_ENABLED','WORKSPACE_BILLING_ENABLED','WORKSPACE_BILLING_LIVE_ENABLED','CALENDAR_SELF_SERVICE_ENABLED']:
        if effective(current,key)=='true': fail('Unapproved noncohort service gate enabled')
    if effective(current,'CALENDAR_EXECUTION_POLICY_JSON'):
        try: old=json.loads(effective(current,'CALENDAR_EXECUTION_POLICY_JSON'))
        except Exception: fail('Original Calendar policy malformed')
        if dt.datetime.fromisoformat(old['expiresAt'].replace('Z','+00:00'))>now(): fail('Another Calendar policy still active')
    values={'CALENDAR_CONNECTION_ENABLED':'true','CALENDAR_DELIVERY_ENABLED':'true','CALENDAR_EXECUTION_APPROVED_VERSION':policy['version'],'CALENDAR_EXECUTION_POLICY_JSON':json.dumps(policy,separators=(',',':'))}
    rows=[production_row(key,values[key],env_row(current,key)) for key in MC_KEYS]
    private_write(PRIVATE/'prepared-mc-env.json',rows,exclusive=True);private_write(PRIVATE/'binding.json',b,exclusive=True)
    return {'prepared':True,'settings':4,'sha256':digest(rows),'expiry':policy['expiresAt']}
def git(s,append,site,push=False):
    c=SITES[site];cwd=c['cwd'];head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=cwd,text=True).strip();remote=subprocess.check_output(['git','remote','get-url','origin'],cwd=cwd,text=True).strip()
    if head!=c['candidate'] or remote!=c['remote']: fail('Local source/remote is not exact reviewed candidate')
    if subprocess.run(['git','diff','--quiet','HEAD','--'],cwd=cwd).returncode: fail('Tracked source modified')
    if push:
        observed=s.get('remote',{}).get(site)
        if observed!=c['base'] or (now()-dt.datetime.fromisoformat(s.get('remoteAt',{}).get(site,'2000-01-01T00:00:00+00:00').replace('Z','+00:00'))).total_seconds()>90: fail('Explicit fresh baseline remote check required before push')
        subprocess.run(['git','merge-base','--is-ancestor',c['base'],c['candidate']],cwd=cwd,check=True)
    row=reserve(s,append,('push:' if push else 'remote:')+site,'GIT-PUSH' if push else 'GIT-GET',c['remote']+' refs/heads/main',build=push,cleanup=(not push and s.get('cleanup',False)),request_units=6)
    try:
        trace=PRIVATE/f'control-git-{row["id"]:03d}-curl.trace'
        with os.fdopen(os.open(trace,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w'): pass
        env={**os.environ,'GIT_TRACE_CURL':str(trace),'GIT_TRACE_CURL_NO_DATA':'1','GIT_TRACE_REDACT':'1','GIT_TERMINAL_PROMPT':'0','GCM_INTERACTIVE':'never','GIT_ALLOW_PROTOCOL':'https','GIT_HTTP_MAX_RETRIES':'0'}
        options=['git','-c','http.version=HTTP/1.1','-c','http.followRedirects=false','-c','http.maxRequests=1','-c','http.lowSpeedLimit=1','-c','http.lowSpeedTime=25']
        # Candidate ancestry is checked above. This lease is compare-and-swap,
        # not permission for a non-fast-forward history rewrite.
        args=options+(['push','--porcelain','--force-with-lease=refs/heads/main:'+c['base'],'origin',c['candidate']+':refs/heads/main'] if push else ['ls-remote','--exit-code','origin','refs/heads/main'])
        # One native operation, never retried by this helper. Reserve six HTTP
        # starts first, including auth challenges and a possible proxy CONNECT.
        p=subprocess.run(args,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90,text=True)
        text=trace.read_text(errors='replace');physical=len(re.findall(r'=> Send header: [A-Z]+ \S+ HTTP/[0-9.]+',text))
        private_write(PRIVATE/f'control-git-{row["id"]:03d}.json',{'stdout':p.stdout,'stderr':p.stderr,'code':p.returncode})
        row.update(state='observed',exitCode=p.returncode,outputSHA256=digest(p.stdout+p.stderr),traceSHA256=digest(text),observedPhysicalHTTPRequests=physical,unusedReservationRetained=max(0,6-physical));append()
        if physical<1 or physical>6 or re.search(r'retrying|retrying a fresh|retry after',text,re.I):
            row['state']='unknown';append();fail('Git transport exceeded/missed its physical envelope or attempted retry; reconcile without repeating')
        if p.returncode: fail('Git operation failed; private result retained, no automatic retry')
        if not push:
            ref=p.stdout.split()[0]
            if ref not in [c['base'],c['candidate']]: fail('Remote source drift')
            s.setdefault('remote',{})[site]=ref;s.setdefault('remoteAt',{})[site]=iso();append();return {'site':site,'remoteCommit':ref,'physicalHTTPRequests':physical,'reservedRequests':6}
        return {'site':site,'pushed':c['candidate'],'buildReservationConsumed':True,'physicalHTTPRequests':physical,'reservedRequests':6}
    except Exception:
        if row['state']=='reserved_unknown': row['state']='unknown';append()
        raise
def main():
    global PRIVATE,PHASE,LEDGER,MANIFEST,APPROVAL_SHA
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--packet',required=True);parser.add_argument('--sha256',required=True);parser.add_argument('command',choices=['init','status','site','env','remote','push','prepare','apply-key','restore-key','cleanup-build','deploys']);parser.add_argument('input',nargs='?');args=parser.parse_args()
    MANIFEST=pathlib.Path(args.packet).resolve();APPROVAL_SHA=args.sha256
    st=MANIFEST.lstat()
    if not MANIFEST.is_file() or MANIFEST.is_symlink() or st.st_mode&0o777!=0o600 or st.st_uid!=os.getuid() or not re.fullmatch('[a-f0-9]{64}',APPROVAL_SHA): fail('Private approved packet0600 required')
    packet=read(MANIFEST);PHASE=packet.get('phaseId','')
    if not re.fullmatch('core-calendar-[a-z0-9-]{8,80}',PHASE): fail('Invalid phase')
    PRIVATE=MANIFEST.parent;LEDGER=ROOT/'scratchpad'/f'{PHASE}-control.jsonl'
    if PRIVATE==ROOT or ROOT in PRIVATE.parents: fail('Private packet must be outside repository')
    fresh()
    if args.command=='init':
        candidate=SITES['mc']['candidate']
        if subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()!=candidate or subprocess.run(['git','diff','--quiet','HEAD','--'],cwd=ROOT).returncode: fail('Exact clean source required')
        private_write(LEDGER,{'phase':PHASE,'limits':{'requests':48,'mutations':16,'builds':2},'requests':0,'mutations':0,'builds':0,'rows':[]},exclusive=True);return {'initialized':True,'controlRequests':48,'guardControlRequests':72,'aggregateMaximum':120}
    if args.command=='prepare': return prepare(args.input)
    with locked() as (s,append):
        if args.command=='status': return {'requests':s['requests'],'mutations':s['mutations'],'builds':s['builds'],'unknown':[r['id'] for r in s['rows'] if r['state'] in ['unknown','reserved_unknown']]}
        if args.command=='env':
            summary=env_get(s,append,'mc',cleanup=s.get('cleanup',False))
            original=read(PRIVATE/'original-mc-env.json');current=read(cache('mc'))
            if s.get('cleanup'):
                if projection(current)!=projection(original): fail('Full original environment readback differs')
                s['restored']=True;append()
            elif (PRIVATE/'prepared-mc-env.json').exists():
                wanted=read(PRIVATE/'prepared-mc-env.json')
                if projection([row for row in current if row['key'] in MC_KEYS])!=projection(wanted): fail('Staged Calendar environment readback differs')
                if projection([row for row in current if row['key'] not in MC_KEYS])!=projection([row for row in original if row['key'] not in MC_KEYS]): fail('Unrelated environment changed')
                s['stagedVerified']=True;append()
            summary['originalEnvironmentRestored']=bool(s.get('restored'));summary['stagedVerified']=bool(s.get('stagedVerified'));return summary
        if args.command=='site':
            v=request(s,append,'site:mc','mc','/sites/'+SITES['mc']['id'],cleanup=s.get('cleanup',False))
            if v.get('id')!=SITES['mc']['id'] or v.get('account_id')!=ACCOUNT: fail('Wrong site/account')
            d=v.get('published_deploy') or {};private_write(PRIVATE/'current-mc-site.json',v)
            return {'disabled':v.get('disabled'),'deployId':d.get('id'),'state':d.get('state'),'commit':d.get('commit_ref')}
        if args.command=='deploys':
            v=request(s,append,'deploys:mc','mc','/sites/'+SITES['mc']['id']+'/deploys?per_page=5',cleanup=True)
            return {'deploys':[{'id':r.get('id'),'state':r.get('state'),'commit':r.get('commit_ref')} for r in v]}
        if args.command in ['remote','push']:
            if args.command=='push' and not s.get('stagedVerified'): fail('Read back exact staged environment before publication')
            return git(s,append,'mc',push=args.command=='push')
        if args.command=='apply-key':
            if args.input not in MC_KEYS: fail('One of four exact Calendar keys required')
            wanted=[row for row in read(PRIVATE/'prepared-mc-env.json') if row['key']==args.input]
            if len(wanted)!=1: fail('Missing prepared key')
            put_rows(s,append,'mc',wanted,'calendar-proof');return {'siteId':SITES['mc']['id'],'key':args.input,'valueSHA256':digest(effective(wanted,args.input)),'context':'production','scopes':wanted[0]['scopes']}
        if args.command=='restore-key':
            if args.input not in MC_KEYS: fail('One of four exact Calendar keys required')
            s['cleanup']=True;append();original=read(PRIVATE/'original-mc-env.json')
            key=args.input;current=read(cache('mc'));old=env_row(original,key)
            if old: put_rows(s,append,'mc',[row_body(old)],'restore-mc',cleanup=True)
            elif env_row(current,key):
                request(s,append,'restore-mc:delete:'+key,'mc',env_path('mc',key),'DELETE',cleanup=True);private_write(cache('mc'),[r for r in current if r['key']!=key])
            return {'key':key,'restoredOriginalSetting':True,'readbackAndDeployRequired':s['builds']>0}
        if args.command=='cleanup-build':
            if not s.get('restored') or projection(read(cache('mc')))!=projection(read(PRIVATE/'original-mc-env.json')): fail('Read back restored original environment first')
            if s.get('remote',{}).get('mc')!=SITES['mc']['candidate'] or (now()-dt.datetime.fromisoformat(s.get('remoteAt',{}).get('mc','2000-01-01T00:00:00+00:00').replace('Z','+00:00'))).total_seconds()>90: fail('Fresh exact candidate remote required')
            v=request(s,append,'build:mc:cleanup','mc','/sites/'+SITES['mc']['id']+'/builds','POST',{'branch':'main'},build=True,cleanup=True);return {'cleanupBuildReserved':True,'buildId':v.get('id'),'deployId':v.get('deploy_id')}
    fail('Unsupported command')
if __name__=='__main__':
    try: print(json.dumps(main(),separators=(',',':')))
    except Exception as error: print(json.dumps({'ok':False,'error':str(error)}),file=sys.stderr);sys.exit(1)
