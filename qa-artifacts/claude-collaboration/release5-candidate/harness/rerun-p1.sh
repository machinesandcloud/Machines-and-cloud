#!/bin/bash
H=$(dirname $0); S=$(dirname $(dirname $H)); C=$S/r5/r5-p1-polish-ui2; O=$S/r5/out/p1-polish/rerun; mkdir -p $O; : > $O/SUMMARY.tsv
$H/mk.sh r5-p1-polish-ui2 e8e01b334 qa > $O/mk.log 2>&1
PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs; export EXTRA_ENV="MC_PLAYWRIGHT_MODULE=$PW"; QA=qa-artifacts/claude-collaboration
r(){ n=$1; shift; rc=$($H/run1.sh $C $O/$n.log "$@"); printf '%s\t%s\t%s\n' "$n" "$rc" "$(grep -v '^\s*$' $O/$n.log | tail -1 | cut -c1-220)" >> $O/SUMMARY.tsv; }
r onboard-validation-final node scripts/onboard-validation-qa-check.mjs --phase final --playwright $PW --output scratchpad/onboard-validation-r5p1.json
cp $C/$QA/first-customer-fix/qa/checks/qa-adversarial-check.mjs $C/$QA/first-customer-fix/checks/
r qa-adversarial node $QA/first-customer-fix/checks/qa-adversarial-check.mjs --playwright $PW --label pf --out $O/qa-adversarial
r sitecheck python3 -I scripts/sitecheck.py .
find $O -name '*.png' -delete; rm -rf $C; echo DONE >> $O/SUMMARY.tsv
