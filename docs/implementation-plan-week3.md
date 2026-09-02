# Implementation Plan — Week 3 (Discovery Index & Interface)

**Scope:** Revised Spark $500/4w, Week 3 — $150 — *Discovery index and interface* (Post #20). Builds on W2 gossip integration (union id 3, store, verify, relay). Each step ≤ 0.5–1 day, independently checkable.

**Goal (from proposal):** Build listening-side index (`list_offers()`, `best_rate(pair)`), expose via API endpoint, wire CLI so user can query live advertisements. Verification: listener queries live ads from hub via CLI/API.

**Context files to extend (work/fiber @04e091b0 + feat/swap-advertisement):**
- `crates/fiber-types/src/protocol.rs` — `SwapAdvertisement` already
- `crates/fiber-lib/src/fiber/gossip.rs` — `GossipMessageStore`, `BroadcastMessageWithTimestamp`
- `crates/fiber-lib/src/store/store_impl/mod.rs` — `GossipMessageStore` impl (already has `save_swap_advertisement`)
- `crates/fiber-lib/src/rpc/` — `mod.rs`, `README.md` (gen), existing `graph.rs`/`network.rs` RPC
- `crates/fiber-cli/src/` — CLI crate
- `crates/fiber-lib/src/fiber/types.rs` — `BroadcastMessageWithTimestamp`

---

## W3-01 — Design discovery API surface (0.5d)
**Input:** `docs/requirements.md` FR-06, `docs/schema-draft.md`, existing RPC patterns (`crates/fiber-lib/src/rpc/README.md`).
**Do:**
- Define function signatures:
  ```rust
  // In-memory + store-backed
  fn list_offers(filter: Option<AssetPairFilter>) -> Vec<SwapOfferView>
  fn best_rate(pair: AssetPair) -> Option<SwapOfferView>
  struct SwapOfferView {
    base_udt_script: Option<Script>,
    quote_udt_script: Option<Script>,
    rate: u128, // quote per base *1e8
    fee_rate: u128,
    operator_pubkey: Pubkey,
    timestamp: u64,
    expiry: u64,
    chain_hash: Hash256,
    // derived
    is_expired: bool,
  }
  struct AssetPairFilter { base_code_hash: Option<Byte32>, quote_code_hash: Option<Byte32> }
  ```
- Decide RPC names: `list_swap_advertisements` (returns `Vec<SwapOfferView>`) + `get_best_swap_rate` (pair → single). Follow existing `rpc` naming (`list_channels`, `graph_channels`).
- Decide CLI names: `fnn swap-ad list [--base <args> --quote <args>]` + `fnn swap-ad best --base --quote` (or `fiber-cli swap list`).
**Files:** `docs/w3-01-api-design.md` (new)
**Verify:** Doc exists, approved by reviewer; lists 2 RPC + 2 CLI commands with example JSON.

## W3-02 — Store listing helpers (0.5d)
**Do:**
- Add to `GossipMessageStore` trait (`gossip.rs:340`):
  ```rust
  fn get_swap_advertisements(&self, after_cursor: Option<&Cursor>, limit: usize) -> Vec<(Cursor, SwapAdvertisement)>;
  fn get_active_swap_advertisements(&self, now: u64) -> Vec<SwapAdvertisement> // filters expiry > now
  ```
  Default impl for second via first + `is_expired(now)` (uses `SwapAdvertisement::is_expired` from `protocol.rs`).
- Implement for `Store` (`store_impl/mod.rs:1851` after `save_swap_advertisement`):
  - `get_swap_advertisements` scans prefix `BROADCAST_MESSAGE_PREFIX` via `collect_by_prefix`, deserializes `BroadcastMessage::SwapAdvertisement`, filters by `Cursor > after_cursor` if Some, sorts ascending, truncates `limit`, returns `(Cursor, ad)`.
  - Reuse existing `get_broadcast_messages` pattern but filter type. For W3 minimal, implement by calling `get_broadcast_messages(after_cursor, limit)` and filtering `BroadcastMessageWithTimestamp::SwapAdvertisement`.
- Add `get_latest_swap_advertisement_by_operator(&Pubkey) -> Option<SwapAdvertisement>` if needed for dedup per operator (optional, not required for list).
**Files:** `crates/fiber-lib/src/fiber/gossip.rs`, `crates/fiber-lib/src/store/store_impl/mod.rs`
**Verify:** `cargo +1.95.0 check -p fnn --no-default-features --features sqlite` — **PASS** (no new match errors). Unit test stub `test_store_get_swap_advertisements` compiles.

## W3-03 — In-memory index + subscription (0.5d)
**Do:**
- Create `crates/fiber-lib/src/fiber/swap_advertisement.rs` (new) with `SwapAdIndex`:
  ```rust
  pub struct SwapAdIndex<S: GossipMessageStore> { store: S, cache: RwLock<HashMap<Hash256, SwapAdvertisement>> }
  impl SwapAdIndex {
    pub fn new(store: S) -> Self { /* load active from store at init */ }
    pub fn list_offers(&self, filter: Option<AssetPairFilter>, now: u64) -> Vec<SwapOfferView> // filters expiry, matches scripts, sorts by rate desc
    pub fn best_rate(&self, base: &Option<Script>, quote: &Option<Script>) -> Option<SwapOfferView> // max rate or min fee?
    pub async fn start_subscription(&self, gossip_store: impl SubscribableGossipMessageStore) // subscribe Cursor::default(), on GossipMessageUpdates push SwapAdvertisement into cache, evict expired
  }
  ```
  For W3 minimal, **no background subscription** — just query store directly on each RPC call (simpler, no new actor). Document that subscription is future (W4) for push efficiency.
- Register `SwapAdIndex` in `NetworkActor` or `GossipActor` state if needed, or keep as standalone queried by RPC.
**Files:** `crates/fiber-lib/src/fiber/swap_advertisement.rs` (new), `crates/fiber-lib/src/fiber/mod.rs` (mod declare)
**Verify:** `cargo check -p fnn` — **PASS**. `SwapAdIndex::list_offers` unit test with 2 ads (one expired filtered) passes.

## W3-04 — RPC: publish_swap_advertisement (hub side) (0.5d)
**Do:**
- Add RPC in `crates/fiber-lib/src/rpc/` — new file `swap_ad.rs` or extend `crates/fiber-lib/src/rpc/graph.rs`:
  ```rust
  #[rpc(server)]
  pub trait SwapAdRpc {
    #[method(name = "publish_swap_advertisement")]
    async fn publish_swap_advertisement(&self, base_udt_script: Option<Script>, quote_udt_script: Option<Script>, rate: u128, fee_rate: u128, expiry_delta_millis: u64) -> Result<SwapAdvertisement, Error>;
  }
  ```
  Handler: get `Privkey` via `CkbConfig::read_secret_key()` (as `config.rs:114`), `Timestamp::now()`, `expiry = now + delta`, `chain_hash = get_chain_hash()`, `SwapAdvertisement::new_signed(chain_hash, base, quote, rate, fee_rate, &privkey, now, expiry)`, verify, `store.save_swap_advertisement(ad.clone())`, then `gossip_actor.send_message(TryBroadcastMessages(vec![BroadcastMessageWithTimestamp::SwapAdvertisement(ad.clone())]))` (as `gossip.rs:1853` does for node).
- Register RPC in `crates/fiber-lib/src/rpc/mod.rs` `RpcServer` impl.
- Update `crates/fiber-lib/src/rpc/README.md` via `make gen-rpc-doc` (check `fiber-rpc-gen 0.1.22`).
**Files:** `crates/fiber-lib/src/rpc/swap_ad.rs` (new), `crates/fiber-lib/src/rpc/mod.rs`, `crates/fiber-lib/src/rpc/README.md`
**Verify:** `cargo check -p fnn` — **PASS**. Manual: `curl -X POST http://127.0.0.1:8327 -d '{"id":1,"jsonrpc":"2.0","method":"publish_swap_advertisement","params":[...]}'` returns signed ad JSON (needs running node, but handler compiles).

## W3-05 — RPC: list + best_rate (listener side) (0.5d)
**Do:**
- Add to same `SwapAdRpc` trait:
  ```rust
  #[method(name = "list_swap_advertisements")]
  async fn list_swap_advertisements(&self, filter: Option<AssetPairFilter>) -> Result<Vec<SwapOfferView>, Error>;
  #[method(name = "get_best_swap_rate")]
  async fn get_best_swap_rate(&self, base: Option<Script>, quote: Option<Script>) -> Result<Option<SwapOfferView>, Error>;
  ```
  Handlers: query `SwapAdIndex::list_offers` / `best_rate` via store scan (`get_active_swap_advertisements(now)`), map to `SwapOfferView` (hex for scripts, string for pubkey, `rate` as decimal string if u128 > JS).
- Ensure `SwapOfferView` is `Serialize` via `serde_with` (as other RPC types in `fiber-json-types`).
**Files:** `crates/fiber-lib/src/rpc/swap_ad.rs`, `crates/fiber-json-types/src/` (if new view type)
**Verify:** `cargo check -p fnn` — **PASS**. `cargo clippy -p fnn --no-default-features --features sqlite -- -D warnings` — **PASS** (allow `too_many_arguments` if needed).

## W3-06 — CLI wiring (0.5d)
**Do:**
- Extend `crates/fiber-cli/src/` (check existing `fiber-cli/src/args.rs`):
  ```rust
  #[derive(Subcommand)]
  enum SwapAdCommand { Publish { base, quote, rate, fee_rate, expiry_delta }, List { base, quote }, Best { base, quote } }
  ```
  Implement `fn run_swap_ad(cmd, rpc_url)` that calls `jsonrpsee` `http_client` to RPC (`publish_swap_advertisement`, `list_swap_advertisements`, `get_best_swap_rate`) and prints table/JSON.
- Alternative if `fiber-cli` not used: add to `crates/fiber-bin/src/main.rs` via `clap` args (simpler, keep in `fnn` binary).
- For minimal, implement **only `list` + `best`** (hub publish can be via RPC curl for W2 smoke, CLI publish is stretch).
**Files:** `crates/fiber-cli/src/main.rs` or `crates/fiber-bin/src/args.rs`, `crates/fiber-cli/Cargo.toml` if new dep
**Verify:** `cargo check -p fiber-cli --no-default-features --features sqlite` — **PASS**. Manual: `fiber-cli swap-ad list --rpc http://127.0.0.1:8328` prints `[]` initially.

## W3-07 — Tests (0.5d)
**Do:**
- **Unit:** `crates/fiber-lib/src/fiber/tests/swap_ad.rs` (new) — `test_list_offers_filters_expired`, `test_best_rate_picks_max`, `test_store_list_after_cursor`.
- **Integration:** `crates/fiber-lib/src/store/tests/store.rs` — add `test_store_save_swap_advertisement_and_get` (save 2 ads, one expired, verify `get_active` returns 1, `get_swap_advertisements` with `after_cursor` pagination).
- Run: `cargo +1.95.0 test -p fiber-types` (existing 15 + 4 new) + `cargo +1.95.0 test -p fnn --no-default-features --features sqlite -p fiber-store` (store tests) — expect **PASS**.
**Files:** `crates/fiber-types/src/protocol.rs` (already has 4 tests, add 2 more for filter), `crates/fiber-lib/src/store/tests/store.rs`, `crates/fiber-lib/src/fiber/swap_advertisement.rs` (unit)
**Verify:** `cargo test -p fiber-types` — **PASS**, `cargo check -p fnn` — **PASS**.

## W3-08 — Two-node manual demo prep (0.5d)
**Do:**
- Reuse `work/fnn-a` (hub 8828/8327) + `work/fnn-b` (listener 8829/8328) configs from W1-03 (already have `work/fnn-a/b/config.yml`).
- Steps (to be recorded in `docs/week3-smoke.md` after W2 disk freed):
  1. `FIBER_SECRET_KEY_PASSWORD=xxx ./target/debug/fnn -c work/fnn-a/config.yml -d work/fnn-a` (hub) + `work/fnn-b` (listener), wait peer connected (`list_peers`).
  2. Hub: `curl -X POST http://127.0.0.1:8327 -d '{"method":"publish_swap_advertisement","params":[...]}'` → gets ad `rate 10000000000`.
  3. Listener: `curl -X POST http://127.0.0.1:8328 -d '{"method":"list_swap_advertisements","params":[null]}'` → returns `[ {rate, fee_rate, operator_pubkey} ]` within ~5s (gossip relay via `BroadcastMessagesFilterResult`).
  4. Listener CLI: `fiber-cli --rpc 127.0.0.1:8328 swap-ad list` → same, `swap-ad best --base ... --quote ...` → best.
- **Blocker:** Same disk as W2-08 (`3G` free needed). Plan to `rm -rf work/fiber/target` then `CARGO_TARGET_DIR=/tmp/...` or clean `logos/.../target` with approval.
**Files:** `docs/week3-smoke.md` (template), `docs/w3-08-manual.md` (commands)
**Verify:** Screenshot/log showing `list_swap_advertisements` returns hub's `rate` on listener.

---

## Cross-Cutting
- **Branch:** `feat/swap-advertisement` (same as W2).
- **Compat:** No new gossip union id beyond W2's 3; RPC is opt-in, unmodified nodes ignore new RPC method (404).
- **Docs:** Each W3-* commits as `W3-SY: <summary>` + updates `docs/week3-progress.md`.
- **Not in W3:** JS client wrapper, expiry auto-prune background task (reuse existing 1d prune), `publish` CLI (if time, stretch), W4 demo video + setup docs.

## Verification Map (for reviewer per Post #20 W3)
- W3 deliverable: `list_offers()` + `best_rate(pair)` + API + CLI query.
- **Check 1:** `cat docs/w3-01-api-design.md` — 2 RPC + 2 CLI defined.
- **Check 2:** `cargo check -p fnn --no-default-features --features sqlite` — PASS + `cargo test -p fiber-types` — 15+ new PASS.
- **Check 3:** Manual (when disk): `curl list_swap_advertisements` on listener prints hub ad `rate` (log in `docs/week3-smoke.md`).

## Dependencies on W2
- W2's `SwapAdvertisement` + store + gossip verify/relay must be merged (already `cargo check -p fnn` PASS). W3 reuses that; no rebase needed.

