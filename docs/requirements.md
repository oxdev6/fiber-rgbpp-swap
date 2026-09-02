# Requirements — W1-05 (Scoped to $500/4w)

## Stakeholders
- **Hub operator** — runs extended `fnn` (`feat/swap-advertisement`), creates signed `SwapAdvertisement` (pair, rate, fee, expiry) and broadcasts via gossip.
- **Client/listener** — runs extended `fnn`, subscribes to gossip, indexes ads, queries `list_offers` / `best_rate(pair)` via RPC/CLI.
- **Unmodified node** — runs stock `fiber` develop; ignores new message type, unaffected (opt-in).
- **Reviewer/committee** — verifies via two-node log + demo + docs, no code review required.

## Problem (recap from Discussion #1243)
- CCH hard-coded to `BTC ↔ wrapped-BTC 1:1` fixed (`fiber` Discussion #1243, Apr 2026). No multi-pair, no negotiation, no discovery.
- RGB++ assets (isomorphic binding) already supported as channel asset class in Fiber protocol but have no CCH path; user forced to bridge/trusted third party.

## Functional Requirements (W1-2 only)
- **FR-01 Broadcast:** Hub can `publish_swap_advertisement { base_type_script, quote_type_script, rate Uint128, fee Uint64/Uint128, expiry Uint64 millis }` → node signs with operator `secp256k1` privkey (node_id), constructs `SwapAdvertisement` with `signature`, persists via `GossipMessageStore`, broadcasts via `GossipMessage::BroadcastMessagesFilterResult` to peers.
- **FR-02 Validation:** On receive, node verifies: `signature` over `blake2b_256(canonical_bytes_without_sig)` matches `operator_pubkey` (ECDSA as `NodeAnnouncement`), `expiry > now - drift` and not expired (`now+60s` drift as `MAX_BROADCAST_MESSAGE_TIMESTAMP_DRIFT`), `rate !=0`, `base/quote` distinct. Reject otherwise → `GossipViolation` / `Reverted` without storing.
- **FR-03 Relay:** Validated ad is stored (new `BroadcastMessage::SwapAdvertisement` id 3) and fanned out via `SubscribableGossipMessageStore` → `PeerFilterProcessor` → `BroadcastMessagesFilterResult` to all passive peers (same as `ChannelAnnouncement`).
- **FR-04 Persistence & Cursor:** Ad stored with `timestamp = advertised expiry?` vs `now` — use `now` as broadcast timestamp for `Cursor[45]` ordering (8 BE timestamp + union_id 3 + message_id hash of ad). Must be queryable via `get_broadcast_messages(after_cursor, limit)` ascending and `get_broadcast_messages_reverse`.
- **FR-05 Expiry pruning:** Expired ads not relayed after expiry; `PruneStaleGossipMessages` (1d) + additional `expiry`-based filter deletes expired entries even before 14d soft stale. `get_latest_swap_advertisement_timestamp(pubkey)` used for dedup/last-win.
- **FR-06 Query:** `get_broadcast_messages` after cursor returns ads alongside other broadcast types; no separate `BroadcastMessageQuery` flag needed for W1-2 (ads discovered via passive filter stream).

## Non-Functional
- **NFR-01 Opt-in:** Only extended nodes understand new union id; stock nodes ignore unknown `BroadcastMessage` id (no panic, no fork). Verified by stock node log ignoring unknown type.
- **NFR-02 Rate-limit:** Per-peer limit for `SwapAdvertisement` (suggest 5/min) via `GossipPolicyConfig` + `DelayedGossipMessageQueue` reuse; global byte cap shared with other broadcast messages.
- **NFR-03 No new transport:** Reuse existing gossip P2P (`/fiber/gossip` protocol id), no new service.

## Out-of-Scope (for this grant, deferred)
- Leap module (RGB++ `rgbpp-sdk` leap tx), swap execution generalization (CCH HTLC over second pair), orchestration/composition, JS client wrapper beyond CLI query, failure-recovery, mainnet/audit. See `docs/context.md` + original 6-week plan.

## Open Questions (to close in W1-06)
- Rate denom exact (quote per base fixed-point 1e8 vs Uint128 ratio)?
- Fee units (proportional millionths as `ChannelUpdate` vs absolute shannons)?
- `asset_pair` representation: full `Script` (code_hash/hash_type/args) vs `UdtScript` vs type `OutPoint`? Bias: full `ScriptOpt` as `ChannelAnnouncement.udt_type_script` does (`gossip.mol:75`).
- Signature scheme: ECDSA (match `NodeAnnouncement`) vs Schnorr (`ChannelAnnouncement.ckb_signature`)? Bias: ECDSA secp256k1.
- Cursor `message_id` for ad: `blake2b_256(ad_bytes_without_sig)` 32 + 4 padding, or `pubkey 33 + 3 zero` as `NodeAnnouncement`?

## Verification (W1-2)
- W1: `docs/schema-draft.md` + discussion post URL.
- W2: two-node smoke log in `docs/week2-smoke.md` showing hub broadcast → listener `SwapAdvertisement {pair, rate}` parsed.

