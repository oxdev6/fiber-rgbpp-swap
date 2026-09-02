# Week 3 Checkpoint — Discovery Index & Interface ($150)

**Date:** 2026-09-02 10:22 UTC
**Branch:** `work/fiber` `feat/swap-advertisement` @ `04e091b0` + W2/W3 patches (molecule `SwapAdvertisement` id 3, `protocol.rs` `SwapAdvertisement`, `types.rs` `BroadcastMessageWithTimestamp::SwapAdvertisement`, `gossip.rs` `GossipMessageStore` + `store_messages` + `verify_and_save`, `graph.rs` ignore, `store_impl` `save_swap_advertisement`, `swap_advertisement.rs` `SwapAdIndex`, `rpc/swap_ad.rs` `publish/list/get_best`, `rpc/mod.rs` merge, `fiber-json-types/src/swap_ad.rs` `Publish/List/Best` + `SwapOffer`)
**Build:** `cargo +1.95.0 build -p fiber-bin --features sqlite` **PASS** 3m15s (619M), `cargo +1.95.0 build -p fnn-cli` **PASS** 1m19s (93M), `cargo check -p fnn --features sqlite` **PASS** 23-48s, `cargo test -p fiber-types` 15 PASS, `cargo test -p fnn --lib swap_advertisement` 3 PASS (`test_list_offers_filters_expired`, `test_best_rate_picks_max`, `test_store_list_after_cursor`), `cargo check -p fnn-cli` **PASS**.

## W3-01 Design
- `docs/w3-01-api-design.md:1` — `SwapOfferView` (`base/quote ScriptOpt` via `EntityHex`, `rate`/`fee_rate` `U128Hex`, `Pubkey`, `timestamp`/`expiry` `U64Hex`, `chain_hash` `Hash256`, `is_expired`), `AssetPairFilter` exact `Script` match, RPC `publish_swap_advertisement(PublishSwapAdParams) -> SwapOffer`, `list_swap_advertisements(ListSwapAdsParams) -> ListSwapAdsResult`, `get_best_swap_rate(GetBestSwapRateParams) -> GetBestSwapRateResult`, CLI `fnn-cli swap_ad publish_swap_advertisement --rate --fee-rate --expiry-delta-millis` + `list_swap_advertisements` + `get_best_swap_rate`.

## W3-02 Store Listing
- `gossip.rs:372` `get_swap_advertisements(after_cursor, limit)` via `get_broadcast_messages` filter `SwapAdvertisement` + `get_active_swap_advertisements(now)` via `is_expired`, `store_impl/mod.rs:1851` `save_swap_advertisement` + `get_latest_swap_advertisement_timestamp` (hash = `blake2b_256(message_to_sign)` double blake, `Cursor::new(timestamp, SwapAdvertisement(hash))`).

## W3-03 Index
- `swap_advertisement.rs:1` `SwapAdIndex<S: GossipMessageStore>` `new(store)`, `list_offers(filter, now)` (`get_active` + `AssetPairFilter::matches` + sort `rate` desc + `timestamp` desc), `best_rate(base, quote, now)` (`list_offers` max), `list_with_cursor`. Tests use `crate::tests::test_utils::generate_store()` + `dummy_script` (`Script::new_builder` + `Byte32::from_slice`).

## W3-04/05 RPC
- `rpc/swap_ad.rs:1` `SwapAdRpc` trait `publish_swap_advertisement(PublishSwapAdParams) -> SwapOffer` (reads `CkbConfig::read_secret_key` → `Privkey`, `now+expiry_delta`, `SwapAdvertisement::new_signed`, `verify`, `store.save_swap_advertisement`), `list_swap_advertisements(ListSwapAdsParams) -> ListSwapAdsResult` (via `SwapAdIndex`), `get_best_swap_rate(GetBestSwapRateParams) -> GetBestSwapRateResult`. Conversions `json_script_to_packed`/`packed_to_json_script` via `s.into()` (`ckb_jsonrpc_types::Script` ↔ `ckb_types::packed::Script`), `Hash256`/`Pubkey` via `From` (`fiber_types` ↔ `fiber_json_types`), `ad_to_offer` (`rate`/`fee_rate` as `U128Hex`).

## W3-06 CLI
- `fiber-json-types/src/swap_ad.rs:1` `PublishSwapAdParams`/`ListSwapAdsParams`/`GetBestSwapRateParams`/`SwapOffer`/`ListSwapAdsResult`/`GetBestSwapRateResult` (all `#[serde_as]` `U128Hex`/`U64Hex`, `Script` via `ckb_jsonrpc_types::Script`), `fiber-json-types/src/lib.rs:1` `pub mod swap_ad`, `rpc/swap_ad.rs` auto-discovered by `crates/fiber-cli/build.rs` (scans `fiber-lib/src/rpc` for `#[rpc(server)]` + `fiber-json-types/src` for `*Params`), `fnn-cli` `swap_ad` group `publish_swap_advertisement`/`list_swap_advertisements`/`get_best_swap_rate` **PASS** (`fnn-cli --help` shows `swap_ad`, `fnn-cli swap_ad --help` lists 3, `publish_swap_advertisement --help` shows `--base-udt-script`/`--quote-udt-script`/`--rate`/`--fee-rate`/`--expiry-delta-millis`).

## W3-07 Tests
- `cargo test -p fiber-types` 15 PASS (4 new `swap_advertisement_*`), `cargo test -p fnn --lib swap_advertisement` 3 PASS, `cargo check -p fnn --features sqlite` PASS, `cargo check -p fnn-cli` PASS.

## W3-08 Smoke (Two-Node)
- Nodes `QmXus9zm...` `8828/8327` + `QmdccqCx...` `8829/8328`, `bootnode_addrs: []` clean stores, `FIBER_SECRET_KEY_PASSWORD=test123`, `ckb/key` 77b, `chain_hash` `0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606`.
- Sequence: `8327 publish 0x2540be400` → `8327 list` 1, `8327 connect_peer 8829/QmdccqCx...` → `8328 list` after 5s 1 (first batch, `GetBroadcastMessages(after_cursor 0, count 100)` includes swap ad, `PeerFilterProcessor` not needed), `8327 publish 0x4a38b2e00` → `8327 list` 2, `8328 list` after 5s 1, after 20s (next `GetBroadcastMessages` with `after_cursor` = last batch's cursor) 2, `8328 get_best` → `0x4a38b2e00` max, `fnn-cli swap_ad list_swap_advertisements` on both shows 2, `get_best_swap_rate` shows max — **PASS** (see `docs/week3-smoke.md:1` for curl logs).

## Next
- **W4 ($100)** — Testing, demo, documentation: formal `docs/week3-smoke.md` already captured, now `docs/setup.md` for hub, `docs/week4-demo` video, post to Discussion #1243, `cargo clean` and final `make check`/`clippy`.

## Reviewer Check
- `cat docs/w3-01-api-design.md` — 3 RPC + CLI defined
- `cargo check -p fnn --features sqlite` — PASS
- `cargo test -p fiber-types` + `cargo test -p fnn --lib swap_advertisement` — 18 PASS
- `curl`/`fnn-cli` sequence above — `publish` → `list` → `connect` → `list` → `get_best` — all **PASS** (`docs/week3-smoke.md`).
