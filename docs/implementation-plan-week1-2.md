# Implementation Plan — Week 1 & Week 2 (Small Steps)

> Scope: Revised Spark $500 / 4-week grant. This doc covers **only W1+W2**. W3–W4 planned separately. Each step ≤ 0.5–1 day, independently checkable. No “one long go”.

Source of truth: Post #20 (https://talk.nervos.org/t/spark-program-fiber-rgb-swap/10487/20). W1 = Design & setup ($100). W2 = Gossip integration ($150).

---

## Week 1 — Design and Setup ($100)
**Goal:** Nodes running + gossip internals understood + `SwapAdvertisement` schema frozen.

### W1-01 — Env & fork
**Input:** `nervosnetwork/fiber` main, toolchain `1.93.0` (`rust-toolchain.toml`), `upstream` scaffold.
**Do:**
- Fork `nervosnetwork/fiber` to `oxdev6/fiber` (or local branch `feat/swap-advertisement` off upstream commit pinned in `W1-01` note).
- Record pinned upstream hash in `docs/pinned-upstream.md`.
- Verify `cargo check --locked`, `cargo clippy -- -D warnings`, `cargo nextest run -p fiber-types` green on pristine fork.
**Files:** `fiber/Cargo.toml`, `rust-toolchain.toml`
**Verify:** `make check` passes, hash logged.

### W1-02 — CKB testnet node
**Do:**
- Stand up CKB testnet (or `dev` with `ckb --version` + genesis hash check `contracts.rs:177`) locally or via public RPC. Record `CKB_RPC_URL`.
- Confirm `ckb-cli rpc get_tip_header` + indexer `get_cells` works.
**Verify:** `curl $CKB_RPC_URL` tip header JSON logged to `docs/env.md`.

### W1-03 — Fiber fnn nodes (×2)
**Do:**
- Build `fnn` from fork (`cargo build -p fiber-bin`).
- Create two data dirs `fnn-a/`, `fnn-b/` from `config/testnet/config.yml:88` `udt_whitelist` stub; set `FIBER_SECRET_KEY_PASSWORD`, `ckb/key` encrypted, `fiber/sk` peer IDs distinct.
- Launch `fnn -c config.yml -d .` both; confirm P2P connect, `list_peers` RPC, `get_node_info`.
**Files:** `crates/fiber-lib/src/ckb/config.rs:47` (udt_whitelist), `config/testnet/config.yml`
**Verify:** Two nodes peered, `fiber` RPC `graph_channels` empty but alive; logs saved.

### W1-04 — Gossip deep-read (read-only, with notes)
**Do:** Read & annotate (no code yet):
- `crates/fiber-lib/src/fiber/gossip.rs` — `GossipMessageStore`, `SubscribableGossipMessageStore`, `Cursor`, `GossipMessage::GetBroadcastMessages/BroadcastMessagesFilterResult`, `DelayedGossipMessageQueue`, active vs passive sync.
- `crates/fiber-types/src/` molecule gens for `BroadcastMessage`, `BroadcastMessageID`, `ChannelAnnouncement`/`ChannelUpdate`/`NodeAnnouncement`, `Cursor`.
- `crates/fiber-lib/src/fiber/types.rs` — `BroadcastMessageWithTimestamp`, `GossipMessage`, `QueryBroadcastMessages`.
- `crates/fiber-lib/src/store/` impls + `store_trait.rs`.
**Output:** Notes in `docs/gossip-notes.md` (message flow, cursor ordering, validation hook `MAX_BROADCAST_MESSAGE_TIMESTAMP_DRIFT=60s`, prune 14d/28d).
**Verify:** Note doc exists, lists 3 call sites to extend.

### W1-05 — Requirements capture
**Do:**
- Re-read Discussion #1243 + Liquidity Ads analogy. Extract: why need pair discovery, hub opt-in, client pre-swap query.
- Draft requirements: advertisement is **informational**, not consensus; signed, expirable, relayed via gossip; no economic enforcement in W1-2.
**Output:** `docs/requirements.md` (stakeholders, non-goals: leap/swap not in this grant).

