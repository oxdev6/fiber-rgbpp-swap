#!/usr/bin/env bash
# Full L3 run on testnet: fresh RGB++ issue -> leap -> unlock -> transfer -> open
# -> market -> swap -> report. Logs every stage; stops at the first failure.
set -u
cd "$(dirname "$0")/.."
LOG=localnet/e2e-run.log
mkdir -p localnet
FROM=issue
[ "${1:-}" = "--from" ] && FROM="${2:-issue}"
started=0
echo "### start $(date -u +%FT%TZ) from=$FROM" >> "$LOG"
for stage in issue leap unlock transfer whitelist open market swap report; do
  if [ "$started" = 0 ]; then
    [ "$stage" = "$FROM" ] || continue
    started=1
  fi
  echo "### stage: $stage $(date -u +%FT%TZ)" >> "$LOG"
  python3 scripts/e2e-swap.py --only "$stage" >> "$LOG" 2>&1
  rc=$?
  if [ "$rc" != "0" ]; then
    echo "### FAILED at $stage rc=$rc $(date -u +%FT%TZ)" >> "$LOG"
    exit "$rc"
  fi
done
echo "### DONE $(date -u +%FT%TZ)" >> "$LOG"
