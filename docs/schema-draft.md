# Schema Draft — SwapAdvertisement (W1-06)

**Status:** Draft for review before W2-01 implementation. To be posted to Discussion #1243 (W1-07).

## 1. Motivation & Reuse
- Follows `NodeAnnouncement` (`gossip.mol:37`) pattern: `EcdsaSignature(64) + timestamp + pubkey + chain_hash` + payload.
- Uses existing primitive types (`blockchain.mol`): `Script`, `ScriptOpt`, `Pubkey[33]`, `Byte32`, `Uint64`, `Uint128`, `EcdsaSignature[64]`.
- No new crypto: `blake2b_256` + secp256k1 ECDSA as `gossip.rs:2` (`SECP256K1`).

## 2. Molecule Schema (proposed `crates/fiber-types/src/schema/gossip.mol` patch)

```mol
// Existing imports
import blockchain;
import fiber;

// ... existing Cursor, BroadcastMessageQuery etc. ...

// NEW: SwapAdvertisement — operator's signed rate for one asset pair
// Signature covers blake2b_256 of molecule bytes of SwapAdvertisement without signature field
// (i.e., serialize table with signature = 0, then hash). Mirrors NodeAnnouncement signing.
table SwapAdvertisement {
    // ECDSA signature (64 bytes compact) over blake2b_256(canonical_bytes)
    signature: EcdsaSignature,
    // Chain hash (ckb_testnet / mainnet) — prevents cross-chain replay
    chain_hash: Byte32,
    // Asset pair: base = RGB++-derived UDT (or any UDT), quote = target CKB UDT
    // Using ScriptOpt to allow CKB-native (None) if needed, but for this grant both Some
    base_udt_script: ScriptOpt,
    quote_udt_script: ScriptOpt,
    // Rate: quote amount per 1 base unit, fixed-point with denominator 1_000_000_00 (1e8) ?
    // For W1-2, define as Uint128 ratio = quote_per_base * 1e8, document denom.
    // Example: 1 RUSD = 100 CKB => rate = 100 * 1e8 = 10_000_000_000
    rate: Uint128,
    // Fee: proportional millionths (as ChannelUpdate.tlc_fee_proportional_millionths) OR absolute
    // For W1-2, use tlc_fee_proportional_millionths style: fee_rate Uint128 (per million)
    fee_rate: Uint128,
    // Operator node pubkey (33 compressed) — must match signature recovery
    operator_pubkey: Pubkey,
    // Broadcast timestamp (millis since epoch) — used for Cursor ordering (first 8 bytes)
    timestamp: Uint64,
    // Expiry timestamp (millis) — ad invalid after this; also used for pruning
    expiry: Uint64,
}

// Extend BroadcastMessage union (id 3 = SwapAdvertisement)
union BroadcastMessage {
    NodeAnnouncement,
    ChannelAnnouncement,
    ChannelUpdate,
    SwapAdvertisement,
}
```

**Notes:**
- `base_udt_script` / `quote_udt_script` use `ScriptOpt` to mirror `ChannelAnnouncement.udt_type_script` (`gossip.mol:75`). For RGB++ case, `Script` will be xUDT type script (code_hash/type/args). Allow `None` for CKB native in future.
- `chain_hash` included to bind to testnet/mainnet (`get_chain_hash()` as `gossip.rs:1126` does for GetBroadcastMessages).
- `timestamp` separate from `expiry` — `timestamp` drives `Cursor` ordering (consistent with other broadcasts), `expiry` drives validity.
- Alternative considered: single `pair: AssetPair` table wrapping two scripts — rejected to keep flat table and avoid extra union id.

## 3. Cursor & Message ID (extends `gossip.mol:17` spec)

- **Current:** `Cursor[45] = timestamp(8 BE) + union_id(1) + message_id(36)` where
  - `0: ChannelAnnouncement → outpoint 36`
  - `1: ChannelUpdate → outpoint 36`
  - `2: NodeAnnouncement → node_id 33 + 3 zero`
