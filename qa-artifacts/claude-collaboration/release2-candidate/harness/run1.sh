#!/bin/bash
C=$1; L=$2; shift 2
NODEDIR=$(dirname $(command -v node))
( cd "$C" && env -i PATH="$NODEDIR:/usr/bin:/bin:/usr/sbin:/sbin" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 MC_LOCAL_NO_KEYS=1 ${EXTRA_ENV} sandbox-exec -f /private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/rc2/harness/deny-net.sb perl -e 'alarm shift; exec @ARGV' 900 "$@" ) > "$L" 2>&1
echo $?
