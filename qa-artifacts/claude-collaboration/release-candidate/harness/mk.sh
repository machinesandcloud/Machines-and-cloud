#!/bin/bash
# mk.sh <name> <commit> [patch ...]: throwaway copy at commit, then git apply (-3 via temp repo) each patch
RC=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/rc
n=$1; c=$2; shift 2; rm -rf $RC/$n; mkdir -p $RC/$n; git -C /tmp/mc-claude-release-candidate-20261112 archive $c -- . ':!qa-artifacts' ':!scratchpad' | tar -x -C $RC/$n; mkdir -p $RC/$n/scratchpad; ln -s $RC/../p10/nm $RC/$n/node_modules
cd $RC/$n && git init -q && git -c user.name=rc -c user.email=rc@local add -A >/dev/null && git -c user.name=rc -c user.email=rc@local -c commit.gpgsign=false commit -qm base
for p in "$@"; do git apply "$p" || { echo "FAILED $p"; exit 1; }; done; echo "built $n at $c + $#"
