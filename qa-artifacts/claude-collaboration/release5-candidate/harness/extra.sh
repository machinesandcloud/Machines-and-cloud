#!/bin/bash
# extra.sh <copy> <outdir>: copy-clarity shots check, FC2 Spanish node+ui checks, sms-followups check (when present), sitecheck
H=$(dirname $0); C=$1; O=$2; mkdir -p $O; : > $O/SUMMARY.tsv; QA=qa-artifacts/claude-collaboration
PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
export EXTRA_ENV="MC_PLAYWRIGHT_MODULE=$PW"
r(){ n=$1; shift; rc=$($H/run1.sh $C $O/$n.log "$@"); printf '%s\t%s\t%s\n' "$n" "$rc" "$(grep -v '^\s*$' $O/$n.log | tail -1 | cut -c1-220)" >> $O/SUMMARY.tsv; }
[ -f $C/$QA/copy-clarity-fix/copy-shots-check.mjs ] && r copy-shots node $QA/copy-clarity-fix/copy-shots-check.mjs --playwright $PW --out $O/copy-shots --label r5
[ -f $C/$QA/fc2-spanish/fc2-spanish-check.mjs ] && r fc2-spanish node $QA/fc2-spanish/fc2-spanish-check.mjs
[ -f $C/$QA/fc2-spanish/fc2-spanish-ui-check.mjs ] && r fc2-spanish-ui node $QA/fc2-spanish/fc2-spanish-ui-check.mjs --playwright $PW --out $O/fc2-ui
r sitecheck python3 -I scripts/sitecheck.py .
echo DONE >> $O/SUMMARY.tsv
