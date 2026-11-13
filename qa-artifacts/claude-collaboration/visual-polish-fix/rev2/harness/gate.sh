#!/bin/bash
# gate.sh <copy> <outdir>: every node scripts/*.mjs on the copy's netlify.toml build line, one fresh offline process each
H=$(dirname $0); C=$1; O=$2; mkdir -p $O; : > $O/SUMMARY.tsv
grep '^ *command' $C/netlify.toml | grep -o 'node scripts/[a-z0-9-]*\.mjs' | awk '{print $2}' | while read s; do
  n=$(basename $s .mjs); t0=$(date +%s); rc=$($H/run1.sh $C $O/$n.log node $s)
  printf '%s\t%s\t%ss\n' "$n" "$rc" "$(( $(date +%s)-t0 ))" >> $O/SUMMARY.tsv
done; echo DONE >> $O/SUMMARY.tsv
