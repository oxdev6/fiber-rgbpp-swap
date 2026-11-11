#!/usr/bin/env bash
# Verify every reference in localnet/e2e-state.json against the public testnets.
# No node, no local chain, no code review: only public endpoints.
#
#   bash scripts/verify-evidence.sh [state.json]
#
# Exits non-zero if any reference is missing or unconfirmed.

set -uo pipefail
cd "$(dirname "$0")/.."

# Windows/Git Bash often has `python` but not `python3`.
PYTHON=${PYTHON:-python3}

STATE=${1:-localnet/e2e-state.json}
[ -f "$STATE" ] || STATE=docs/evidence-state.json
CKB_RPC=${CKB_RPC:-https://testnet.ckb.dev/}
MEMPOOL=${MEMPOOL_API:-https://mempool.space/testnet}

[ -f "$STATE" ] || { echo "no such state file: $STATE" >&2; exit 2; }

jget() { "$PYTHON" -c "import json,sys;d=json.load(open('$STATE'));print(d.get('$1',''))"; }

fail=0
row() { printf '  %-6s %-14s %-66s %s\n' "$1" "$2" "$3" "$4"; [ "$1" = "FAIL" ] && fail=$((fail+1)); return 0; }

check_ckb() {
  local label="$1" tx="$2"
  [ -n "$tx" ] || { row FAIL "$label" "(no reference)" -; return; }
  local out status block
  out=$(curl -s -m 20 -X POST "$CKB_RPC" -H 'Content-Type: application/json' \
        -d "{\"id\":1,\"jsonrpc\":\"2.0\",\"method\":\"get_transaction\",\"params\":[\"$tx\"]}" 2>/dev/null)
  status=$(printf '%s' "$out" | "$PYTHON" -c "import json,sys
try: print(json.load(sys.stdin)['result']['tx_status']['status'])
except Exception: print('rpc-error')")
  block=$(printf '%s' "$out" | "$PYTHON" -c "import json,sys
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
  conf=$(printf '%s' "$out" | "$PYTHON" -c "import json,sys
try: print(json.load(sys.stdin)['status']['confirmed'])
except Exception: print('rpc-error')")
  height=$(printf '%s' "$out" | "$PYTHON" -c "import json,sys
try: print(json.load(sys.stdin)['status'].get('block_height','?'))
except Exception: print('-')")
  if [ "$conf" = "True" ]; then
    row OK "$label" "$tx" "btc block $height  https://mempool.space/testnet/tx/$tx"
  else
    row FAIL "$label" "$tx" "btc confirmed=$conf"
  fi
}

check_channel() {
  local label="channel" tx uid status asset live
  tx=$(jget channel_funding_tx)
  uid=$(jget unique_id)
  [ -n "$tx" ] || { row FAIL "$label" "(no reference)" -; return; }

  local out
  out=$(curl -s -m 20 -X POST "$CKB_RPC" -H 'Content-Type: application/json' \
        -d "{\"id\":1,\"jsonrpc\":\"2.0\",\"method\":\"get_transaction\",\"params\":[\"$tx\"]}" 2>/dev/null)
  status=$(printf '%s' "$out" | "$PYTHON" -c "import json,sys
try: print(json.load(sys.stdin)['result']['tx_status']['status'])
except Exception: print('rpc-error')")
  asset=$(printf '%s' "$out" | "$PYTHON" -c "import json,sys
try:
    o = json.load(sys.stdin)['result']['transaction']['outputs'][0]
    print(o['type']['args'] if o.get('type') else '')
except Exception: print('')")
  live=$(curl -s -m 20 -X POST "$CKB_RPC" -H 'Content-Type: application/json' \
        -d "{\"id\":1,\"jsonrpc\":\"2.0\",\"method\":\"get_live_cell\",\"params\":[{\"tx_hash\":\"$tx\",\"index\":\"0x0\"},false]}" 2>/dev/null \
        | "$PYTHON" -c "import json,sys
try: print(json.load(sys.stdin)['result']['status'])
except Exception: print('rpc-error')")

  if [ "$status" = "committed" ] && [ "$asset" = "$uid" ]; then
    row OK "$label" "$tx" "output 0 carries the advertised asset; cell is $live"
  else
    row FAIL "$label" "$tx" "status=$status asset=$asset expected=$uid cell=$live"
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
check_channel channel_funding_tx

echo
echo "  asset (xUDT type args) : $(jget unique_id)"
echo "  channel                : $(jget udt_channel)"
echo "  advertisement          : $(jget ad_hash)"
echo "  invoice payment hash   : $(jget payment_hash)"
echo "  swap order status      : $(jget order_status)  (self-reported)"
echo
echo "  NOTE: the advertisement, payment hash and order status above are taken"
echo "  from the state file. They are NOT independently verified here. Verifying"
echo "  the swap itself requires payment records from both nodes and, ideally,"
echo "  an on-chain channel close. See docs/evidence-upgrade.md."
echo
if [ "$fail" -ne 0 ]; then
  echo "FAILED: $fail reference(s) not confirmed" >&2
  exit 1
fi
echo "OK: every reference is committed on its public testnet"