- **Proposed for SwapAdvertisement (union_id = 3):**
  - `message_id = blake2b_256(SwapAdvertisement without signature) [32] + 4 zero padding` → total 36 (to keep Cursor 45). Or `operator_pubkey 33 + 3 zero` + timestamp ensures per-operator latest wins (like NodeAnnouncement dedup). **Proposal: 32-byte hash + 4 zero** — gives content-addressed id, expiry changes produce new cursor (later timestamp → later cursor → relayed as update). `get_latest_swap_advertisement_timestamp(pubkey)` will still be needed for “latest per operator” semantics if multiple pairs per operator (future). For W1-2 single pair, hash-id is sufficient.

## 4. Signing & Verification

- **Signing:** `msg = blake2b_256(molecule_bytes(table with signature field zeroed 64 bytes))`; `secp256k1::SECP256K1.sign_ecdsa(&msg, &sk)` → 64 compact. Store in `signature`.
- **Verification:** recompute `msg` same way, `SECP256K1.verify_ecdsa(&msg, &sig, &operator_pubkey)`; also check `operator_pubkey` matches recovered if using recoverable variant — but we use plain `EcdsaSignature` as `NodeAnnouncement` does (requires explicit pubkey, no recovery).
- **Timestamp/expiry checks:** `now = now_timestamp_as_millis_u64()` (`gossip.rs` uses same). Accept if `timestamp <= now + 60s` (`MAX_BROADCAST_MESSAGE_TIMESTAMP_DRIFT`) and `expiry > now` and `timestamp <= expiry`. Reject expired or far-future timestamp.

## 5. Example JSON (for RPC `publish_swap_advertisement`)

```json
{
  "chain_hash": "0x92b197aa1fba0f63633922c61c92375c9c074a93e85963554f5499fe1450d0e5",
  "base_udt_script": {
    "code_hash": "0x1142755a044bf2ee358cba9f2da187ce928c91cd4dc8692ded0337efa677d21a",
    "hash_type": "type",
    "args": "0x878fcc6f1f08d48e87bb1c3b3d5083f23f8a39c5d5c764f253b55b998526439b"
  },
  "quote_udt_script": null,
  "rate": "10000000000",
  "fee_rate": "3000",
  "operator_pubkey": "02ab...",
  "timestamp": "1725110400000",
  "expiry": "1725196800000"
}
```

## 6. Store & Gossip Integration Sketch (for W2)
- `GossipMessageStore::save_swap_advertisement(timestamp, SwapAdvertisement)` — new prefix, store by `Cursor`.
- `BroadcastMessage::SwapAdvertisement` handled in `broadcast_message_type()` (`gossip.rs:144`) + `filter_messages_with_returned_dependencies` (no dep, always pass).
- `GossipActor` `TryBroadcastMessages` persists + fanout via `GossipMessageUpdates` → `PeerFilterProcessor` → `BroadcastMessagesFilterResult`.
- No `BroadcastMessageQuery` flag extension needed for W1-2 (passive stream covers); optional future `flags bit 5` for on-demand query.

## 7. Open Items to Close in W2
- Exact `rate` denom (1e8 vs raw Uint128 ratio) — document and enforce `rate !=0`.
- `fee_rate` semantics — align with `ChannelUpdate.tlc_fee_proportional_millionths` (per million) for consistency.
- Whether to include `version: byte` for future upgrade — can be added as `Uint8` field now with default `1` without breaking molecule (table is extensible if last field).

## 8. Next Step
Post this draft as gist / Discussion #1243 comment (W1-07) asking: “Any objection to this schema / union_id 3 / Ecdsa + blake2b?” Close duplicate-effort risk.

**Files to edit in W2-01:** `crates/fiber-types/src/schema/gossip.mol`, `crates/fiber-types/src/gen/gossip.rs` (cargo gen), `crates/fiber-types/src/` Rust wrapper, `crates/fiber-lib/src/fiber/types.rs`, `crates/fiber-lib/src/fiber/gossip.rs`, `crates/fiber-lib/src/store/*`.

