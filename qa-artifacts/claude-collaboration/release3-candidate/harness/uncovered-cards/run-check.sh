#!/bin/sh
# Usage: run-check.sh <tree> <script> [args...]  -- offline: env -i, memory store, fake model, deny-remote sandbox.
T="$1"; shift; S="$1"; shift
cd "$T" && exec sandbox-exec -f "$(dirname "$0")/deny-remote.sb" env -i PATH=$(dirname $(command -v node)):/usr/bin:/bin HOME="$HOME" MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 MC_LOCAL_NO_KEYS=1 node "$S" "$@"
