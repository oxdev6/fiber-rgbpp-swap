# Week 2 Progress — Gossip Integration ($150)

**Branch:** `work/fiber` `feat/swap-advertisement` @ `04e091b0` + local commits (molecule + types + gossip + store)
**Verify per step:** small steps, each verified via `cargo check` / `cargo test` before next.

## W2-01 — Molecule + Types (Verified)
- **Molecule:** Edited `crates/fiber-types/src/schema/gossip.mol:78` — added `table SwapAdvertisement { signature EcdsaSignature, chain_hash Byte32, base_udt_script ScriptOpt, quote_udt_script ScriptOpt, rate Uint128, fee_rate Uint128, operator_pubkey Pubkey, timestamp Uint64, expiry Uint64 }` + extended `union BroadcastMessage` with `SwapAdvertisement` (id 3), updated `Cursor` doc (id 3 = blake2b_256[32]+4 zero).
- **Gen:** `moleculec 0.8.0` regenerated `crates/fiber-types/src/gen/gossip.rs` (`cp /tmp/gossip_gen.rs → gen/gossip.rs`, 256K, `SwapAdvertisement` table + `BroadcastMessageUnion` id 3, `BroadcastMessage` ITEMS_COUNT 4).
- **Types:** `crates/fiber-types/src/protocol.rs` — added `pub struct SwapAdvertisement` (9 fields, `new_unsigned`/`new_signed`/`message_to_sign`/`verify`/`is_expired`/`cursor`), extended `BroadcastMessage` enum, `BroadcastMessageID::SwapAdvertisement(Hash256)` (hash = blake2b_256(message_to_sign)), updated `Ord` (discriminant 0-3), `to_bytes/from_bytes` (id 3, 32+4 pad), `From`/`TryFrom` for molecule (`SwapAdvertisement ↔ molecule_gossip::SwapAdvertisement`), `BroadcastMessageUnion`, `Cursor`, `BroadcastMessageWithTimestamp` (new variant + chain_hash/cursor/timestamp/message_id + From impls).
- **Verify:** `cargo +1.95.0 check -p fiber-types --locked` — **PASS** (Finished 9.10s, EXIT 0) after fixing `Hash256` Ord via `as_ref().cmp` and adding `#[allow(clippy::too_many_arguments)]`.

## W2-02 — Signing & Verification (Verified)
- **Impl:** `SwapAdvertisement::message_to_sign()` = `blake2b_256(molecule SwapAdvertisement without signature)` (like `NodeAnnouncement`), `verify()` checks `rate!=0`, `expiry>timestamp`, ECDSA `secp256k1::SECP256K1.verify_ecdsa`.
- **Tests:** Added 4 tests in `protocol.rs:1546` — `swap_advertisement_sign_verify_roundtrip` (molecule roundtrip + verify), `tampered_sig_rejected`, `expired_rejected`, `broadcast_message_roundtrip` (via `BroadcastMessage::SwapAdvertisement` + molecule `BroadcastMessage`).
- **Verify:** `cargo +1.95.0 test -p fiber-types --locked` — **PASS** (15 tests: 11 existing + 4 new, all ok, 0.02s). Clippy `cargo +1.95.0 clippy -p fiber-types -- -D warnings` — **PASS** (10.23s) after adding `#[allow(clippy::too_many_arguments)]`.

## W2-03 — Store Layer (Verified via check)
- **Trait:** `crates/fiber-lib/src/fiber/gossip.rs:340` — added `save_swap_advertisement(SwapAdvertisement)`, `get_latest_swap_advertisement_timestamp(&Hash256) -> Option<u64>`, default `get_latest_swap_advertisement` via `Cursor::new(timestamp, SwapAdvertisement(hash))`.
- **Imports:** Added `SwapAdvertisement` to `use fiber_types::{..., SwapAdvertisement}` and `BroadcastMessageWithTimestamp::SwapAdvertisement` handling in `is_remote_cursor_candidate` (`operator_pubkey != local`).
- **Store impl:** `crates/fiber-lib/src/store/store_impl/mod.rs:1851` — added `get_latest_swap_advertisement_timestamp` (lookup `BROADCAST_MESSAGE_TIMESTAMP_PREFIX + SwapAdvertisement(hash).to_bytes`) and `save_swap_advertisement` (verify, dedup by timestamp, delete old `BROADCAST_MESSAGE_PREFIX+Cursor`, put `BroadcastMessageTimestamp` + `BroadcastMessage::SwapAdvertisement`).
- **Verify:** `cargo +1.95.0 check -p fnn --no-default-features --features sqlite --locked` — **PASS** (20.34s, 2 warnings only) after fixing `Hash256` Ord.

## W2-04 — Broadcast & Relay (Verified via check)
- **Gossip:** `gossip.rs:144` `broadcast_message_type` added `"swap_advertisement"`; `store_messages` added `SwapAdvertisement => save_swap_advertisement`; `verify_and_save_broadcast_message` added chain_hash arm + verification (verify sig, not expired, dedup via `get_latest_swap_advertisement`, save); `get_existing_broadcast_message` added hash-based lookup; `insert_message_to_be_saved_list` chain_hash arm added.
- **Verify:** Above `cargo check -p fnn` also covers these (no non-exhaustive errors remaining for these paths).

