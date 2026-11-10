#!/bin/bash
# usage: regress-runner.sh <scratch> <outdir> script.mjs...
S=$1; O=$2; shift 2; mkdir -p $O; : > $O/SUMMARY.tsv
for f in "$@"; do row="$f"; for t in base copy; do
  extra=""; [ "$f" = self-service-ai-proof-check.mjs ] && extra="$O/${f%.mjs}.$t.proof.json"
  (cd $S/qa08-$t && env -i PATH="$PATH" HOME="$HOME" MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 perl -e 'alarm 240; exec @ARGV' node --import $S/qa08-tools/block-egress.mjs scripts/$f $extra > $O/${f%.mjs}.$t.log 2>&1); row="$row	$t=$?"; done; echo "$row" >> $O/SUMMARY.tsv; done
cat $O/SUMMARY.tsv
