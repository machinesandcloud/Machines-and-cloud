#!/bin/bash
# gate.sh <copy> <outdir>: every node scripts/*.mjs in the copy's netlify.toml build line, one fresh offline process each
H=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/rc2/harness
C=$1; O=$2; mkdir -p $O; : > $O/SUMMARY.tsv
grep '^ *command' $C/netlify.toml | grep -o 'node scripts/[a-z0-9-]*\.mjs' | awk '{print $2}' | while read s; do
  n=$(basename $s .mjs); t0=$(date +%s); rc=$($H/run1.sh $C $O/$n.log node $s)
  printf '%s\t%s\t%ss\n' "$n" "$rc" "$(( $(date +%s)-t0 ))" >> $O/SUMMARY.tsv
done; echo DONE >> $O/SUMMARY.tsv
