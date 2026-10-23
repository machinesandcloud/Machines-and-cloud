import pathlib, json, hashlib, subprocess
from html.parser import HTMLParser

root = pathlib.Path('/tmp/mc-production-readiness-47e')
baseline = '47e3c64163d20166970b6d309fbf6045a9de33b2'
paths = json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {HOSTED_ONBOARDING_ASSETS as a} from './scripts/hosted-onboarding-guard.mjs';process.stdout.write(JSON.stringify(a))"],cwd=root,text=True))
sha = lambda b: hashlib.sha256(b).hexdigest()

class Tags(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.tags=[]; self.lines=text.splitlines(keepends=True); self.text=text
        self.offsets=[0]
        for line in self.lines: self.offsets.append(self.offsets[-1]+len(line))
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        line,column=self.getpos(); raw=self.get_starttag_text()
        self.tags.append((tag,self.offsets[line-1]+column,raw))
    handle_startendtag=handle_starttag

def replay(text, replacements):
    # Only replace actual parsed start tags; never embedded JS/text substrings.
    tags=Tags(text).tags
    for tag,at,raw in reversed(tags):
        if raw in replacements: text=text[:at]+replacements[raw]+text[at+len(raw):]
    return text

maps={}; evidence=[]
for name in ['index.html','onboard.html','desk.html','admin.html']:
    original=subprocess.check_output(['git','show',baseline+':'+name],cwd=root).decode()
    captured=(root/'scratchpad/readiness-public-captured'/name).read_text()
    a,b=Tags(original).tags,Tags(captured).tags
    assert len(a)==len(b), name
    replacements={}
    for (tag,_,raw),(other,_,compiled) in zip(a,b):
        assert tag==other,(name,tag,other)
        if raw!=compiled:
            assert tag in ['a','form'],(name,tag)
            assert raw not in replacements or replacements[raw]==compiled
            replacements[raw]=compiled
    assert replay(original,replacements)==captured, name
    current=(root/'dist'/name).read_text()
    predicted=replay(current,replacements).encode()
    maps[name]={'baseline':sha(captured.encode()),'release':[sha(current.encode()),sha(predicted)]}
    evidence.append({'file':name,'baselineSourceSHA256':sha(original.encode()),'capturedBaselineSHA256':sha(captured.encode()),'baselineReplayedByteExact':True,'changedStartTags':len(replacements),'transformations':replacements,'predictedReleaseSHA256':sha(predicted),'currentStaticSourceSHA256':sha(current.encode())})

signupAssets={}; assets={}
for path in paths:
    file=path.lstrip('/')
    if file in ['','index','index.html']: file='index.html'
    if file in ['onboard','desk','admin']: file+='.html'
    if file.endswith('.html'):
        signupAssets[path]=maps[file]['baseline']; assets[path]=list(dict.fromkeys(maps[file]['release']))
    else:
        signupAssets[path]=sha(subprocess.check_output(['git','show',baseline+':'+file],cwd=root))
        assets[path]=sha((root/'dist'/file).read_bytes())
report={'baselineCommit':baseline,'stage':'Prepared exact expected byte maps; no current public fetch or deployment. Future hosted differences reject, not silently normalize.','signupAssets':signupAssets,'assets':assets,'htmlReplayEvidence':evidence,'externalRequests':0,'proof':'Only exact previously observed a/form start-tag replacements replayed onto final local static HTML. Entire original baseline replay must match its actual captured served bytes.'}
(root/'scratchpad/zaricoach-reviewed-assets.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'pass':True,'assetsPerStage':len(paths),'exactBaselineReplays':len(evidence),'externalRequests':0}))
