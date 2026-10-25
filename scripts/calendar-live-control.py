#!/usr/bin/env python3
"""Calendar proof's fixed supplemental48-request control adapter. No effects on import."""
import argparse, contextlib, datetime as dt, fcntl, hashlib, json, os, pathlib, re, subprocess, sys, urllib.error, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
PRIVATE=None; PHASE=None; LEDGER=None; MANIFEST=None; APPROVAL_SHA=None; MAIL_BINDING_SHA=None
MAIL_PHASE='core-calendar-borrowed-launch-v8-20261025'
MAIL_PREP=pathlib.Path('/tmp/mc-calendar-v8-mail-prep-20261025')
MAIL_PRIVATE=pathlib.Path('/tmp/mc-calendar-v8-private-20261025')
MAIL_REJECTIONS=frozenset(['arguments','mode','configuration_missing','configuration_custody','configuration_shape','configuration_unbound_or_expired','navigation_not_approved','interactive_session_locked','interactive_session_unknown','expired_before_native','owned_process_missing','owned_window_missing','owned_mail_target_missing_or_changed','current_navigation_not_owned','restore_not_owned','expired_before_navigation','script_not_approved','script_unavailable','expired_before_javascript','script_result_unconfirmed','private_custody','private_write_unconfirmed'])
ACCOUNT='69797d78f01c70674ffef858'
SITES={'mc':{'id':'f87916f1-bcc4-4171-a96f-2900cbf0b6dc','base':'46c0f03b1f4113cbc3da6bd8ddf03455cacc2187','gitBase':'615de409891df9c91ab53569daa462157615722a','baselineDeployId':'6add4c9eb22cf12c47b30691','candidate':None,'cwd':str(ROOT),'remote':'https://github.com/machinesandcloud/Machines-and-cloud.git'}}
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
    # Guard metadata<=12 and Blobs<=90 leave this adapter exactly48 of150.
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
def mail_file(path,mode=0o600,maximum=100000):
    path=pathlib.Path(path);st=path.lstat()
    if not path.is_file() or path.is_symlink() or st.st_uid!=os.getuid() or st.st_mode&0o7777!=mode or not 0<st.st_size<=maximum: fail('Mail file custody changed')
    return path.read_bytes()
def mail_binding():
    packet=fresh();directory=MAIL_PRIVATE.lstat()
    if not MAIL_PRIVATE.is_dir() or MAIL_PRIVATE.is_symlink() or directory.st_uid!=os.getuid() or directory.st_mode&0o7777!=0o700: fail('Mail private directory custody changed')
    raw=mail_file(MAIL_PRIVATE/'mail-execution-binding.json')
    if not MAIL_BINDING_SHA or digest(raw)!=MAIL_BINDING_SHA: fail('Mail binding digest changed')
    b=json.loads(raw);keys={'version','state','phaseId','packetSHA256','candidateCommit','approvedAt','approvalExpiresAt','factorySHA256','configSHA256'}
    if set(b)!=keys or b['version']!=1 or b['state']!='READY' or PHASE!=MAIL_PHASE or b['phaseId']!=PHASE or b['packetSHA256']!=APPROVAL_SHA or b['candidateCommit']!=packet['candidateCommit'] or b['approvedAt']!=packet['approvedAt'] or b['approvalExpiresAt']!=packet['approvalExpiresAt']: fail('Mail binding does not match approved packet')
    start=dt.datetime.fromisoformat(b['approvedAt'].replace('Z','+00:00'));end=dt.datetime.fromisoformat(b['approvalExpiresAt'].replace('Z','+00:00'))
    if not start<=now()<end or not 0<(end-start).total_seconds()<=14400: fail('Mail binding expired')
    if not all(isinstance(b[k],str) and re.fullmatch('[a-f0-9]{64}',b[k]) and b[k]!='0'*64 for k in ['factorySHA256','configSHA256']): fail('Mail source pins missing')
    if digest(mail_file(ROOT/'scripts/calendar-native-mail.mjs',0o644))!=b['factorySHA256']: fail('Mail factory changed')
    raw=mail_file(MAIL_PREP/'mail-sources.json')
    if digest(raw)!=b['configSHA256']: fail('Mail configuration changed')
    cfg=json.loads(raw)
    if cfg.get('phaseId')!=PHASE or cfg.get('state')!='READY' or cfg.get('candidateCommit')!=b['candidateCommit'] or cfg.get('expiresAt')!=b['approvalExpiresAt'] or cfg.get('approval')!={'packetSHA256':APPROVAL_SHA,'approvedAt':b['approvedAt'],'approvalExpiresAt':b['approvalExpiresAt']} or cfg.get('limits')!={'invocations':40,'messageReads':3}: fail('Mail configuration not approved')
    expected={str(MAIL_PREP/'mail-js'/f'{name}.js'):kind for name,kind in [('account-meta','metadata'),('owner-rows','metadata'),('owner-open','action'),('owner-message-meta','metadata'),('owner-extract','message'),('owner-return','action')]}
    sources=cfg.get('sources')
    if not isinstance(sources,list) or len(sources)!=6 or any(not isinstance(x,dict) or set(x)!={'path','sha256','type'} or not isinstance(x['path'],str) or expected.get(x['path'])!=x['type'] or not isinstance(x['sha256'],str) or not re.fullmatch('[a-f0-9]{64}',x['sha256']) for x in sources) or len({x['path'] for x in sources})!=6: fail('Owner-only mail sources changed')
    return b,cfg
