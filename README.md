# Fiber RGB++ Swap

A market and discovery layer for Fiber Network’s Cross-Chain Hub, enabling operators to advertise swap rates for RGB++ assets and clients to discover them before swapping.

Fiber already carries RGB++ assets as a native channel asset type. This project adds the missing piece: a gossip-broadcast market where hubs advertise supported pairs and clients discover the best offer.

## Status (2026-10-20)

The market layer and an end-to-end swap of an RGB++-issued asset are both live on
testnet3:

- swap order `0x2823d3ec…` — **Success**, 1 unit of asset `0xeb4963db…` for 100 CKB,
  over channel `0xbdfbc451…`
- the lineage behind it (issuance → leap → unlock → transfer) is six committed
  transactions across Bitcoin and CKB; every hash is in
  [docs/submission.md](docs/submission.md)
- re-check all of them with `bash scripts/verify-evidence.sh`
- operate or reproduce the pipeline with `bash scripts/e2e-run.sh`
  ([docs/l3-orchestration.md](docs/l3-orchestration.md))

## Overview

- **SwapAdvertisement** — a signed, expirable gossip message carrying an asset pair (base UDT ↔ quote UDT), rate, fee, operator pubkey, timestamp and expiry.
- **Gossip integration** — new `BroadcastMessage` union id `3` on Fiber’s `NodeAnnouncement`/`ChannelAnnouncement`/`ChannelUpdate` cursor stream, relayed via `GetBroadcastMessages` / `BroadcastMessagesFilterResult` and pruned on expiry.
- **Discovery index** — listening-side `SwapAdIndex` that filters `is_expired`, matches `Script` pair, and sorts by `rate` desc; `list_offers(filter)` and `best_rate(pair)` are exposed via RPC and CLI.

All messages are opt-in: only nodes running this build relay advertisements; stock nodes ignore the new union id and continue normally.

## Architecture

```
Client (curl / fnn-cli)
      │  publish / list / get_best
      ▼
  RPC (swap_ad) ──► Store (GossipMessageStore)
      │                ▲
      ▼                │ get_broadcast_messages(after_cursor)
  Gossip (BroadcastMessage::SwapAdvertisement)
   /     \
PeerFilter  GossipSyncingActor
  │           │
  ▼           ▼
NetworkGraph (ignores swap ads)   Peer Store
```

- **Molecule:** `crates/fiber-types/src/schema/gossip.mol` `table SwapAdvertisement { signature EcdsaSignature, chain_hash Byte32, base_udt_script ScriptOpt, quote_udt_script ScriptOpt, rate Uint128, fee_rate Uint128, operator_pubkey Pubkey, timestamp Uint64, expiry Uint64 }`
- **Signing:** `blake2b_256` of `SwapAdvertisement` without `signature` → ECDSA secp256k1 (`Privkey::sign`), `verify` checks `rate !=0`, `expiry > timestamp`, and `!is_expired(now)`.
- **Cursor:** `Cursor::new(timestamp, SwapAdvertisement(blake2b_256(message_to_sign)))` (`hash` 32 + 4 zero pad, 45 bytes).
- **Store:** `GossipMessageStore::save_swap_advertisement` + `get_swap_advertisements(after_cursor, limit)` + `get_active_swap_advertisements(now)` in `crates/fiber-lib/src/store/store_impl/mod.rs`.

## Features

- Signed, expirable advertisements with `chain_hash` replay protection
- Gossip broadcast via existing `TryBroadcastMessages` / `GetBroadcastMessages` / `BroadcastMessagesFilterResult` paths
- `is_expired` pruning and `rate` desc sorting
- RPC `publish_swap_advertisement`, `list_swap_advertisements`, `get_best_swap_rate` and `fnn-cli swap_ad` group

## Getting Started

### Build

```bash
cargo build -p fiber-bin --features sqlite
cargo build -p fnn-cli
# or
cargo check -p fnn --features sqlite
cargo test -p fiber-types
```

Toolchain `1.95.0` (`rust-toolchain.toml`).

### Run two local nodes (testnet)

