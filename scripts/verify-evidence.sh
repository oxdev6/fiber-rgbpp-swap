#!/usr/bin/env bash
# Verify every reference in localnet/e2e-state.json against the public testnets.
# No node, no local chain, no code review: only public endpoints.
#
#   bash scripts/verify-evidence.sh [state.json]
#
# Exits non-zero if any reference is missing or unconfirmed.

set -uo pipefail
cd "$(dirname "$0")/.."

STATE=${1:-localnet/e2e-state.json}
[ -f "$STATE" ] || STATE=docs/evidence-state.json
CKB_RPC=${CKB_RPC:-https://testnet.ckb.dev/}
MEMPOOL=${MEMPOOL_API:-https://mempool.space/testnet}

[ -f "$STATE" ] || { echo "no such state file: $STATE" >&2; exit 2; }

jget() { python3 -c "import json,sys;d=json.load(open('$STATE'));print(d.get('$1',''))"; }

fail=0
row() { printf '  %-6s %-14s %-66s %s\n' "$1" "$2" "$3" "$4"; [ "$1" = "FAIL" ] && fail=$((fail+1)); return 0; }

check_ckb() {
  local label="$1" tx="$2"
  [ -n "$tx" ] || { row FAIL "$label" "(no reference)" -; return; }
  local out status block
  out=$(curl -s -m 20 -X POST "$CKB_RPC" -H 'Content-Type: application/json' \
        -d "{\"id\":1,\"jsonrpc\":\"2.0\",\"method\":\"get_transaction\",\"params\":[\"$tx\"]}" 2>/dev/null)
  status=$(printf '%s' "$out" | python3 -c "import json,sys
try: print(json.load(sys.stdin)['result']['tx_status']['status'])
except Exception: print('rpc-error')")
  block=$(printf '%s' "$out" | python3 -c "import json,sys
try: print(json.load(sys.stdin)['result']['tx_status'].get('block_number','0x0'))
except Exception: print('-')")
  if [ "$status" = "committed" ]; then
    local h=$((block)); [ "$block" = "-" ] && h="?"
    row OK "$label" "$tx" "ckb block $h  https://testnet.explorer.nervos.org/transaction/$tx"
  else
    row FAIL "$label" "$tx" "ckb status=$status"
  fi
}

check_btc() {
  local label="$1" tx="$2"
  [ -n "$tx" ] || { row FAIL "$label" "(no reference)" -; return; }
  local out conf height
  out=$(curl -s -m 20 "$MEMPOOL/api/tx/$tx" 2>/dev/null)
  conf=$(printf '%s' "$out" | python3 -c "import json,sys
try: print(json.load(sys.stdin)['status']['confirmed'])
except Exception: print('rpc-error')")
  height=$(printf '%s' "$out" | python3 -c "import json,sys
try: print(json.load(sys.stdin)['status'].get('block_height','?'))
except Exception: print('-')")
  if [ "$conf" = "True" ]; then
    row OK "$label" "$tx" "btc block $height  https://mempool.space/testnet/tx/$tx"
  else
    row FAIL "$label" "$tx" "btc confirmed=$conf"
  fi
}

echo "verifying $STATE against public testnets"
echo
printf '  %-6s %-14s %-66s %s\n' RESULT STAGE TXID WHERE
check_btc issue_btc_tx "$(jget issue_btc_tx)"
check_ckb issue_ckb_tx "$(jget issue_ckb_tx)"
check_btc leap_btc_tx  "$(jget leap_btc_tx)"
check_ckb leap_ckb_tx  "$(jget leap_ckb_tx)"
check_ckb unlock_tx    "$(jget unlock_tx)"
check_ckb transfer_tx  "$(jget transfer_tx)"

echo
echo "  asset (xUDT type args) : $(jget unique_id)"
echo "  channel                : $(jget udt_channel)"
echo "  advertisement          : $(jget ad_hash)"
echo "  invoice payment hash   : $(jget payment_hash)"
echo "  swap order status      : $(jget order_status)"
echo
if [ "$fail" -ne 0 ]; then
  echo "FAILED: $fail reference(s) not confirmed" >&2
  exit 1
fi
echo "OK: every reference is committed on its public testnet"
