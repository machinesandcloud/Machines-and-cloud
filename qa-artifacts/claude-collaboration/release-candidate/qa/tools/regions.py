import sys,re,difflib
# For each conflict region in a "git diff RC -- conflicted-worktree" file, show token diffs RC vs ours and RC vs theirs.
def toks(s): return re.findall(r"\w+|[^\w\s]|\s+",s)
def wd(a,b):
    A,B=toks(a),toks(b); out=[]
    for op,i1,i2,j1,j2 in difflib.SequenceMatcher(None,A,B,autojunk=False).get_opcodes():
        if op=='equal': continue
        out.append(f"   {op}: RC[{''.join(A[i1:i2])[:300]!r}] -> X[{''.join(B[j1:j2])[:300]!r}]")
    return out or ["   (identical)"]
for path in sys.argv[1:]:
    cur=None
    for hunk in re.split(r'(?m)^(?=diff --git|@@)',open(path).read()):
        if hunk.startswith('diff --git'): cur=hunk.split()[2][2:]; continue
        if not hunk.startswith('@@') or '<<<<<<<' not in hunk: 
            if hunk.startswith('@@'):
                print(f"== {cur} NON-CONFLICT hunk differing from RC:"); print(hunk[:3000])
            continue
        lines=hunk.split('\n')[1:]
        rc=[l[1:] for l in lines if l.startswith('-')]
        # build regions
        mode=None; ours=[]; theirs=[]
        for l in lines:
            if l.startswith('+<<<<<<<'): mode='o'; continue
            if l.startswith('+======='): mode='t'; continue
            if l.startswith('+>>>>>>>'): mode=None; continue
            if mode=='o' and l[:1] in '+ ': ours.append(l[1:])
            if mode=='t' and l[:1] in '+ ': theirs.append(l[1:])
        # RC region = context lines inside markers + '-' lines
        rcr=[]; mode=None
        for l in lines:
            if l.startswith('+<<<<<<<'): mode='o'; continue
            if l.startswith('+>>>>>>>'): mode=None; continue
            if mode and l.startswith(' ') : pass
        R='\n'.join(rc); O='\n'.join(ours); T='\n'.join(theirs)
        print(f"== {cur} conflict region ({len(rc)} RC '-' lines; ours {len(ours)}, theirs {len(theirs)} lines; context lines inside markers are common)")
        print("  RC vs OURS:"); print('\n'.join(wd(R,O)))
        print("  RC vs THEIRS:"); print('\n'.join(wd(R,T)))
