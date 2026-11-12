#!/bin/bash
# gate.sh <copy> <outdir>: every && command of netlify.toml's build line, each in a fresh sandboxed process
Q=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/qarc
C=$1; O=$2; mkdir -p $O; : > $O/SUMMARY.tsv; i=0
while read -r cmd; do i=$((i+1)); n=$(printf '%02d-%s' $i "$(echo $cmd | awk '{print $2}' | xargs basename | sed 's/\.mjs$//')"); t0=$(date +%s)
  rc=$($Q/tools/run1.sh $C $O/$n.log $cmd); printf '%s\t%s\t%ss\t%s\n' "$n" "$rc" "$(( $(date +%s)-t0 ))" "$(grep -v '^\s*$' $O/$n.log | tail -1 | cut -c1-160)" >> $O/SUMMARY.tsv
done < $Q/tools/gate-cmds.txt
echo DONE >> $O/SUMMARY.tsv
