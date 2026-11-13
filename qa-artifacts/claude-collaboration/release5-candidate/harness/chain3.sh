#!/bin/bash
H=$(dirname $0); S=$(dirname $(dirname $H)); R=$S/r5
# p2 amend touched only two UI-check files: rerun request-automation on the amended commit
C=$R/r5-p2-copy-ui2; O=$R/out/p2-copy/rerun; mkdir -p $O; : > $O/SUMMARY.tsv; $H/mk.sh r5-p2-copy-ui2 1160024a7 qa > $O/mk.log 2>&1
PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs; export EXTRA_ENV="MC_PLAYWRIGHT_MODULE=$PW"
rc=$($H/run1.sh $C $O/request-automation.log node scripts/request-automation-ui-check.mjs --playwright $PW --output scratchpad/ra.json); printf 'request-automation\t%s\t%s\n' $rc "$(tail -1 $O/request-automation.log | cut -c1-200)" >> $O/SUMMARY.tsv
rm -rf $C; unset EXTRA_ENV
$H/piece.sh p3-fc2 21822bb98
$H/piece.sh p4-sms 2a303ef9e
echo CHAINDONE > $R/out/CHAINDONE
