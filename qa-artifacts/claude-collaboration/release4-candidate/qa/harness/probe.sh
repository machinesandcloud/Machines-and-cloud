#!/bin/bash
# probe.sh <copy> <phase> <out.json>
H=$(cd "$(dirname "$0")" && pwd); C=$1; P=$2; O=$3
n=$(grep -n "^await check(" $C/scripts/managed-sms-qa-check.mjs | head -1 | cut -d: -f1)
{ sed -n "1,$((n-1))p" $C/scripts/managed-sms-qa-check.mjs | sed 's/^const outputIndex = .*$/const outputIndex = -1, output = null; const availabilityOnly = false;/' | grep -v "^const availabilityOnly"; cat $H/probe-tail.mjs; } > $C/scripts/.r4qa-probe.mjs
EXTRA_ENV="QA_PHASE=$P QA_OUT=$O" $H/run1.sh $C ${O%.json}.log node scripts/.r4qa-probe.mjs
rm -f $C/scripts/.r4qa-probe.mjs
