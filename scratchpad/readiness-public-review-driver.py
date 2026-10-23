from pathlib import Path
import json,datetime,urllib.request,urllib.error,hashlib
root=Path('/tmp/mc-production-readiness-47e');out=root/'scratchpad/readiness-public-captured';out.mkdir(exist_ok=True)
ledger=root/'scratchpad/readiness-public-review-reads.jsonl';result=root/'scratchpad/readiness-public-review.json'
assert not ledger.exists()and not result.exists()
paths=['/','/onboard','/desk','/admin','/api/health','/onboard.js','/desk.js','/admin.js','/signup-intake.js','/script.js','/hero-photos.js','/agent-widget.js','/stories.js','/desk-connections.js','/desk-billing.js','/desk-requests.js','/product-ui.css','/embed.js']
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect());rows=[]
for i,path in enumerate(paths):
 assert len(rows)<18
 row={'number':i+1,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'GET','path':path,'state':'reserved_unknown'};rows.append(row);ledger.write_text(''.join(json.dumps(r)+'\n'for r in rows))
 try:
  try:r=opener.open(urllib.request.Request('https://machinesandcloud.com'+path,headers={'User-Agent':'MachinesAndCloud-Owner-Requested-Readiness-Review/1.0'}),timeout=25);body=r.read();status=r.status
  except urllib.error.HTTPError as e:body=e.read();status=e.code
  relative='index.html'if path=='/'else path.lstrip('/');relative=relative+'.html'if path in ['/onboard','/desk','/admin']else relative
  capture=out/relative;capture.parent.mkdir(parents=True,exist_ok=True);capture.write_bytes(body)
  row.update(state='observed',status=status,bytes=len(body),sha256=hashlib.sha256(body).hexdigest(),capture=str(capture.relative_to(root)))
  if (root/relative).is_file():row['exactSourceBytes']=(root/relative).read_bytes()==body
  if path=='/api/health':row['snapshot']=json.loads(body)
 except Exception as e:row['error']=type(e).__name__;raise
 finally:ledger.write_text(''.join(json.dumps(r)+'\n'for r in rows))
 print(json.dumps({k:row[k]for k in ['path','status','bytes','exactSourceBytes']if k in row}),flush=True)
result.write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Fresh user-requested public-only production readiness review; maximum18GETs; no authenticated/session/email/provider/model/charge/deploy effects','publishedSource':'47e3c64163d20166970b6d309fbf6045a9de33b2','reviewCheckoutBase':'83aea6542e8e557663d948f1d28af6850b5e664d','requests':rows,'requestsUsed':len(rows),'maximumRequests':18,'limits':'Anonymous public access/assets and captured offline rendering only; no completed signup/private customer/provider workflow proved.'},indent=2)+'\n')
