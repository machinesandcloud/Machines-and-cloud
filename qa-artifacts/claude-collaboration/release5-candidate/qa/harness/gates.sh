#!/bin/bash
H=$(cd "$(dirname "$0")" && pwd); R=$(dirname $H)
$H/mk.sh $R/gate; $H/gate.sh $R/gate $R/out/gate; rm -rf $R/gate
$H/mk.sh $R/gatefan; EXTRA_ENV="NODE_OPTIONS=--import=$H/fakehour.mjs MC_QA_FAKE_START=2026-11-14T00:05:00Z" $H/gate.sh $R/gatefan $R/out/gate-fanout18; rm -rf $R/gatefan
echo ALL > $R/out/GATES-DONE