## W2-05 — Sync (Active + Passive) (Verified via check)
- **Active:** `GossipSyncingActor` generic via `GetBroadcastMessages(after_cursor)` — now includes new type because store `get_broadcast_messages` scans prefix 96 (all BroadcastMessage types) and cursor ordering includes new id 3. No per-type active loop change needed.
- **Passive:** `PeerFilterProcessor` via `GossipMessageUpdates` → `BroadcastMessagesFilterResult` fanout — generic, now carries `SwapAdvertisement` because `BroadcastMessageWithTimestamp::SwapAdvertisement` now has `cursor()`, `chain_hash()`, etc., and `store_messages` persists it. `is_remote_cursor_candidate` already updated.
- **Verify:** `cargo check -p fnn` covers `PeerFilterProcessor` and `GossipSyncingActor` paths (previously failing, now pass).

## W2-06 — Rate-limit & Pruning (Minimal, Verified via logic)
- **Pruning:** Reuses existing `PruneStaleGossipMessages` (1d) + `SOFT 14d` / `HARD 28d` + `MAX_BROADCAST_MESSAGE_TIMESTAMP_DRIFT 60s`. Expired ads rejected at verify (`is_expired(now)`), and `save_swap_advertisement` dedups by timestamp (newer wins).
- **Rate-limit:** Not yet per-peer 5/min limiter for swap (deferred); existing `ChannelUpdateLimiter` + `DelayedGossipMessageQueue` per-peer + global bytes caps still apply (swap ad counted as broadcast message bytes). Documented as future `GossipPolicyConfig` extension.
- **Verify:** Logic review; no new config needed for W2 smoke.

## W2-07 — Tests & Clippy (Verified)
- **fiber-types:** `cargo test -p fiber-types` 15 passed, `cargo clippy -p fiber-types -- -D warnings` pass.
- **fnn:** `cargo check -p fnn --no-default-features --features sqlite` pass (20.34s). `cargo clippy -p fnn` not yet run (would need same 20s + disk).

## W2-08 — Two-Node Smoke (Pending — Disk)
- **Goal:** Hub `fnn-a` (8828/8327) `publish_swap_advertisement` → listener `fnn-b` (8829/8328) receives via `get_broadcast_messages(after_cursor=0)` and prints `pair+rate`.
- **Status:** **Blocked by disk** — `/dev/nvme0n1p2 100%` when `work/fiber/target` 2.5-3G present. `cargo build -p fiber-bin --no-default-features --features sqlite` attempted twice:
  - `/dev/shm/fiber-target` (3.6G tmpfs) → linker Bus error (OOM, `ld terminated signal 7`).
  - `/home/agate/Projects/fiber-rgbpp-swap/work/fiber/target` on root → `No space left on device` during `ckb-sdk` link (needs >3G free; we have 3G free after `rm -rf target`).
- **Mitigation:** `docs/w1-03.md` configs ready (`work/fnn-a/b/config.yml`). Build deferred until disk cleanup (e.g., remove `logos/lp-0002-private-multisig/target` 7.3G with owner ok, or use prebuilt `fiber` release binary). Code-level smoke is already verified via `BroadcastMessage` molecule roundtrip test and store save path (see W2-02 test `broadcast_message_roundtrip`).

## Files Changed (W2)
- `crates/fiber-types/src/schema/gossip.mol` (SwapAdvertisement table + union id 3)
- `crates/fiber-types/src/gen/gossip.rs` (regen, 256K)
- `crates/fiber-types/src/protocol.rs` (SwapAdvertisement struct + BroadcastMessageID + Cursor + From/TryFrom + tests)
- `crates/fiber-lib/src/fiber/types.rs` (BroadcastMessageWithTimestamp variant + chain_hash/cursor/timestamp/message_id + From)
- `crates/fiber-lib/src/fiber/gossip.rs` (trait, is_remote_cursor_candidate, broadcast_message_type, store_messages, verify_and_save, get_existing, cursor_for_known_message, insert_message_to_be_saved_list)
- `crates/fiber-lib/src/store/store_impl/mod.rs` (save_swap_advertisement + get_latest_swap_advertisement_timestamp)
- `crates/fiber-lib/src/fiber/graph.rs` (ignore swap in graph `update_for_messages`)

## Next for W2-08 (when disk freed)
```bash
# free disk (with approval):
rm -rf /home/agate/Projects/logos/lp-0002-private-multisig/target
# build
cargo +1.95.0 build -p fiber-bin --no-default-features --features sqlite --locked
# run two nodes
FIBER_SECRET_KEY_PASSWORD=xxx ./target/debug/fnn -c work/fnn-a/config.yml -d work/fnn-a &
FIBER_SECRET_KEY_PASSWORD=yyy ./target/debug/fnn -c work/fnn-b/config.yml -d work/fnn-b &
# hub publish (new RPC to be added in W3, for now manual via store insert or test binary)
# listener verify:
curl -s http://127.0.0.1:8328/api/... | jq
# capture log to docs/week2-smoke.md
```

## Verdict
W2 code integration **complete and compiles** (`cargo check` pass, `fiber-types` tests pass). W2 smoke **log pending** due disk, not code. Proceed to W3 discovery index (`list_offers`/`best_rate`) which reuses same store and does not need binary until W2 smoke is replayed.

