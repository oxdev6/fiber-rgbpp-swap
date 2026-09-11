# Testing the Swap-Ad Discovery (two-node demo)

Proven working 2026-09-11 on `feat/swap-advertisement`. Full flow:
publish → list → connect → synced list → best-rate, via `curl` and `fnn-cli`.

## 0. Prerequisites

- Binaries: `work/fiber/target/debug/fnn` (619M) and `fnn-cli` (93M),
  built with `cargo build -p fiber-bin --features sqlite` / `cargo build -p fnn-cli`
  (toolchain `1.95.0`). Rebuild only if sources changed.
- Configs: `work/fnn-a/config.yml` (`8828/8327`) and `work/fnn-b/config.yml`
  (`8829/8328`), `chain: testnet`, `bootnode_addrs: []`, `ckb.rpc_url: https://testnet.ckbapp.dev/`
- Keys: `work/fnn-a/ckb/key` and `work/fnn-b/ckb/key` exist (encrypted;
  created once via `openssl rand -hex 32`, migrated on first boot).
- Env: `FIBER_SECRET_KEY_PASSWORD=test123` must be set when starting each node.
- Disk: keep several GB free on `/` — a near-full disk makes startup and
  `publish` very slow (first boot does testnet `ContractsContext` init).

## 1. Start both nodes

```bash
FIBER_SECRET_KEY_PASSWORD=test123 RUST_LOG=info \
  ./work/fiber/target/debug/fnn -c work/fnn-a/config.yml -d work/fnn-a > /tmp/fnn-a.log 2>&1 &
FIBER_SECRET_KEY_PASSWORD=test123 RUST_LOG=info \
  ./work/fiber/target/debug/fnn -c work/fnn-b/config.yml -d work/fnn-b > /tmp/fnn-b.log 2>&1 &
```

First boot takes **2–4 min per node** (testnet contract init is slow; node B
lags node A). Wait until **all four** ports listen:

```bash
ss -tlnp | grep -E "8327|8328|8828|8829"
# expect: 8828 (A p2p), 8829 (B p2p), 8327 (A rpc), 8328 (B rpc)
```

P2P (`8828/8829`) comes up first; RPC (`8327/8328`) follows 1–3 min later
(check `tail /tmp/fnn-a.log`, look for `Started listening tentacle` then
watchtower `PeriodicCheck` lines). Confirm RPC is alive:

```bash
curl -s -m 10 -X POST http://127.0.0.1:8327 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"node_info","params":[]}' | head -c 300
```

## 2. Publish on the hub (A = 8327)

```bash
curl -s -m 120 -X POST http://127.0.0.1:8327 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"publish_swap_advertisement","params":[{"base_udt_script":null,"quote_udt_script":null,"rate":"0x2540be400","fee_rate":"0xbb8","expiry_delta_millis":"0x5265c00"}]}'
```

> **Known quirk (not a protocol bug):** on a loaded machine the `publish`
> HTTP response can be very slow (>60s) or time out with 0 bytes — **the
> write still lands**. The signing + store commit succeed server-side; only
> the response is delayed. If your client times out, **do not republish
> blindly** — verify with `list` first (each publish creates one ad, so a
> retry creates a duplicate):
>
> ```bash
> curl -s -m 15 -X POST http://127.0.0.1:8327 \
>   -H "Content-Type: application/json" \
>   -d '{"id":1,"jsonrpc":"2.0","method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
> # expect {"offers":[{...,"rate":"0x2540be400",...}]} — 1 offer = publish landed
> ```
>
> `rate` is quote-per-base × 1e8 (`0x2540be400` = 10,000,000,000 = 100/base).
> `expiry_delta_millis` `0x5265c00` = 86,400,000 = 1 day. Old ads (past
> `expiry`) are filtered out of `list` — that is the expiry pruning working,
> not missing data.

## 3. Connect hub → listener

```bash
curl -s -m 15 -X POST http://127.0.0.1:8327 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"connect_peer","params":[{"address":"/ip4/127.0.0.1/tcp/8829/p2p/QmdccqCxFC8jSf6vj9cob7gRxHWEuMaji9HaHaKV6nATYJ"}]}'
# expect {"result":null} (accepted; peering takes a few seconds)

curl -s -m 15 -X POST http://127.0.0.1:8327 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"list_peers","params":[]}'
# expect peers[] to contain 8829/QmdccqCx... (retry connect once if empty)
```

Peer IDs are stable (`fiber/sk` persists). A's ID is
`QmXus9zmYBok488QihKyMunwwSTtxrpzZjGWmJQ5Sc5mYA` (see `Started listening
tentacle` in `/tmp/fnn-a.log`).

## 4. Verify gossip sync on the listener (B = 8328)

Wait ~25s (one `GetBroadcastMessages` active-sync round), then:

```bash
curl -s -m 15 -X POST http://127.0.0.1:8328 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
# expect the hub's offer(s) — same operator_pubkey/rate as on :8327
```

With clean stores the first ad arrives in the first batch (~5s). A second
ad published later arrives on the next sync round (~20s).

## 5. Best rate + CLI

```bash
curl -s -m 15 -X POST http://127.0.0.1:8328 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"get_best_swap_rate","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
# expect {"offer":{"rate":"<max>",...}}

./work/fiber/target/debug/fnn-cli --url http://127.0.0.1:8327 swap_ad list_swap_advertisements
./work/fiber/target/debug/fnn-cli --url http://127.0.0.1:8328 swap_ad list_swap_advertisements
./work/fiber/target/debug/fnn-cli --url http://127.0.0.1:8328 swap_ad get_best_swap_rate
# CLI prints the same offers in YAML; both nodes must converge to identical lists
```

## 6. Stop

```bash
pkill -f "target/debug/fnn -c" ; sleep 2
ps aux | grep "target/debug/fnn -c" | grep -v grep   # expect empty
```

Stores persist (`work/fnn-*/fiber/store`), so a restart keeps ads that have
not expired. To start clean: stop nodes, then
`rm -rf work/fnn-a/fiber/store/* work/fnn-b/fiber/store/*`
(keep `ckb/key` and `fiber/sk` — keys and peer IDs stay stable).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Connection refused` on `:8327`/`:8328` | RPC not up yet — P2P comes first, RPC 1–3 min later. Wait, re-check `ss`. |
| Node stuck at `Creating ContractsContext` | Testnet init, can take 2–4 min and 100% CPU. Check `https://testnet.ckbapp.dev/` is reachable; just wait. |
| `publish` times out, `list` shows the ad | Expected quirk (see §2) — write landed, response was slow. Verify via `list`, don't spam retries. |
| `list` empty after restart | Ads from a previous day expired (`expiry` = publish + 1 day) and are filtered. Publish fresh ones. |
| `peers[]` empty after `connect_peer → null` | Dial still in flight — wait 10s and re-check; retry `connect_peer` once. |
| Second ad takes ~20s to appear on listener | Normal — next active-sync round. First ad on clean stores arrives in ~5s. |
