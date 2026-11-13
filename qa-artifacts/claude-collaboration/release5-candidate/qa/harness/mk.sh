#!/bin/bash
# mk.sh <dir>: fresh git-archive HEAD copy, node_modules symlinked to p10/nm
D=$1; rm -rf $D; mkdir -p $D
git -C /tmp/mc-claude-release5-candidate-20261113 archive f9c01e6cd | tar -x -C $D
ln -s /private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/p10/nm $D/node_modules; mkdir -p $D/scratchpad
