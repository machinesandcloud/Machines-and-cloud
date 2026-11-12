#!/bin/zsh
# usage: ap.sh "<title>" "<source commit>" [-3] patch...
set -e
RC=/tmp/mc-claude-release-candidate-20261112
title=$1; src=$2; shift 2
three=""
if [[ $1 == -3 ]]; then three=-3; shift; fi
lines=""
for p in "$@"; do
  sha=$(shasum -a 256 "$p" | cut -d' ' -f1)
  lines+="Patch: ${p}"$'\n'"sha256: ${sha}"$'\n'
  git -C $RC apply --index $three "$p"
  echo "applied $p $sha" >> $(dirname $0)/manifest.log
done
git -C $RC -c commit.gpgsign=false commit -q -m "$title" -m "Source commit: ${src}
${lines}Applied with git apply --index ${three}
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git -C $RC log --oneline -1
