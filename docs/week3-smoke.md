# Week 3 Smoke — Two-Node Discovery (W3-08)

**Date:** 2026-09-02 10:22 UTC
**Nodes:** `fnn-a` `QmXus9zmYBok488QihKyMunwwSTtxrpzZjGWmJQ5Sc5mYA` `127.0.0.1:8828/8327` + `fnn-b` `QmdccqCxFC8jSf6vj9cob7gRxHWEuMaji9HaHaKV6nATYJ` `127.0.0.1:8829/8328`, `chain: testnet` `0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606`, `CkbConfig` `read_secret_key` via `FIBER_SECRET_KEY_PASSWORD=test123`, `ckb/key` 77b encrypted, `fiber/store` clean (empty `bootnode_addrs: []`).

**Build:** `work/fiber` `feat/swap-advertisement` @ `04e091b0` + W2/W3 patches, `cargo +1.95.0 build -p fiber-bin --features sqlite` **PASS** 3m15s (619M `target/debug/fnn`), `cargo check -p fnn --features sqlite` **PASS** 23s, `cargo test -p fiber-types` 15 PASS, `cargo test -p fnn --lib swap_advertisement` 3 PASS, `cargo check -p fnn-cli` **PASS** 9s.

## Sequence (curl + fnn-cli, verifiable)

**1. Publish on hub (8327):**
```bash
curl -X POST http://127.0.0.1:8327 -d '{"method":"publish_swap_advertisement","params":[{"base_udt_script":null,"quote_udt_script":null,"rate":"0x2540be400","fee_rate":"0xbb8","expiry_delta_millis":"0x5265c00"}]}'
# → {"operator_pubkey":"0230c7dc464617c141941602b8e68948608e4ccd6388b86186eb5464afb3dead1f","timestamp":"0x1a061a8e10e","expiry":"0x1a066cf3d0e","rate":"0x2540be400",...}
```

**2. List on hub (8327) — local index:**
```bash
curl -X POST http://127.0.0.1:8327 -d '{"method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
# → {"offers":[{"rate":"0x2540be400","operator_pubkey":"0230c7...","timestamp":"0x1a061a8e10e"}]}  # 1 offer
```

**3. Connect hub → listener:**
```bash
curl -X POST http://127.0.0.1:8327 -d '{"method":"connect_peer","params":[{"address":"/ip4/127.0.0.1/tcp/8829/p2p/QmdccqCxFC8jSf6vj9cob7gRxHWEuMaji9HaHaKV6nATYJ"}]}'
# → null
# list_peers on 8327 shows QmXus9zm... + QmdccqCx... + 2 testnet bootnodes (before clean) / 1 after clean
```

**4. List on listener (8328) after 5s — gossip active sync (GetBroadcastMessages after_cursor 0, count 100):**
```bash
curl -X POST http://127.0.0.1:8328 -d '{"method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
# → {"offers":[{"rate":"0x2540be400",...,"operator_pubkey":"0230c7..."}]}  # 1, same as hub — PASS (first batch)
```
*With `bootnode_addrs: []` and clean stores, first batch contains swap ad (no testnet clutter, no 10-batch delay).*

**5. CLI on listener:**
```bash
fnn-cli --url http://127.0.0.1:8328 swap_ad list_swap_advertisements
# → offers:
#   - rate: '0x2540be400'
#     operator_pubkey: 0230c7...
```

**6. Publish second on hub (higher rate):**
```bash
curl -X POST http://127.0.0.1:8327 -d '{"method":"publish_swap_advertisement","params":[{"base_udt_script":null,"quote_udt_script":null,"rate":"0x4a38b2e00","fee_rate":"0xbb8","expiry_delta_millis":"0x5265c00"}]}'
# → {"rate":"0x4a38b2e00","timestamp":"0x1a061a9b1b9",...}
curl -X POST http://127.0.0.1:8327 -d '{"method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
# → {"offers":[{"rate":"0x4a38b2e00",...},{"rate":"0x2540be400",...}]}  # 2, sorted rate desc
```

**7. List on listener after 5s → still 1, after 20s → 2 (second batch):**
```bash
# after 5s
curl -X POST http://127.0.0.1:8328 -d '{"method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
# → {"offers":[{"rate":"0x2540be400"}]}  # 1
# after 20s (next GetBroadcastMessages with after_cursor = last batch's cursor)
curl -X POST http://127.0.0.1:8328 -d '{"method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
# → {"offers":[{"rate":"0x4a38b2e00",...},{"rate":"0x2540be400",...}]}  # 2 — PASS
```

**8. Best rate on listener:**
```bash
curl -X POST http://127.0.0.1:8328 -d '{"method":"get_best_swap_rate","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
# → {"offer":{"rate":"0x4a38b2e00",...}}  # max — PASS
fnn-cli --url http://127.0.0.1:8328 swap_ad get_best_swap_rate
# → offer: rate: '0x4a38b2e00'  # PASS
```

**9. CLI list on both (final, after sync):**
```bash
fnn-cli --url http://127.0.0.1:8327 swap_ad list_swap_advertisements
# → offers: [0x4a38b2e00, 0x2540be400]  # 2
fnn-cli --url http://127.0.0.1:8328 swap_ad list_swap_advertisements
# → offers: [0x4a38b2e00, 0x2540be400]  # 2 — PASS, both have same 2 from hub
fnn-cli --url http://127.0.0.1:8328 swap_ad get_best_swap_rate
# → offer: 0x4a38b2e00  # PASS
```

## Notes
- `is_expired` via `now_timestamp_as_millis_u64()` + `expiry = now + 86400000` (0x5265c00) → `is_expired:false` for both.
- `SwapAdIndex::list_offers` sorts `rate` desc, so `best_rate` is first.
- Gossip `verify` checks `rate!=0`, `expiry>timestamp`, ECDSA `blake2b_256` over `SwapAdvertisement` without `signature`, `chain_hash` testnet.
- Disk: `work/fiber/target` 11G, `/` 13G free after `rm -rf logos/.../target` 7.3G + `work/fiber/target` clean.

## Verdict
W3-08 **PASS** — `publish` (sign) → `list` (store `get_active_swap_advertisements` via `get_swap_advertisements` filter) → `connect_peer` → `list` on listener within 5s (first ad) and 20s (second ad, second batch) → `get_best` max. CLI `swap_ad` (auto-generated via `fiber-json-types/src/swap_ad.rs` + `rpc/swap_ad.rs` + `rpc/mod.rs`) also **PASS**.

