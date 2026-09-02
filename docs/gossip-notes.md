# Gossip Notes — W1-04 Deep Read

**Source files read (work/fiber @04e091b0):**
- `crates/fiber-types/src/schema/gossip.mol:1` — `Cursor[45]`, `BroadcastMessage` union, `GossipMessage` union, `NodeAnnouncement`/`ChannelAnnouncement` tables, `ChannelUpdate` struct
- `crates/fiber-types/src/schema/fiber.mol:1` — `ChannelUpdate` struct (EcdsaSignature, timestamp, tlc deltas)
- `crates/fiber-types/src/schema/blockchain.mol:1` — base types
- `crates/fiber-lib/src/fiber/gossip.rs:1` — `GossipMessageStore` trait, `GossipActor`/`GossipSyncingActor`/`PeerFilterProcessor`, `DelayedGossipMessageQueue`, constants
- `crates/fiber-lib/src/fiber/types.rs` — `BroadcastMessageWithTimestamp`, `GossipMessage` re-exports

## 1. Broadcast Cursor
- **Type:** `array Cursor [byte;45]` (`gossip.mol:17`): `timestamp(8 BE) + union_id(1) + message_id(36)`.
  - `0: ChannelAnnouncement → channel_outpoint 36`
  - `1: ChannelUpdate → channel_outpoint 36`
  - `2: NodeAnnouncement → node_id 33 + 3 zero padding`
- **Ordering:** dictionary order → `after_cursor` means “after timestamp” effectively. `get_broadcast_messages(after_cursor, limit)` returns ascending; `..._reverse` descending.
- **Drifts:** `MAX_BROADCAST_MESSAGE_TIMESTAMP_DRIFT=60s` (`gossip.rs:90`), `MAX_MISSING_BROADCAST_MESSAGE_TIMESTAMP_DRIFT=2h` (`gossip.rs:75`), `SOFT 14d / HARD 28d` stale, prune interval `1d` (`gossip.rs:81-88`).

## 2. BroadcastMessage Union
```mol
union BroadcastMessage { NodeAnnouncement, ChannelAnnouncement, ChannelUpdate } // gossip.mol:79
```
- `NodeAnnouncement` (`gossip.mol:37`): `signature(EcdsaSignature 64) + features + timestamp Uint64 + node_id Pubkey(33) + chain_hash Byte32 + udt_cfg_infos ...`
- `ChannelAnnouncement` (`gossip.mol:59`): `node1/2_signature Ecdsa, ckb_signature Schnorr 64, features Uint64, chain_hash, channel_outpoint OutPoint, node1/2_id Pubkey, ckb_key SchnorrXOnly 32, capacity Uint128, udt_type_script ScriptOpt`
- `ChannelUpdate` (`fiber.mol:264` struct): `signature Ecdsa, chain_hash, channel_outpoint, timestamp Uint64, message_flags Uint32, channel_flags Uint32, tlc_expiry_delta Uint64, tlc_minimum_value Uint128, ...`
- Signing: `NodeAnnouncement` & `ChannelUpdate` ECDSA secp256k1 (`SECP256K1` `gossip.rs:2`); `ChannelAnnouncement` includes `ckb_signature` Schnorr over funding key.

## 3. GossipMessage Union
```mol
union GossipMessage { BroadcastMessagesFilter, BroadcastMessagesFilterResult, GetBroadcastMessages, GetBroadcastMessagesResult, QueryBroadcastMessages, QueryBroadcastMessagesResult } // gossip.mol:142
```
- `BroadcastMessagesFilter {chain_hash, after_cursor}` — passive subscribe: “send all after cursor”
- `BroadcastMessagesFilterResult {messages: BroadcastMessages}` — fanout result
- `GetBroadcastMessages {id Uint64, chain_hash, after_cursor Cursor, count Uint16}` — active sync batch (DEFAULT 100 `gossip.rs:94`)
- `GetBroadcastMessagesResult {id, messages}`
- `QueryBroadcastMessages {id, chain_hash, queries: BroadcastMessageQueries}` — on-demand fetch for missing dependencies; flags bits 0-4: ChannelAnnouncement / ChannelUpdate n1/n2 / NodeAnnouncement n1/n2 (`gossip.mol:22`)
- `QueryBroadcastMessagesResult {id, messages, missing_queries: MissingQueryIndexes}`

