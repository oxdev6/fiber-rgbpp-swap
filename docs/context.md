# Context — Distilled Understanding (Scrapped Broad Dive → Scope-Only)

> Instruction: scrap broad RGBPlusPlus website dive and full Fiber deep-dive; retain only scope-relevant context for the **approved $500/4-week advertisement-layer grant**. Prior explorations remain in `/tmp/opencode/rgbpp-website` and `/home/agate/Projects/docs.nervos.org/fiber` for reference but are not carried into implementation assumptions.

## 1. Problem Statement (per approved proposal)

- Fiber CCH today: **one asset pair only** (BTC ↔ hard-coded wrapped-BTC type script), **fixed 1:1**, no negotiation/discovery, no way to add second pair — per `nervosnetwork/fiber` Discussion #1243 (April 2026). Team's own proposed fix: **signed operator advertisements** broadcast via gossip.
- RGB++ assets (isomorphic binding: Bitcoin UTXO ↔ CKB Cell, single-use-seal, OP_RETURN commitment, SPV MMR, leap to UDT) are **already listed as a supported Fiber channel asset class** at protocol level but have **no CCH path** — user must use slow/trusted bridge.
- Gap: two same-team primitives (RGB++ and Fiber) don't interoperate; advertisement layer is the missing market/discovery piece. Analogous to **Lightning Liquidity Ads**.

## 2. Scope Boundary (What to Build vs What NOT to Build)

**Build (4 weeks):**
- `SwapAdvertisement` gossip message type: fields = asset pair (RGB++ xUDT ↔ target CKB UDT type scripts), rate, fee, operator pubkey, signature, expiry. Follows Fiber gossip signing/verification patterns.
- Integration into `fiber-lib` broadcast/relay: extends `BroadcastMessage`/`GossipMessage`, gossip store, relay, refresh/expiry pruning — same layer as `NodeAnnouncement`/`ChannelAnnouncement`.
- Listening-side index: `list_offers()`, `best_rate(pair)`, API endpoint + CLI query. Persists via gossip store cursor stream.
- Two-node testnet demo: hub broadcasts → listener receives/parses, recorded demo + setup docs + Discussion #1243 write-up.
- Opt-in extended Fiber node: only nodes running this build participate; unmodified nodes ignore new message type (not a hard fork).

**Explicitly NOT in this grant:**
- Leap module (RGB++ `rgbpp-sdk` leap tx), swap execution generalization (parametrizing CCH HTLC over asset type), orchestration/composition, failure-recovery (leap-succeeds-swap-fails), JS client wrapper, mainnet/audit. These are original 6-week Weeks 3-5 work, deferred.

## 3. Technical Touchpoints

- **Files to extend:** `crates/fiber-lib/src/fiber/gossip.rs`, `gossip_policy.rs`, `types.rs`/`fiber-types` molecule definitions, `store` traits for broadcast persistence, network graph subscription (`GossipMessageUpdates`), RPC/API layer for `list_offers`.
- **Study-first W1:** Read `fiber-lib/src/cch/` and gossip announcement code before writing new code; post intent in Discussion #1243 to check duplicate effort (carry-over from original W1 task, still relevant).
- **Verification (per revised):** Single listener command against public testnet hub, prints advertised pair/rate within seconds; demo video; docs with followable setup steps. No code review, no on-chain tx explorer needed for this scope.

## 4. Previous Broad Context (Scrapped, Archived)

- Cloned `RGBPlusPlus/rgbpp-website` (`/tmp/opencode/rgbpp-website`) — Next.js docs covering isomorphic binding, SPV/UTXO/Cell/Script/xUDT/MMR glossaries, SDK/btc-assets-api, UDT examples (dust 546 sats, commitment calc). Scrapped for this project except to understand why pair is RGB++-derived.
- Full Fiber dive — Light Paper, P2P spec, invoices, cross-chain HTLC, gossip/onion/trampoline/watchtower, contracts (`FundingLock`/`CommitmentLock`), UDT whitelist. Scrapped except gossip/CCH subset relevant to ads.

## 5. Commitments & Constraints

- Language: English docs/comments.
- No new crypto primitive — reuse Fiber gossip broadcast + signature scheme.
- Node compatibility: extended build required for ad relay/index; CCH pattern precedent.
- Budget: $500 = 609,757 CKB; no hardware/third-party.

## 6. Readiness Checklist (Before Coding)

- [ ] W1 setup: CKB dev/testnet + Fiber fnn nodes synced, RPC reachable
- [ ] Confirm `BroadcastMessage`/`GossipMessage` enum locations and serialization (molecule)
- [ ] Draft `SwapAdvertisement` molecule schema for review
- [ ] Post to Discussion #1243 (duplicate-effort check)

> Status: Context isolated, folder created, no code written — awaiting explicit start signal.
