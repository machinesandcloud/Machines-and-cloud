#!/bin/bash
# mk.sh <name> <commit-ish>: throwaway git-archive copy (no qa-artifacts/scratchpad), node_modules -> p10/nm (includes oauth4webapi)
S=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad
n=$1; c=$2; D=$S/r4/$n; rm -rf $D; mkdir -p $D; git -C /tmp/mc-claude-release4-candidate-20261113 archive $c -- . ':!qa-artifacts' ':!scratchpad' | tar -x -C $D; mkdir -p $D/scratchpad $D/qa-artifacts/claude-collaboration; ln -s $S/p10/nm $D/node_modules
cd $D && git init -q && git -c user.name=r4 -c user.email=r4@local add -A >/dev/null && git -c user.name=r4 -c user.email=r4@local -c commit.gpgsign=false commit -qm "copy of $c"; echo "built $D at $c"
