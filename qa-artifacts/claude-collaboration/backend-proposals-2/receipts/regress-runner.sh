#!/bin/bash
# usage: regress-runner.sh <copy dir> <out dir> <script list> <egress preload>
# Runs each non-browser script in scripts/ from the copy root, offline, under env -i, 300 s alarm.
copy="$1"; out="$2"; list="$3"; egress="$4"
mkdir -p "$out" "$copy/scratchpad"; : > "$out/SUMMARY.tsv"
# launch-webhook-isolation-qa-check reads this tracked fixture from scratchpad/ (excluded from the copy).
[ -n "$SRC_SCRATCH" ] && cp "$SRC_SCRATCH/launch-webhook-isolation-source-bridge.json" "$copy/scratchpad/"
while read -r s; do
  [ -z "$s" ] && continue
  n="${s%.mjs}"; o="scratchpad/${n}-bp08rg.json"
  case "$n" in portal-revamp-ui-qa-check) o="scratchpad/portal-revamp-qa-bp08rg.json";; esac
  rm -f "$copy/$o"
  case "$n" in readiness-email-admission-qa-check|managed-email-budget-check|self-service-ai-proof-check|managed-delivery-proof-check) args=("$o");; *) args=(--output "$o");; esac
  # Browser scripts: PLAYWRIGHT=<path to playwright/index.mjs> adds --playwright.
  [ -n "$PLAYWRIGHT" ] && args+=(--playwright "$PLAYWRIGHT")
  start=$(date +%s)
  ( cd "$copy" && env -i PATH="$PATH" HOME="$HOME" NODE_OPTIONS="--import=file://$egress" perl -e 'alarm shift; exec @ARGV' 300 node "scripts/$s" "${args[@]}" ) > "$out/$n.log" 2>&1
  code=$?
  printf '%s\t%s\t%ss\n' "$s" "$code" "$(( $(date +%s) - start ))" >> "$out/SUMMARY.tsv"
done < "$list"
