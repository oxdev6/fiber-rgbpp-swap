#!/usr/bin/env bash
# Start both Fiber nodes (hub + listener) and the demo board for local testing.
# Usage: ./scripts/run.sh [--fresh]
#   --fresh  wipe both gossip stores first (clean books: 0 -> 1 -> 2 story)
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FNN="$ROOT/work/fiber/target/debug/fnn"

if [ ! -x "$FNN" ]; then
  echo "missing binary: $FNN"
  echo "build it first: cargo +1.95.0 build -p fiber-bin --no-default-features --features sqlite"
  echo "  (run from $ROOT/work/fiber)"
  exit 1
fi
if [ "${1:-}" = "--fresh" ]; then
  "$ROOT/scripts/stop.sh" >/dev/null 2>&1 || true
  rm -rf "$ROOT/work/fnn-a/fiber/store/"* "$ROOT/work/fnn-b/fiber/store/"*
  echo "stores wiped (keys kept: peer IDs stay stable)"
fi
export FIBER_SECRET_KEY_PASSWORD="${FIBER_SECRET_KEY_PASSWORD:-test123}"
export RUST_LOG="${RUST_LOG:-info}"
setsid nohup env FIBER_SECRET_KEY_PASSWORD="$FIBER_SECRET_KEY_PASSWORD" RUST_LOG="$RUST_LOG" \
  "$FNN" -c "$ROOT/work/fnn-a/config.yml" -d "$ROOT/work/fnn-a" > /tmp/fnn-a.log 2>&1 < /dev/null &
setsid nohup env FIBER_SECRET_KEY_PASSWORD="$FIBER_SECRET_KEY_PASSWORD" RUST_LOG="$RUST_LOG" \
  "$FNN" -c "$ROOT/work/fnn-b/config.yml" -d "$ROOT/work/fnn-b" > /tmp/fnn-b.log 2>&1 < /dev/null &
echo "nodes starting (boot takes 3-5 min: testnet contract init, P2P first, RPC last)"
# demo board
if ! ss -tln 2>/dev/null | grep -q ":8000"; then
  setsid nohup python3 -m http.server 8000 --directory "$ROOT/demo" > /tmp/demo-ui.log 2>&1 < /dev/null &
  echo "board serving on http://127.0.0.1:8000"
else
  echo "board already on http://127.0.0.1:8000"
fi
echo "wait until all four ports listen, then open the board:"
echo "  ss -tlnp | grep -E '8327|8328|8828|8829'"
