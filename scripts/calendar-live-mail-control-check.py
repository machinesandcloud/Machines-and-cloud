#!/usr/bin/env python3
"""Affected V8 same-journal tests. Native children, credentials and sockets denied."""
import copy,datetime as dt,importlib.util,json,pathlib,socket,tempfile,threading,time

def deny(*a,**k): raise AssertionError('Physical effect denied')
socket.socket.connect=socket.create_connection=deny
spec=importlib.util.spec_from_file_location('calendar_control',pathlib.Path(__file__).with_name('calendar-live-control.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.subprocess.run=m.subprocess.check_output=deny
checks=[]
def check(name,fn):fn();checks.append(name)
def rejects(fn):
    try:fn()
    except (RuntimeError,AssertionError):return
    raise AssertionError('Expected refusal')
with tempfile.TemporaryDirectory(prefix='mc-mail-control-check-')as directory:
    root=pathlib.Path(directory);m.ROOT=root/'repo';(m.ROOT/'scripts').mkdir(parents=True)
    m.PRIVATE=root/'packet';m.PRIVATE.mkdir(mode=0o700);m.MAIL_PRIVATE=root/'mail-private';m.MAIL_PRIVATE.mkdir(mode=0o700);m.MAIL_PREP=root/'mail-prep';(m.MAIL_PREP/'mail-js').mkdir(parents=True)
    current=[dt.datetime(2026,10,25,0,1,tzinfo=dt.timezone.utc)];m.now=lambda:current[0];m.PHASE=m.MAIL_PHASE
    packet={'approved':True,'phaseId':m.PHASE,'scope':'owned_calendar_busy_lifecycle_v2','target':{'siteId':m.SITES['mc']['id'],'accountId':m.ACCOUNT},'candidateCommit':'a'*40,'approvedAt':'2026-10-25T00:00:00Z','approvalExpiresAt':'2026-10-25T02:00:00Z'}
    m.MANIFEST=m.PRIVATE/'packet.json';m.private_write(m.MANIFEST,packet,True);m.APPROVAL_SHA=m.digest(m.MANIFEST.read_bytes());m.LEDGER=m.ROOT/'control.jsonl'
    source=pathlib.Path(__file__).with_name('calendar-native-mail.mjs').read_bytes();factory=m.ROOT/'scripts/calendar-native-mail.mjs';factory.write_bytes(source);factory.chmod(0o644)
    cfg={'phaseId':m.PHASE,'state':'READY','candidateCommit':packet['candidateCommit'],'issuedAt':packet['approvedAt'],'expiresAt':packet['approvalExpiresAt'],'limits':{'invocations':40,'messageReads':3},'approval':{'packetSHA256':m.APPROVAL_SHA,'approvedAt':packet['approvedAt'],'approvalExpiresAt':packet['approvalExpiresAt']},'helper':{'path':str(m.MAIL_PREP/'native-mail'),'sourcePath':str(m.MAIL_PREP/'native-mail.swift'),'sha256':m.digest(b'binary-fixture'),'sourceSHA256':m.digest(b'swift-fixture')},'navigation':{'sha256':''},'sources':[]}
    (m.MAIL_PREP/'native-mail').write_bytes(b'binary-fixture');(m.MAIL_PREP/'native-mail').chmod(0o700);(m.MAIL_PREP/'native-mail.swift').write_bytes(b'swift-fixture');(m.MAIL_PREP/'native-mail.swift').chmod(0o600)
    nav={'originalURL':'https://mail.google.com/mail/u/0/#inbox','searchURLs':['https://mail.google.com/mail/u/0/#search/synthetic-fixture']};m.private_write(m.MAIL_PREP/'mail-navigation.json',nav);cfg['navigation']['sha256']=m.digest((m.MAIL_PREP/'mail-navigation.json').read_bytes())
    for name,kind in [('account-meta','metadata'),('owner-rows','metadata'),('owner-open','action'),('owner-message-meta','metadata'),('owner-extract','message'),('owner-return','action')]:
        path=m.MAIL_PREP/'mail-js'/f'{name}.js';path.write_text(name);path.chmod(0o600);cfg['sources'].append({'path':str(path),'sha256':m.digest(path.read_bytes()),'type':kind})
    m.private_write(m.MAIL_PREP/'mail-sources.json',cfg)
    binding={'version':1,'state':'READY','phaseId':m.PHASE,'packetSHA256':m.APPROVAL_SHA,'candidateCommit':packet['candidateCommit'],'approvedAt':packet['approvedAt'],'approvalExpiresAt':packet['approvalExpiresAt'],'factorySHA256':m.digest(source),'configSHA256':m.digest((m.MAIL_PREP/'mail-sources.json').read_bytes())};m.private_write(m.MAIL_PRIVATE/'mail-execution-binding.json',binding);m.MAIL_BINDING_SHA=m.digest((m.MAIL_PRIVATE/'mail-execution-binding.json').read_bytes())
    def state():return {'phase':m.PHASE,'limits':{'requests':48,'mutations':16,'builds':2},'requests':17,'mutations':3,'builds':1,'rows':[],'nativeBindingSHA256':m.MAIL_BINDING_SHA,'nativeRevision':0,'native':m.fresh_native()}
    def reset():
        m.LEDGER.unlink(missing_ok=True);m.private_write(m.LEDGER,state(),True)
    def reservation(s,kind='metadata',restore=False):
        n=copy.deepcopy(s['native']);n['invocations']+=1;n['messageReads']+=int(kind=='message');n['unknown']=True;n['restoreAttempted']|=restore
        source=next((x for x in cfg['sources']if x['type']==kind),None)
        n['rows'].append({'id':n['invocations'],'mode':'url'if kind=='navigation'else'private'if kind=='message'else'read','type':kind,'sourceSHA256':source['sha256']if source else None,'configurationSHA256':binding['configSHA256'],'navigationSHA256':cfg['navigation']['sha256'],'restore':restore,'state':'reserved_unknown','at':m.iso()})
        return {'expectedRevision':s['nativeRevision'],'native':n}
    def reserve(kind='metadata',restore=False):
        with m.locked()as(s,append):m.native_save(s,append,reservation(s,kind,restore))
    def dispatch(s):
        r=s['native']['rows'][-1];arg=nav['originalURL']if r['restore']else next(x['path']for x in cfg['sources']if x['sha256']==r['sourceSHA256'])
        return {'expectedRevision':s['nativeRevision'],'invocationId':r['id'],'mode':r['mode'],'argument':arg}
    def binding_cases():
        assert m.mail_binding()[0]==binding
        raw=(m.MAIL_PRIVATE/'mail-execution-binding.json').read_bytes();(m.MAIL_PRIVATE/'mail-execution-binding.json').write_text('{}')
        rejects(m.mail_binding);(m.MAIL_PRIVATE/'mail-execution-binding.json').write_bytes(raw)
    check('Fresh packet/private binding source digest and custody are authoritative',binding_cases)
    def reserve_first():
        reset();reserve();s=m.last(m.LEDGER);assert s['native']['invocations']==1 and s['native']['unknown'] and s['nativeRevision']==1
        assert(s['requests'],s['mutations'],s['builds'])==(17,3,1)
    check('Native reservation is durably in SAME supplemental journal without HTTP spend',reserve_first)
    def stale_and_reset():
        reset();s=state();body=reservation(s);reserve()
        with m.locked()as(s,append):
            rejects(lambda:m.native_save(s,append,body));bad={'expectedRevision':s['nativeRevision'],'native':m.fresh_native()};rejects(lambda:m.native_save(s,append,bad))
        assert m.last(m.LEDGER)['native']['invocations']==1
    check('Stale CAS and native-counter resets cannot overwrite admitted work',stale_and_reset)
    def terminal_unknown():
        reset();reserve()
        with m.locked()as(s,append):
            n=copy.deepcopy(s['native']);n['rows'][-1].update(state='unknown',reason='native_mail_authority_changed',completedAt=m.iso());m.native_save(s,append,{'expectedRevision':s['nativeRevision'],'native':n})
            rearm=copy.deepcopy(s['native']);rearm['rows'][-1]['state']='reserved_unknown'
            rejects(lambda:m.native_save(s,append,{'expectedRevision':s['nativeRevision'],'native':rearm}))
            rejects(lambda:m.native_dispatch(s,append,dispatch(s)))
        assert m.last(m.LEDGER)['native']['rows'][-1]['state']=='unknown'
    check('Terminal pre-dispatch unknown cannot be rearmed through direct journal commands',terminal_unknown)
    def contention():
        reset();body=reservation(state());out=[]
        def worker():
            try:
                with m.locked()as(s,append):m.native_save(s,append,copy.deepcopy(body));out.append(True)
            except RuntimeError:out.append(False)
        threads=[threading.Thread(target=worker)for _ in range(5)]
        for t in threads:t.start()
        for t in threads:t.join()
        assert out.count(True)==1 and m.last(m.LEDGER)['native']['invocations']==1
    check('Five actual flock contenders admit exactly one same-revision reservation',contention)
    def child_and_duplicate():
        reset();reserve();calls=[]
        class Result:returncode=0;stdout='{"accountMatch":true}'
        def child(args,**kw):
            saved=m.last(m.LEDGER);assert saved['native']['rows'][-1]['dispatchState']=='reserved_unknown';assert saved['native']['unknown'];calls.append(args);return Result()
        m.subprocess.run=child
        with m.locked()as(s,append):
            first=dispatch(s);result=m.native_dispatch(s,append,first);assert json.loads(result['stdout'])=={'accountMatch':True};rejects(lambda:m.native_dispatch(s,append,first));rejects(lambda:m.native_dispatch(s,append,dispatch(s)))
            n=copy.deepcopy(s['native']);n['rows'][-1].update(state='observed',completedAt=m.iso());n['unknown']=False;m.native_save(s,append,{'expectedRevision':s['nativeRevision'],'native':n})
        assert len(calls)==1 and m.last(m.LEDGER)['native']['unknown']is False
    check('Child runs only after fsynced dispatch marker; same row never redispatches',child_and_duplicate)
    def unknown_cleanup():
        reset();reserve();calls=[]
        def child(*a,**k):calls.append(True);raise TimeoutError('synthetic native timeout')
        m.subprocess.run=child
        with m.locked()as(s,append):rejects(lambda:m.native_dispatch(s,append,dispatch(s)))
        with m.locked()as(s,append):rejects(lambda:m.native_save(s,append,reservation(s)))
        reserve('navigation',True);s=m.last(m.LEDGER);assert s['native']['restoreAttempted']and s['native']['unknown']and len(calls)==1
    check('Unknown child stays charged/cleanup-only; exact conditional restore can reserve',unknown_cleanup)
    def final_save_loss():
        reset();reserve();calls=[]
        class Result:returncode=0;stdout='{"accountMatch":true}'
        m.subprocess.run=lambda*a,**k:(calls.append(True)or Result())
        with m.locked()as(s,append):
            count=0
            def lost_ack():
                nonlocal count
                append();count+=1
                if count==2:raise OSError('synthetic lost final durable acknowledgement')
            rejects(lambda:m.native_dispatch(s,lost_ack,dispatch(s)))
        assert len(calls)==1 and m.last(m.LEDGER)['native']['unknown']
        with m.locked()as(s,append):rejects(lambda:m.native_dispatch(s,append,dispatch(s)))
    check('Lost final native receipt never authorizes another dispatch',final_save_loss)
    def cap():
        reset();s=state();n=s['native']
        for i in range(39):n['rows'].append({'id':i+1,'mode':'read','type':'metadata','sourceSHA256':cfg['sources'][0]['sha256'],'configurationSHA256':binding['configSHA256'],'navigationSHA256':cfg['navigation']['sha256'],'restore':False,'state':'observed','dispatchState':'observed','at':m.iso()})
        n['invocations']=39;m.private_write(m.LEDGER,s)
        with m.locked()as(s,append):rejects(lambda:m.native_save(s,append,reservation(s)))
        reserve('navigation',True);assert m.last(m.LEDGER)['native']['invocations']==40
    check('Invocation39 preserves sole restore reserve; max40 cannot reset',cap)
    def expiry():
        reset();reserve();calls=[];m.subprocess.run=lambda*a,**k:calls.append(True)
        original=m.mail_binding;reads=0
        def late():
            nonlocal reads
            value=original();reads+=1
            if reads==2:current[0]=dt.datetime(2026,10,25,2,tzinfo=dt.timezone.utc)
            return value
        m.mail_binding=late
        try:
            with m.locked()as(s,append):rejects(lambda:m.native_dispatch(s,append,dispatch(s)))
            assert len(calls)==0 and m.last(m.LEDGER)['native']['unknown']
        finally:m.mail_binding=original;current[0]=dt.datetime(2026,10,25,0,1,tzinfo=dt.timezone.utc)
    check('Deadline crossing after dispatch reservation blocks child and retains uncertainty',expiry)
    def final_source_fence():
        for selected in [m.MAIL_PREP/'native-mail',pathlib.Path(cfg['sources'][0]['path'])]:
            reset();reserve();calls=[]
            class Result:returncode=0;stdout='{"accountMatch":true}'
            m.subprocess.run=lambda*a,**k:(calls.append(True)or Result())
            original=selected.read_bytes()
            try:
                with m.locked()as(s,append):
                    def withdrawn_append():
                        append()
                        if s['native']['rows'][-1].get('dispatchState')=='reserved_unknown':selected.write_bytes(b'synthetic withdrawn source')
                    rejects(lambda:m.native_dispatch(s,withdrawn_append,dispatch(s)))
                assert len(calls)==0 and m.last(m.LEDGER)['native']['unknown']
            finally:selected.write_bytes(original)
    check('Binary and selected JS withdrawal after durable dispatch marker stop the child',final_source_fence)
print(json.dumps({'passed':len(checks),'total':len(checks),'checks':checks,'physicalNetworkRequests':0,'nativeChildren':0},indent=2))
