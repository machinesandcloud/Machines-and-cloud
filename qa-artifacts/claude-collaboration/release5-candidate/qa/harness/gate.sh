#!/bin/bash
# gate.sh <copy> <outdir>: each node step of netlify.toml build line, fresh process; then the verbatim chain
H=$(cd "$(dirname "$0")" && pwd); C=$1; O=$2; mkdir -p $O; : > $O/SUMMARY.tsv
grep '^ *command' $C/netlify.toml | grep -o 'node scripts/[a-z0-9-]*\.mjs' | awk '{print $2}' | while read s; do
  n=$(basename $s .mjs); t0=$(date +%s); rc=$($H/run1.sh $C $O/$n.log node $s)
  printf '%s\t%s\t%ss\n' "$n" "$rc" "$(( $(date +%s)-t0 ))" >> $O/SUMMARY.tsv
done
CMD=$(grep '^ *command' $C/netlify.toml | sed 's/^ *command *= *"//; s/"$//')
rc=$($H/run1.sh $C $O/chain.log bash -c "$CMD"); echo "CHAIN_EXIT=$rc" >> $O/SUMMARY.tsv; echo DONE >> $O/SUMMARY.tsv