## 4. Store Trait (`gossip.rs:203`)
```rust
trait GossipMessageStore {
  fn get_broadcast_messages(after_cursor: &Cursor, limit: usize) -> Vec<BroadcastMessageWithTimestamp> // asc
  fn get_broadcast_messages_reverse(before_cursor: Option<&Cursor>, limit: usize) -> Vec<...> // desc
  fn query_broadcast_messages(queries) -> (Vec<...>, Vec<u16> missing)
  fn get_broadcast_message_with_cursor(cursor) -> Option<...>
  fn get_latest_broadcast_message_cursor() -> Option<Cursor>
  fn get_latest_*_timestamp(...) -> Option<u64>
  fn save_channel_announcement(timestamp, ChannelAnnouncement)
  fn save_channel_update(ChannelUpdate)
  fn save_node_announcement(NodeAnnouncement)
  // + delete_broadcast_message(cursor), timestamps iter
}
```
`ExtendedGossipMessageStore` wraps store + `GossipMessageUpdates{messages}` fanout via `SubscribableGossipMessageStore::subscribe(cursor, receiver, converter)` (`gossip.rs:426`).

## 5. Sync Modes
- **ActiveGet:** `GossipSyncingActor` (`gossip.rs:858`) per peer: `NewGetRequest` → `GetBroadcastMessages(after_cursor=cursor, count=100)` → on `ResponseReceived` → `store.SaveActiveSyncMessages(peer, messages)` → `Validated(new_cursor)` / `Pending(defer 500ms)` / `Rejected(violation)` → loop until empty → `ActiveSyncingFinished`. Timeout `20s` (`GET_REQUEST_TIMEOUT`), fail retry `10s`.
- **PassiveFilter:** `PeerFilterProcessor` (`gossip.rs:1161`) subscribes via store `subscribe(cursor)` → on `NewStoreUpdates` → `BroadcastMessagesFilterResult` pushed to peer. `update_subscription(cursor)` advances filter.
- **PeerSyncStatus:** `NotSyncing / ActiveGet(session) / PassiveFilter(cursor) / FinishedActiveSyncing`. Target counts: `MAX 3 active`, `MIN 3 passive outbound` (`gossip.rs:102-104`). Maintenance `TickNetworkMaintenance` ensures enough peers.

## 6. Validation & Policy
- **Signature & timestamp:** `max_acceptable_gossip_message_timestamp = now+60s` (`gossip.rs:140`); stale 14d, delete 28d; per-message `filter_messages_with_returned_dependencies` ensures ChannelUpdate only saved if its ChannelAnnouncement exists (dependency).
- **Rate-limit:** `GossipPolicyConfig` + `ChannelUpdateLimiter` + `DelayedGossipMessageQueue` (`gossip.rs:752`) per-peer capacity + global bytes + `GossipViolation` for malicious peer → `MaliciousPeerFound`.
- **Metrics:** `gossip_metrics.rs` (sent/received bytes, duplicate, rejected, propagation latency).

## 7. Call Sites to Extend for SwapAdvertisement (for W2)
1. **`fiber-types/src/schema/gossip.mol`** — add `SwapAdvertisement` table + extend `BroadcastMessage` union (new union id 3), extend `Cursor` doc, extend `BroadcastMessageQuery` flags if queryable, add to `GossipMessage` if needed (likely not — broadcast via existing Filter/Result).
2. **`fiber-types/src/gen/gossip.rs` + `protocol.rs`** — regen via `molecule` (ensure `fiber-types` build).
3. **`crates/fiber-lib/src/fiber/gossip.rs`** — `broadcast_message_type()` (`gossip.rs:144`), `GossipMessageStore` trait + `ExtendedGossipMessageStore` save/get, `GossipActor` `TryBroadcastMessages` & validation, `Subscribable` fanout (generic, likely auto), `DelayedGossipMessageQueue` capacity, `GossipPolicy` new violation.
4. **`crates/fiber-lib/src/fiber/types.rs`** — `BroadcastMessageWithTimestamp` enum + `Cursor` `BroadcastMessageID` conversion.
5. **`crates/fiber-lib/src/store/`** — concrete `Store` impl (rocksdb/sqlite) new prefix, timestamp index.

## 8. Existing Tests / Checks
- `make check` verifies 4 configs (`gossip.rs` Makefile); `cargo nextest run -p fiber-types` covers molecule serde.
- `docs/notes/gossip.md` notes pipeline: `SaveActiveSyncMessages → ActiveSyncSaveMessagesResult::{Validated, Pending, Rejected}`; eclipse resistance via 3 outbound passive peers.

**Verified:** Files read, cursor/message flow mapped, 3 extension call sites identified for `SwapAdvertisement` insertion following same pattern as `NodeAnnouncement`/`ChannelAnnouncement`.