def fresh_native(): return {'maxInvocations':40,'maxMessageReads':3,'invocations':0,'messageReads':0,'rows':[],'unknown':False,'restoreAttempted':False}
def safe_mail_rejection(stdout):
    if not isinstance(stdout,str): return None
    try:
        if len(stdout.encode())>1024: return None
        value=json.loads(stdout)
    except Exception: return None
    if isinstance(value,dict) and set(value)=={'nativeMailRejected'} and isinstance(value['nativeMailRejected'],str) and value['nativeMailRejected']in MAIL_REJECTIONS: return value['nativeMailRejected']
    return None
def native_summary(n):
    result={k:n[k]for k in ['invocations','messageReads','unknown','restoreAttempted']}
    reason=next((r.get('reason')for r in reversed(n['rows'])if isinstance(r.get('reason'),str) and r['reason'].startswith('native_mail_') and r['reason'][12:]in MAIL_REJECTIONS),None)
    if reason: result['lastReason']=reason
    return result
def native_valid(n):
    if not isinstance(n,dict) or set(n)!={'maxInvocations','maxMessageReads','invocations','messageReads','rows','unknown','restoreAttempted'} or n['maxInvocations']!=40 or n['maxMessageReads']!=3 or type(n['invocations'])is not int or not 0<=n['invocations']<=40 or type(n['messageReads'])is not int or not 0<=n['messageReads']<=3 or type(n['unknown'])is not bool or type(n['restoreAttempted'])is not bool or not isinstance(n['rows'],list) or len(n['rows'])!=n['invocations']: fail('Mail state contract changed')
    required={'id','mode','type','sourceSHA256','configurationSHA256','navigationSHA256','restore','state','at'}
    for i,r in enumerate(n['rows']):
        if not isinstance(r,dict) or not required<=set(r)<=required|{'completedAt','reason','dispatchState'} or type(r['id'])is not int or r['id']!=i+1 or r['mode'] not in ['url','read','private'] or r['type'] not in ['navigation','metadata','action','message'] or type(r['restore'])is not bool or r['state'] not in ['reserved_unknown','observed','unknown'] or r.get('dispatchState') not in [None,'reserved_unknown','observed','unknown']: fail('Mail invocation contract changed')
        if any(not isinstance(r[k],str) or not re.fullmatch('[a-f0-9]{64}',r[k]) for k in ['configurationSHA256','navigationSHA256']) or (r['sourceSHA256'] is not None and (not isinstance(r['sourceSHA256'],str) or not re.fullmatch('[a-f0-9]{64}',r['sourceSHA256']))): fail('Mail invocation source identity changed')
        if r['type']=='navigation' and (r['mode']!='url' or r['sourceSHA256']is not None) or r['type']=='message' and r['mode']!='private' or r['type']in ['metadata','action'] and r['mode']!='read' or r['restore'] and r['type']!='navigation': fail('Mail invocation mode changed')
        for k in ['at','completedAt']:
            if k in r and (not isinstance(r[k],str) or len(r[k])>40): fail('Mail invocation clock invalid')
        if 'reason'in r and (not isinstance(r['reason'],str) or not re.fullmatch('native_mail_[a-z_]{1,70}',r['reason'])): fail('Mail invocation error invalid')
    if n['messageReads']!=sum(r['type']=='message' for r in n['rows']) or n['restoreAttempted']!=any(r['restore'] for r in n['rows']) or sum(r['restore'] for r in n['rows'])>1: fail('Mail counters changed')
    if any(r['state']!='observed' or r.get('dispatchState')!='observed' for r in n['rows']) and not n['unknown']: fail('Mail uncertainty cannot be cleared')
