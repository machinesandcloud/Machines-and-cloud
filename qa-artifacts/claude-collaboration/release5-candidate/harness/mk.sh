#!/bin/bash
# mk.sh <name> <commit-ish> [qa]: throwaway git-archive copy, node_modules -> p10/nm. Without "qa": no qa-artifacts/scratchpad (gate copy, as release 4).
# With "qa": qa-artifacts included except images/receipts-only bulk (browser copy: checks live under qa-artifacts).
S=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad
n=$1; c=$2; D=$S/r5/$n; rm -rf $D; mkdir -p $D
if [ "$3" = qa ]; then git -C /tmp/mc-claude-release5-candidate-20261113 archive $c -- . ':!scratchpad' ':!qa-artifacts/**/*.png' ':!qa-artifacts/**/*.jpg' ':!qa-artifacts/**/*.webm' | tar -x -C $D; else git -C /tmp/mc-claude-release5-candidate-20261113 archive $c -- . ':!qa-artifacts' ':!scratchpad' | tar -x -C $D; fi
mkdir -p $D/scratchpad $D/qa-artifacts/claude-collaboration; ln -s $S/p10/nm $D/node_modules
cd $D && git init -q && git -c user.name=r5 -c user.email=r5@local add -A >/dev/null && git -c user.name=r5 -c user.email=r5@local -c commit.gpgsign=false commit -qm "copy of $c"; echo "built $D at $c"