### W1-06 — SwapAdvertisement schema design (draft)
**Do:** Draft molecule schema (to finalize, not yet implement):
```
table SwapAdvertisement {
  version:        byte,          // 1
  asset_pair:     AssetPair,     // { base: ScriptOpt (RGB++ xUDT), quote: ScriptOpt (CKB UDT) } or type_script hashes
  rate:           Uint128,       // quote per base (e.g., fixed-point, document denom)
  fee:            Uint64,        // proportional or absolute — pick one, document units
  operator_pubkey: Byte33,       // node pubkey = signing key
  expiry:         Uint64,        // millis since epoch
  signature:      Byte64,        // secp256k1 or schnorr over blake2b_256(canonical_bytes_without_sig)
}
```
- Choose hash for signing (reuse `ckb_hash::blake2b_256` as elsewhere `gossip.rs:14`), signature algo (secp256k1 ECDSA vs Schnorr — align with `NodeAnnouncement` existing: ECDSA).
- Define `BroadcastMessageID::SwapAdvertisement(operator_pubkey, expiry? or hash)` or content-hash id.
- Decide pruning: `expiry` enforced + `SOFT 14d` prune reused.
- Document open questions list.
**Files to reference:** `fiber-types/src/gen/` templates, `NodeAnnouncement` signing pattern.
**Verify:** Schema markdown + example JSON in `docs/schema-draft.md` reviewed internally.

### W1-07 — Publish intent & close duplicate-risk
**Do:** Post to Discussion #1243: one-paragraph intent + link to schema draft gist; ask if anyone building same piece. Record link + date.
**Verify:** URL saved in `docs/discussion-post.md`; screenshot.

### W1-08 — W1 checkpoint & deliverable wrap
**Do:** Write `docs/week1-checkpoint.md`: nodes running, upstream pinned, gossip notes, schema draft, discussion post.
**Verify:** Reviewer can: `cat docs/week1-checkpoint.md` → see RPC URLs, peer IDs, schema.

**W1 Exit Criteria:** Both nodes alive, `docs/gossip-notes.md` + `docs/schema-draft.md` + discussion post done. No code beyond notes.

---

## Week 2 — Gossip Integration ($150)
**Goal:** `SwapAdvertisement` as new gossip message type: signed, verified, broadcast, relayed, persisted. Highest-effort week (touches core gossip).

### W2-01 — Molecule + types
**Do:**
- Add `swap_advertisement.mol` (or extend `fiber.mol`) + regenerate `fiber-types/src/gen/`.
- Add `SwapAdvertisement` struct to `fiber-types/src/` (or `crates/fiber-types/src/swap_ad.rs`) with `pack/unpack`, `calc_hash`, helpers.
- Extend `BroadcastMessage` enum (e.g., `SwapAdvertisement(SwapAdvertisement)`) + `BroadcastMessageID::SwapAdvertisement(Hash256)` + `BroadcastMessageWithTimestamp::SwapAdvertisement(u64, SwapAdvertisement)`.
- Bump `BroadcastMessageID` cursor logic.
**Files:** `fiber-types/schemas/`, `fiber-types/src/lib.rs`, `fiber-types/src/gen/`, `crates/fiber-lib/src/fiber/types.rs`
**Verify:** `cargo check -p fiber-types` + `cargo check --locked` green; `cargo nextest run -p fiber-types` passes.

### W2-02 — Signing & verification
**Do:**
- Implement `sign_swap_advertisement(sk: Privkey, ad_without_sig) -> SwapAdvertisement` and `verify(ad) -> bool` (ECDSA secp256k1, `SECP256K1` as in `gossip.rs:2`, message = `blake2b_256(molecule_bytes_without_signature)` matching `NodeAnnouncement` pattern).
- Add expiry check: `now + 60s drift` (`MAX_BROADCAST_MESSAGE_TIMESTAMP_DRIFT`) + `expiry > now`; reject if expired.
- Add basic field validation: non-zero rate, known asset scripts optional (defer whitelist check to W3 if needed).
**Files:** `crates/fiber-lib/src/fiber/types.rs` or new `swap_ad.rs`
**Verify:** Unit test `test_sign_verify_roundtrip`, `test_expired_rejected`, `test_tampered_sig_rejected` — all green via `cargo nextest run test_swap_ad`.

### W2-03 — Store layer
**Do:**
- Extend `GossipMessageStore` trait with:
  `save_swap_advertisement(timestamp, ad)`, `get_latest_swap_advertisement_timestamp(pubkey)`, `get_broadcast_message_with_cursor` case, `delete_broadcast_message` case, timestamp index.
- Implement for `Store` (RocksDB/SQLite/browser): new prefix, cursor handling mirroring `save_node_announcement` (`gossip.rs:346`).
- Update `get_broadcast_messages` / `get_broadcast_messages_reverse` to include new type, sorted by timestamp.
- Extend `SubscribableGossipMessageStore` subscription to include new messages.
**Files:** `crates/fiber-lib/src/fiber/gossip.rs:203`, `crates/fiber-lib/src/store/store_impl/`, `crates/fiber-store/`
**Verify:** `cargo nextest run -p fnn store_trait` subset passes; manual store round-trip test.