```bash
mkdir -p work/fnn-a/ckb work/fnn-b/ckb
openssl rand -hex 32 > work/fnn-a/ckb/key
openssl rand -hex 32 > work/fnn-b/ckb/key
# configs at work/fnn-a/config.yml (8828/8327) and work/fnn-b/config.yml (8829/8328), chain: testnet, ckb.rpc_url https://testnet.ckbapp.dev/
FIBER_SECRET_KEY_PASSWORD=test123 ./target/debug/fnn -c work/fnn-a/config.yml -d work/fnn-a &
FIBER_SECRET_KEY_PASSWORD=test123 ./target/debug/fnn -c work/fnn-b/config.yml -d work/fnn-b &
```

### Publish and discover

```bash
# Hub publishes (8327)
curl -X POST http://127.0.0.1:8327 -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"publish_swap_advertisement","params":[{"base_udt_script":null,"quote_udt_script":null,"rate":"0x2540be400","fee_rate":"0xbb8","expiry_delta_millis":"0x5265c00"}]}'

# List on hub
curl -X POST http://127.0.0.1:8327 -d '{"id":1,"jsonrpc":"2.0","method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}'

# Connect hub → listener
curl -X POST http://127.0.0.1:8327 -d '{"id":1,"jsonrpc":"2.0","method":"connect_peer","params":[{"address":"/ip4/127.0.0.1/tcp/8829/p2p/<peer-id>"}]}'

# List on listener after 5s (first batch) — same offer appears
curl -X POST http://127.0.0.1:8328 -d '{"id":1,"jsonrpc":"2.0","method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}'

# Best rate
curl -X POST http://127.0.0.1:8328 -d '{"id":1,"jsonrpc":"2.0","method":"get_best_swap_rate","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
```

Via CLI:

```bash
fnn-cli --url http://127.0.0.1:8327 swap_ad publish_swap_advertisement --rate 10000000000 --fee-rate 3000 --expiry-delta-millis 86400000
fnn-cli --url http://127.0.0.1:8328 swap_ad list_swap_advertisements
fnn-cli --url http://127.0.0.1:8328 swap_ad get_best_swap_rate
```

`rate` is quote per base * 1e8.

## Visual Board (for everyone)

No Rust needed to see it work — open the one-file web UI:

```bash
cd demo && python3 -m http.server 8000
# open http://127.0.0.1:8000 in a browser (nodes must be running)
```

The left card is the hub (publish form + its book), the right card is the
listener (its book, auto-refreshed every 5s, plus the best rate). Publish on
the left, peer the nodes, and watch the right card fill in over gossip —
both books converging is the whole demo. Plain-language labels throughout;
rates shown as ordinary numbers. Nodes need `cors_enabled: true` in the
`rpc:` section of their config (already set in `work/fnn-*/config.yml`).

## Project Structure

```
docs/                          # design, gossip notes, schema, checkpoints, smoke logs
work/fiber/                    # fork of nervosnetwork/fiber at 04e091b0, branch feat/swap-advertisement
  crates/fiber-types/src/schema/gossip.mol
  crates/fiber-types/src/protocol.rs (SwapAdvertisement)
  crates/fiber-lib/src/fiber/swap_advertisement.rs (SwapAdIndex)
  crates/fiber-lib/src/rpc/swap_ad.rs
  crates/fiber-json-types/src/swap_ad.rs
upstream/                      # starter Actix+Yew scaffold (oxdev6/Fiber-RGB-Swap)
work/fnn-a/ work/fnn-b/         # local testnet configs and stores (bootnode_addrs: [] for local)
```

## RPC

- `publish_swap_advertisement(PublishSwapAdParams) -> SwapOffer`
- `list_swap_advertisements(ListSwapAdsParams) -> ListSwapAdsResult { offers: SwapOffer[] }`
- `get_best_swap_rate(GetBestSwapRateParams) -> GetBestSwapRateResult { offer: SwapOffer | null }`

All `*Params` use `Option<Script>` (`ckb_jsonrpc_types::Script`) with `U128Hex`/`U64Hex` for `u128`/`u64`.

## Development

```bash
cargo check -p fnn --features sqlite
cargo test -p fiber-types
cargo test -p fnn --lib swap_advertisement -- --nocapture
cargo check -p fnn-cli
```

Two-node smoke is in `docs/week3-smoke.md` (`publish` → `list` → `connect` → `list` → `get_best`).

## License

MIT
