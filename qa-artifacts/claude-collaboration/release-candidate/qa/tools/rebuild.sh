#!/bin/bash
# Independent rebuild of the RC from a54c5874 using the documented patches, step by step.
Q=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/qarc
WT=/tmp/mc-claude-release-candidate-20261112
R=$Q/rebuild; O=$Q/rebuild-out; rm -rf $R $O; mkdir -p $R $O
git -C $WT archive a54c5874 -- . ':!qa-artifacts' ':!scratchpad' | tar -x -C $R
git -C $WT archive a54c5874 -- qa-artifacts/claude-collaboration/connector-pages-ui-check.mjs | tar -x -C $R
cd $R; git init -q; echo /Users/stevengoumnai/Desktop/Repositories/machines-and-cloud/.git/objects > .git/objects/info/alternates
git read-tree a54c5874; git rm -r -q --cached qa-artifacts scratchpad >/dev/null 2>&1; git add qa-artifacts/claude-collaboration/connector-pages-ui-check.mjs; git update-index -q --refresh >/dev/null
G="git -c user.name=qa -c user.email=qa@local -c commit.gpgsign=false"
$G commit -qm base --allow-empty
prev=a54c5874; i=0
while IFS=$'\t' read -r rc mode patches; do
  i=$((i+1)); log=$O/$(printf %02d $i)-$rc.log; : > $log
  for p in $patches; do
    if [[ $p == WIDGETCHAIN ]]; then git -C $WT diff 0f412212 fbe08789 -- embed.js > $O/widget-chain.patch; p=$O/widget-chain.patch; fi
    echo "PATCH $p $(shasum -a 256 $p|cut -c1-16)" >> $log
    if git apply --index "$p" >> $log 2>&1; then echo "  plain: ok" >> $log
    else echo "  plain: FAILED -> trying -3" >> $log
      git apply --index -3 "$p" >> $log 2>&1; echo "  -3 rc=$?" >> $log; fi
  done
  paths=$( (git -C $WT diff --name-only $prev $rc; git diff --name-only HEAD; git ls-files -o --exclude-standard) | sort -u)
  git diff --no-color $rc -- $paths > $O/$(printf %02d $i)-$rc.vsrc.diff 2>>$log
  # also untracked new files not added
  n=$(grep -c '^diff --git' $O/$(printf %02d $i)-$rc.vsrc.diff)
  printf '%02d\t%s\t%s\tfiles_differing_from_RC=%s\n' $i $rc "$(grep -c FAILED $log) plain-fail" $n >> $O/SUMMARY.tsv
  # adopt RC result for those paths (to continue the chain), record
  for f in $paths; do if git -C $WT cat-file -e $rc:$f 2>/dev/null; then git checkout -q $rc -- "$f"; else git rm -q -f --ignore-unmatch "$f"; rm -f "$f"; fi; done
  git add -A >/dev/null 2>&1; $G commit -qm "$rc" --allow-empty
  prev=$rc
done < $Q/tools/steps.tsv
git diff --stat ac10dc85 -- . ':!qa-artifacts' ':!scratchpad' > $O/final-vs-ac10.txt; git diff --stat ac10dc85 -- qa-artifacts/claude-collaboration/connector-pages-ui-check.mjs >> $O/final-vs-ac10.txt
echo done