### W2-04 — Broadcast & relay (ingress)
**Do:**
- Extend `broadcast_message_type` (`gossip.rs:144`) + gossip ingress metrics labels.
- In `ExtendedGossipMessageStoreMessage::SaveActiveSyncMessages` / gossip validation path: accept `BroadcastMessage::SwapAdvertisement`, run `verify` + expiry + duplicate/expiry prune check, then persist; reject → `GossipViolation` (reuse existing enum or add `InvalidSwapAd`).
- Wire `GossipActorMessage::TryBroadcastMessages` to handle local `SwapAdvertisement` (hub case) same as `ChannelAnnouncement`.
**Files:** `crates/fiber-lib/src/fiber/gossip.rs`, `gossip_policy.rs`, `gossip_metrics.rs`
**Verify:** New ad via `TryBroadcastMessages` persists and appears in `get_broadcast_messages(after_cursor=0)`.

### W2-05 — Sync protocols
**Do:**
- **Active sync:** `GossipSyncingActor` (`gossip.rs:858`) already fetches `GetBroadcastMessages` generically — ensure it carries new type through `SaveActiveSyncMessages` validated cursor. No per-type active loop change if generic.
- **Passive sync:** `PeerFilterProcessor` / `BroadcastMessagesFilterResult` subscription already fans out via `GossipMessageUpdates` (`gossip.rs:404`) → `NetworkActor` → graph. Ensure filter `Cursor` advances correctly for new IDs; reuse `MAX_MISSING_BROADCAST_MESSAGE_TIMESTAMP_DRIFT 2h`.
- **Query:** `QueryBroadcastMessages`/`QueryBroadcastMessagesResult` handles missing (reuse flow).
**Verify:** Step covered by W2-08 two-node test; no isolated unit needed beyond store.

### W2-06 — Rate-limit & anti-spam
**Do:**
- Decide policy: reuse `ChannelUpdateLimiter` pattern or minimal per-peer `SwapAd` limit (e.g., 5 per minute per peer, global cap). Wire into `GossipPolicyState` check before `save`.
- Add pruning reuse: `PruneStaleGossipMessages` interval already 1d; new type uses `expiry` + hard 28d delete.
**Files:** `crates/fiber-lib/src/fiber/gossip_policy.rs`
**Verify:** Test `test_swap_ad_rate_limited`: 6th ad in window rejected/delayed.

### W2-07 — Unit + integration tests
**Do:**
- Add tests in `crates/fiber-lib/src/fiber/tests/` (or `gossip.rs #[cfg(test)]`): `test_swap_ad_broadcast_persist`, `test_active_sync_carries_swap_ad`, `test_passive_filter_fanout`, `test_expiry_prune`.
- Run full `make check`, `make clippy`, `cargo nextest run --no-fail-fast` (expect some FIBER-specific heavy tests to need `RUST_TEST_THREADS=2`).
**Verify:** `cargo nextest run test_swap` subset green; clippy `-D warnings` clean; `make check-migrate` if schema touched.

### W2-08 — Two-node smoke (W2 milestone)
**Do:**
- Run two extended nodes `fnn-a` (hub) & `fnn-b` (listener) from W1-03 but on new build.
- On hub: RPC (new, minimal): `publish_swap_advertisement { asset_pair, rate, fee, expiry }` → signs with node sk, broadcasts via `TryBroadcastMessages`.
- On listener: confirm via store query / logs: `get_broadcast_messages` returns ad; listener prints.
- Capture: hub log “broadcast SwapAdvertisement {rate}”, listener log “received SwapAdvertisement”.
**Verify (W2 deliverable):** Screenshot/log showing hub broadcast → listener parsed pair+rate. No swap logic needed. This is the “first independently checkable proof” per proposal W2.

**W2 Exit Criteria:** `SwapAdvertisement` persists, syncs via both active `GetBroadcastMessages` and passive `BroadcastMessagesFilterResult`, survives restart, respects expiry/rate-limit. Two-node log captured to `docs/week2-smoke.md`.

---

## Cross-Cutting
- **Branching:** All work on `feat/swap-advertisement`; rebase weekly against upstream fork.
- **Compatibility:** Extended nodes only relay new type among themselves; unmodified nodes ignore (no hard fork). Document in `README`.
- **Docs per step:** Each `W*-0*` commits with message `WkX-SY: <summary>` and updates corresponding `docs/` note.
- **Not in W1-2:** `list_offers()`/`best_rate(pair)` index (W3), CLI query (W3), demo video + setup docs (W4), leap/swap generalization (out-of-scope deferred).

## Verification Map (for reviewer)
- W1: `docs/week1-checkpoint.md` + discussion URL + `docs/schema-draft.md`.
- W2: `git log --oneline W2*`, `cargo nextest run test_swap`, two-node smoke log in `docs/week2-smoke.md`.
