#!/bin/bash
# piece.sh <label> <commit> [stages]: stages gate,shots,browser,extra (default all). Gate on r5-<label>-gate (no qa-artifacts, as release 4);
# browser stages on r5-<label>-ui (with qa-artifacts). Offline throughout; copies deleted after each run.
H=$(dirname $0); S=$(dirname $(dirname $H)); L=$1; ST=${3:-gate,shots,browser,extra}; O=$S/r5/out/$L; mkdir -p $O
if [[ $ST == *gate* ]]; then C=$S/r5/r5-$L-gate; $H/mk.sh r5-$L-gate $2 > $O/mk-gate.log 2>&1; $H/gate.sh $C $O/gate; rm -rf $C; fi
C=$S/r5/r5-$L-ui
if [[ $ST == *shots* || $ST == *browser* || $ST == *extra* ]]; then $H/mk.sh r5-$L-ui $2 qa > $O/mk-ui.log 2>&1; fi
[[ $ST == *shots* ]] && $H/run-shots.sh $C 8871 8872 $O/shots > $O/layout-tail.log 2>&1
[[ $ST == *browser* ]] && $H/browser2.sh $C $O/browser
[[ $ST == *extra* ]] && $H/extra.sh $C $O/extra
rm -rf $C; echo ALLDONE > $O/ALLDONE-$ST
