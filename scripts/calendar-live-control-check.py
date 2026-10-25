#!/usr/bin/env python3
"""Offline control-adapter checks. No credentials, subprocesses or sockets."""
import contextlib, datetime as dt, importlib.util, io, json, pathlib, socket, tempfile

def deny(*args,**kwargs): raise AssertionError('Physical effects denied')
socket.create_connection=deny
socket.socket.connect=deny
spec=importlib.util.spec_from_file_location('calendar_control',pathlib.Path(__file__).with_name('calendar-live-control.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.subprocess.run=m.subprocess.check_output=deny
checks=[]
def check(name,fn): fn();checks.append(name)
def rejects(fn):
    try: fn()
    except (RuntimeError,AssertionError): return
    raise AssertionError('Expected refusal')
with tempfile.TemporaryDirectory(prefix='mc-calendar-control-offline-') as directory:
    m.PRIVATE=pathlib.Path(directory);m.PHASE='core-calendar-offline-no-authority';m.LEDGER=m.PRIVATE/'control.jsonl'
    m.fresh=lambda: {'offline':True}
    def fresh():
        return {'phase':m.PHASE,'limits':{'requests':48,'mutations':16,'builds':2},'requests':0,'mutations':0,'builds':0,'rows':[]}
    def append(): pass
    def reservation():
        state=fresh();row=m.reserve(state,append,'env:key','PUT','/fixture')
        assert row['state']=='reserved_unknown' and state['requests']==1 and state['mutations']==1
        rejects(lambda:m.reserve(state,append,'env:key','PUT','/fixture'))
        rejects(lambda:m.reserve(state,append,'env:other','PUT','/fixture'))
        assert state['requests']==1
    check('Reserve before effects; unknown mutations are never retried',reservation)
    def reserves():
        state=fresh();state['requests']=30
        rejects(lambda:m.reserve(state,append,'read','GET','/fixture'))
        row=m.reserve(state,append,'cleanup-read','GET','/fixture',cleanup=True)
        assert state['requests']==31 and row['physicalRequestReservation']==1
        state['requests']=48;rejects(lambda:m.reserve(state,append,'last','GET','/fixture',cleanup=True))
        state=fresh();state['builds']=1
        rejects(lambda:m.reserve(state,append,'push:mc','GIT-PUSH','fixture',build=True))
        m.reserve(state,append,'build:mc:cleanup','POST','fixture',build=True,cleanup=True)
        assert state['builds']==2
    check('Fixed48 control ceiling and18-request/one-build cleanup reserve',reserves)
    def env_preserve():
        original={'key':'CALENDAR_CONNECTION_ENABLED','scopes':['functions'],'is_secret':True,'values':[{'context':'production','value':'old'},{'context':'deploy-preview','value':'keep'}]}
        target=m.production_row(original['key'],'true',original)
        assert target['values']==[{'context':'deploy-preview','value':'keep'},{'context':'production','value':'true'}]
        assert original['values'][0]['value']=='old' and target['is_secret'] is True
        rejects(lambda:m.production_row('X','true',{'key':'X','scopes':['functions'],'values':[{'context':'all','value':'old'}]}))
        rejects(lambda:m.production_row('X','true',{'key':'X','scopes':['builds','functions'],'values':[]}))
    check('Production-only change preserves contexts and refuses unreviewed inherited/broader scopes',env_preserve)
    def files():
        path=m.PRIVATE/'exclusive.json';m.private_write(path,{'fixture':True},exclusive=True)
        assert path.stat().st_mode&0o777==0o600
        try:m.private_write(path,{},exclusive=True)
        except FileExistsError:pass
        else:raise AssertionError('Reopened immutable file')
    check('Private originals/ledger creation is exclusive0600',files)
    def actual_transport():
        state=fresh();observed=[];real_read=m.read
        def fixture_read(path):
            if pathlib.Path(path)==pathlib.Path.home()/'Library/Preferences/netlify/config.json':return {'userId':'fixture','users':{'fixture':{'auth':{'token':'SYNTHETIC-NOT-A-KEY'}}}}
            return real_read(path)
        class Response:
            status=200
            def read(self,limit):return b'{"fixture":true}'
        class Opener:
            def open(self,request,timeout):
                assert state['rows'][-1]['state']=='reserved_unknown'
                observed.append(request);return Response()
        m.read=fixture_read;original_opener=m.urllib.request.build_opener;m.urllib.request.build_opener=lambda *args:Opener()
        try:
            value=m.request(state,append,'site:mc','mc','/sites/'+m.SITES['mc']['id'])
            assert value=={'fixture':True} and state['requests']==1 and len(observed)==1
            assert state['rows'][0]['state']=='observed'
            assert 'SYNTHETIC' not in json.dumps(state)
            rejects(lambda:m.request(state,append,'bad','mc','/accounts/foreign/env?site_id=other'))
        finally:m.read=real_read;m.urllib.request.build_opener=original_opener
    check('Actual HTTP adapter reserves first; fixed site routes and redacted private receipts',actual_transport)
    def git_budget():
        state=fresh();m.SITES['mc']['candidate']='c'*40;m.now=lambda:dt.datetime(2026,10,24,tzinfo=dt.timezone.utc)
        m.subprocess.check_output=lambda args,**kw: ('c'*40+'\n') if args[1]=='rev-parse' else (m.SITES['mc']['remote']+'\n')
        class Result:
            returncode=0;stdout=m.SITES['mc'].get('gitBase',m.SITES['mc']['base'])+'\trefs/heads/main\n';stderr=''
        def run(args,**kw):
            if args[1] in ['diff','merge-base']:return Result()
            assert state['requests']==6 and state['rows'][-1]['state']=='reserved_unknown'
            pathlib.Path(kw['env']['GIT_TRACE_CURL']).write_text('=> Send header: GET /fixture HTTP/1.1\n=> Send header: GET /fixture HTTP/1.1\n')
            return Result()
        m.subprocess.run=run
        out=m.git(state,append,'mc')
        assert out['reservedRequests']==6 and out['physicalHTTPRequests']==2 and state['requests']==6
        assert state['rows'][0]['unusedReservationRetained']==4
    check('Native Git trace accounting reserves six starts without refund/retry',git_budget)
print(json.dumps({'passed':len(checks),'failed':0,'checks':checks,'physicalNetworkRequests':0,'externalSubprocesses':0},indent=2))
