#!/bin/bash
# usage: bp2-regress.sh <copy dir> <out dir>   (runs the non-browser scripts, offline, empty env)
copy="$1"; out="$2"; SP=/private/tmp/claude-501/-Users-stevengoumnai/bb2b640e-7b18-457e-a6a2-5f7dc74f6ad1/scratchpad
mkdir -p "$out" "$copy/scratchpad"; : > "$out/SUMMARY.tsv"
while read -r s; do
  [ -z "$s" ] && continue
  n="${s%.mjs}"; o="scratchpad/${n}-bp2rg.json"
  case "$n" in portal-revamp-ui-qa-check) o="scratchpad/portal-revamp-qa-bp2rg.json";; esac
  rm -f "$copy/$o"
  if [ "$n" = readiness-email-admission-qa-check ]; then args=("$o"); else args=(--output "$o"); fi
  start=$(date +%s)
  ( cd "$copy" && env -i PATH="$PATH" HOME="$HOME" NODE_OPTIONS="--import=file://$SP/block-egress.mjs" perl -e 'alarm shift; exec @ARGV' 300 node "scripts/$s" "${args[@]}" ) > "$out/$n.log" 2>&1
  code=$?
  [ -f "$copy/$o" ] && cp "$copy/$o" "$out/$n.json"
  printf '%s\t%s\t%ss\n' "$s" "$code" "$(( $(date +%s) - start ))" >> "$out/SUMMARY.tsv"
done < "$SP/regress-nobrowser.txt"