def native_save(s,append,value):
    if not isinstance(value,dict) or set(value)!={'expectedRevision','native'} or type(value['expectedRevision'])is not int or value['expectedRevision']!=s.get('nativeRevision'): fail('Mail revision conflict; do not retry effect')
    old=s['native'];new=value['native'];native_valid(old);native_valid(new)
    if s.get('nativeBindingSHA256')!=MAIL_BINDING_SHA: fail('Mail binding changed')
    b,cfg=mail_binding()
    count=new['invocations']-old['invocations']
    if count==1:
        r=new['rows'][-1]
        if new['rows'][:-1]!=old['rows'] or r['state']!='reserved_unknown' or 'dispatchState'in r or 'completedAt'in r or 'reason'in r or not new['unknown'] or old['restoreAttempted'] or old['unknown'] and not r['restore'] or old['invocations']>=(40 if r['restore'] else 39) or r['configurationSHA256']!=b['configSHA256'] or r['navigationSHA256']!=cfg['navigation']['sha256'] or s.get('cleanup') and not r['restore']: fail('Mail reservation not admitted')
        sources=[x for x in cfg['sources'] if x['sha256']==r['sourceSHA256'] and x['type']==r['type']]
        if r['type']!='navigation' and len(sources)!=1: fail('Mail source is not bound')
    elif count==0 and new['invocations']>0:
        before=old['rows'][-1];after=new['rows'][-1]
        immutable={'id','mode','type','sourceSHA256','configurationSHA256','navigationSHA256','restore','at','dispatchState'}
        if new['rows'][:-1]!=old['rows'][:-1] or any(before.get(k)!=after.get(k) for k in immutable) or after['state']not in {'reserved_unknown':{'reserved_unknown','unknown','observed'},'unknown':{'unknown'},'observed':{'observed'}}[before['state']] or after['state']=='observed' and after.get('dispatchState')!='observed' or new['messageReads']!=old['messageReads'] or new['restoreAttempted']!=old['restoreAttempted']: fail('Mail completion changed prior identity')
    else: fail('Mail state cannot reset or skip invocations')
    s['native']=new;s['nativeRevision']+=1;append();return {'nativeRevision':s['nativeRevision']}
def native_dispatch(s,append,value):
    if not isinstance(value,dict) or set(value)!={'expectedRevision','invocationId','mode','argument'} or type(value['expectedRevision'])is not int or value['expectedRevision']!=s.get('nativeRevision'): fail('Mail dispatch revision conflict')
    n=s['native'];native_valid(n);b,cfg=mail_binding()
    if not n['rows'] or value['invocationId']!=n['invocations'] or value['mode']!=n['rows'][-1]['mode']: fail('Mail dispatch identity changed')
    r=n['rows'][-1]
    if r['state']!='reserved_unknown' or 'dispatchState'in r or s.get('nativeBindingSHA256')!=MAIL_BINDING_SHA or s.get('cleanup') and not r['restore']: fail('Mail dispatch already attempted or withdrawn')
    nav_raw=mail_file(MAIL_PREP/'mail-navigation.json')
    if digest(nav_raw)!=cfg['navigation']['sha256'] or r['configurationSHA256']!=b['configSHA256'] or r['navigationSHA256']!=cfg['navigation']['sha256']: fail('Mail navigation changed')
    nav=json.loads(nav_raw);argument=value['argument']
    if r['type']=='navigation':
        if not isinstance(argument,str) or argument not in [nav['originalURL']]+nav['searchURLs'] or r['restore']!=(argument==nav['originalURL']): fail('Mail navigation is not approved')
    else:
        sources=[x for x in cfg['sources'] if x['path']==argument and x['sha256']==r['sourceSHA256'] and x['type']==r['type']]
        if len(sources)!=1 or digest(mail_file(argument))!=r['sourceSHA256']: fail('Mail script changed')
    helper=cfg['helper']
    if helper['path']!=str(MAIL_PREP/'native-mail') or helper['sourcePath']!=str(MAIL_PREP/'native-mail.swift') or digest(mail_file(helper['path'],0o700,10000000))!=helper['sha256'] or digest(mail_file(helper['sourcePath']))!=helper['sourceSHA256']: fail('Mail helper changed')
    r['dispatchState']='reserved_unknown';s['nativeRevision']+=1;append()
    try:
        # This existing journal flock remains held across the native child. A
        # second process cannot consume restore or dispatch the same row.
        mail_binding()
        if digest(mail_file(helper['path'],0o700,10000000))!=helper['sha256'] or digest(mail_file(helper['sourcePath']))!=helper['sourceSHA256'] or digest(mail_file(MAIL_PREP/'mail-navigation.json'))!=cfg['navigation']['sha256'] or r['type']!='navigation' and digest(mail_file(argument))!=r['sourceSHA256']: fail('Mail source changed after dispatch reservation')
        if now()>=dt.datetime.fromisoformat(b['approvalExpiresAt'].replace('Z','+00:00')): fail('Mail expired before dispatch')
        result=subprocess.run([helper['path'],value['mode'],argument],capture_output=True,text=True,timeout=15)
        if result.returncode==2:
            rejected=safe_mail_rejection(result.stdout)
            if rejected: r['reason']='native_mail_'+rejected
        if result.returncode!=0 or not isinstance(result.stdout,str) or len(result.stdout.encode())>65536: fail('Native mail outcome unconfirmed')
        r['dispatchState']='observed';s['nativeRevision']+=1;append();return {'nativeRevision':s['nativeRevision'],'stdout':result.stdout}
    except Exception:
        r['dispatchState']='unknown';s['nativeRevision']+=1;append();raise RuntimeError('Native mail outcome unconfirmed; cleanup only')
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
def current_site(s,append,cleanup=False):
    value=request(s,append,'site:mc','mc','/sites/'+SITES['mc']['id'],cleanup=cleanup)
    deployment=value.get('published_deploy') or {}
    expected=SITES['mc']['candidate'] if s['builds'] else SITES['mc']['base']
    if value.get('id')!=SITES['mc']['id'] or value.get('account_id')!=ACCOUNT or value.get('disabled') is True or deployment.get('state')!='ready' or deployment.get('commit_ref') not in ([SITES['mc']['base'],SITES['mc']['candidate']] if cleanup and s['builds'] else [expected]): fail('Current production revision changed or is not READY; do not overwrite environment')
    if deployment.get('commit_ref')==SITES['mc']['base'] and deployment.get('id')!=SITES['mc']['baselineDeployId']: fail('Baseline deployment identity changed')
    selected=PRIVATE/'initial-ready-deployment.json'
    if selected.exists() and deployment.get('commit_ref')==SITES['mc']['candidate'] and deployment.get('id')!=read(selected).get('deployId'): fail('A different candidate deployment is published; do not overwrite environment')
    value['_observedAt']=iso();private_write(PRIVATE/'current-mc-site.json',value)
    return value
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
    c=SITES[site];git_base=c.get('gitBase',c['base']);cwd=c['cwd'];head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=cwd,text=True).strip();remote=subprocess.check_output(['git','remote','get-url','origin'],cwd=cwd,text=True).strip()
    if head!=c['candidate'] or remote!=c['remote']: fail('Local source/remote is not exact reviewed candidate')
    if subprocess.run(['git','diff','--quiet','HEAD','--'],cwd=cwd).returncode: fail('Tracked source modified')
    if push:
        observed=s.get('remote',{}).get(site)
        if observed!=git_base or (now()-dt.datetime.fromisoformat(s.get('remoteAt',{}).get(site,'2000-01-01T00:00:00+00:00').replace('Z','+00:00'))).total_seconds()>90: fail('Explicit fresh baseline remote check required before push')
        subprocess.run(['git','merge-base','--is-ancestor',git_base,c['candidate']],cwd=cwd,check=True)
    row=reserve(s,append,('push:' if push else 'remote:')+site,'GIT-PUSH' if push else 'GIT-GET',c['remote']+' refs/heads/main',build=push,cleanup=(not push and s.get('cleanup',False)),request_units=6)
    try:
        trace=PRIVATE/f'control-git-{row["id"]:03d}-curl.trace'
        with os.fdopen(os.open(trace,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w'): pass
        env={**os.environ,'GIT_TRACE_CURL':str(trace),'GIT_TRACE_CURL_NO_DATA':'1','GIT_TRACE_REDACT':'1','GIT_TERMINAL_PROMPT':'0','GCM_INTERACTIVE':'never','GIT_ALLOW_PROTOCOL':'https','GIT_HTTP_MAX_RETRIES':'0'}
        options=['git','-c','http.version=HTTP/1.1','-c','http.followRedirects=false','-c','http.maxRequests=1','-c','http.lowSpeedLimit=1','-c','http.lowSpeedTime=25']
        # Candidate ancestry is checked above. This lease is compare-and-swap,
        # not permission for a non-fast-forward history rewrite.
        args=options+(['push','--porcelain','--force-with-lease=refs/heads/main:'+git_base,'origin',c['candidate']+':refs/heads/main'] if push else ['ls-remote','--exit-code','origin','refs/heads/main'])
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
            if ref not in [git_base,c['candidate']]: fail('Remote source drift')
            s.setdefault('remote',{})[site]=ref;s.setdefault('remoteAt',{})[site]=iso();append();return {'site':site,'remoteCommit':ref,'physicalHTTPRequests':physical,'reservedRequests':6}
        return {'site':site,'pushed':c['candidate'],'buildReservationConsumed':True,'physicalHTTPRequests':physical,'reservedRequests':6}
    except Exception:
        if row['state']=='reserved_unknown': row['state']='unknown';append()
        raise
def main():
    global PRIVATE,PHASE,LEDGER,MANIFEST,APPROVAL_SHA,MAIL_BINDING_SHA
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--packet',required=True);parser.add_argument('--sha256',required=True);parser.add_argument('--mail-binding-sha256');parser.add_argument('command',choices=['init','status','site','env','cleanup-env','remote','push','prepare','apply-key','restore-key','cleanup-build','deploys','native-mail-snapshot','native-mail-save','native-mail-dispatch']);parser.add_argument('input',nargs='?');args=parser.parse_args()
    MANIFEST=pathlib.Path(args.packet).resolve();APPROVAL_SHA=args.sha256;MAIL_BINDING_SHA=args.mail_binding_sha256
    if MAIL_BINDING_SHA and not re.fullmatch('[a-f0-9]{64}',MAIL_BINDING_SHA): fail('Mail binding SHA required')
    st=MANIFEST.lstat()
    if not MANIFEST.is_file() or MANIFEST.is_symlink() or st.st_mode&0o777!=0o600 or st.st_uid!=os.getuid() or not re.fullmatch('[a-f0-9]{64}',APPROVAL_SHA): fail('Private approved packet0600 required')
    packet=read(MANIFEST);PHASE=packet.get('phaseId','')
    if not re.fullmatch('core-calendar-[a-z0-9-]{8,80}',PHASE): fail('Invalid phase')
    PRIVATE=MANIFEST.parent;LEDGER=ROOT/'scratchpad'/f'{PHASE}-control.jsonl'
    if PRIVATE==ROOT or ROOT in PRIVATE.parents: fail('Private packet must be outside repository')
    fresh()
    if MAIL_BINDING_SHA: mail_binding()
    if args.command=='init':
        candidate=SITES['mc']['candidate']
        if subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()!=candidate or subprocess.run(['git','diff','--quiet','HEAD','--'],cwd=ROOT).returncode: fail('Exact clean source required')
        state={'phase':PHASE,'limits':{'requests':48,'mutations':16,'builds':2},'requests':0,'mutations':0,'builds':0,'rows':[]}
        if MAIL_BINDING_SHA: state.update(nativeBindingSHA256=MAIL_BINDING_SHA,nativeRevision=0,native=fresh_native())
        private_write(LEDGER,state,exclusive=True);return {'initialized':True,'controlRequests':48,'guardControlRequests':102,'aggregateMaximum':150}
    if args.command=='prepare': return prepare(args.input)
    with locked() as (s,append):
        if args.command.startswith('native-mail-'):
            if not MAIL_BINDING_SHA or s.get('nativeBindingSHA256')!=MAIL_BINDING_SHA or type(s.get('nativeRevision'))is not int: fail('Mail control not bound')
            native_valid(s.get('native'))
            if args.command=='native-mail-snapshot': return {'nativeRevision':s['nativeRevision'],'native':s['native']}
            if not args.input or len(args.input)>65536: fail('Bounded mail input required')
            value=json.loads(args.input)
            if args.command=='native-mail-save': return native_save(s,append,value)
            return native_dispatch(s,append,value)
        if args.command=='status': return {'requests':s['requests'],'mutations':s['mutations'],'builds':s['builds'],'unknown':[r['id'] for r in s['rows'] if r['state'] in ['unknown','reserved_unknown']],**({'native':native_summary(s['native'])} if 'native'in s else {})}
        if args.command=='cleanup-env':
            # A lost mutation can have applied. Inspect actual current values,
            # without retrying the original mutation or trusting cached absence.
            s['cleanup']=True;append();current_site(s,append,cleanup=True)
            summary=env_get(s,append,'mc',cleanup=True)
            original=read(PRIVATE/'original-mc-env.json');current=read(cache('mc'));prepared=read(PRIVATE/'prepared-mc-env.json')
            if projection([row for row in current if row['key'] not in MC_KEYS])!=projection([row for row in original if row['key'] not in MC_KEYS]): fail('Unrelated environment changed; preserve it and stop')
            for key in MC_KEYS:
                seen=[row for row in current if row['key']==key]
                before=[row for row in original if row['key']==key]
                staged=[row for row in prepared if row['key']==key]
                if projection(seen) not in [projection(before),projection(staged)]: fail('Calendar setting has another owner/revision; do not overwrite')
            summary['cleanupInspected']=True;return summary
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
            v=current_site(s,append,cleanup=s.get('cleanup',False));d=v.get('published_deploy') or {}
            return {'disabled':v.get('disabled'),'deployId':d.get('id'),'state':d.get('state'),'commit':d.get('commit_ref')}
        if args.command=='deploys':
            v=request(s,append,'deploys:mc','mc','/sites/'+SITES['mc']['id']+'/deploys?per_page=5',cleanup=True)
            return {'deploys':[{'id':r.get('id'),'state':r.get('state'),'commit':r.get('commit_ref')} for r in v]}
        if args.command in ['remote','push']:
            if args.command=='push' and not s.get('stagedVerified'): fail('Read back exact staged environment before publication')
            if args.command=='push':
                current_site(s,append)
                actual=request(s,append,'inspect-before:push','mc',env_path('mc'))
                if projection(actual)!=projection(read(cache('mc'))): fail('Actual environment changed before publication; do not build cached settings')
            return git(s,append,'mc',push=args.command=='push')
        if args.command=='apply-key':
            if args.input not in MC_KEYS: fail('One of four exact Calendar keys required')
            current_site(s,append)
            cached=read(cache('mc'));actual=request(s,append,'inspect-before:'+args.input,'mc',env_path('mc'))
            if projection(actual)!=projection(cached): fail('Environment changed before key write')
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
            observed=read(PRIVATE/'current-mc-site.json');deployment=observed.get('published_deploy') or {}
            if deployment.get('commit_ref')!=SITES['mc']['candidate'] or deployment.get('state')!='ready' or (now()-dt.datetime.fromisoformat(observed.get('_observedAt','2000-01-01T00:00:00+00:00').replace('Z','+00:00'))).total_seconds()>90: fail('Fresh exact current production candidate required for cleanup build')
            if s.get('remote',{}).get('mc')!=SITES['mc']['candidate'] or (now()-dt.datetime.fromisoformat(s.get('remoteAt',{}).get('mc','2000-01-01T00:00:00+00:00').replace('Z','+00:00'))).total_seconds()>90: fail('Fresh exact candidate remote required')
            actual=request(s,append,'inspect-before:cleanup-build','mc',env_path('mc'),cleanup=True)
            if projection(actual)!=projection(read(PRIVATE/'original-mc-env.json')): fail('Actual environment changed before cleanup build; do not build cached settings')
            v=request(s,append,'build:mc:cleanup','mc','/sites/'+SITES['mc']['id']+'/builds','POST',{'branch':'main'},build=True,cleanup=True);return {'cleanupBuildReserved':True,'buildId':v.get('id'),'deployId':v.get('deploy_id')}
    fail('Unsupported command')
if __name__=='__main__':
    try: print(json.dumps(main(),separators=(',',':')))
    except Exception as error: print(json.dumps({'ok':False,'error':str(error)}),file=sys.stderr);sys.exit(1)
