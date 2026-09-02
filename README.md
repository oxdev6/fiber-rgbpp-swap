# Fiber RGB++ Swap — Spark Program (Approved, Revised)

**Approved scope:** Revised Budget — $500, 4 weeks (Post #20, https://talk.nervos.org/t/spark-program-fiber-rgb-swap/10487/20) — supersedes original $1000/6-week proposal (Post #1).

**Grant payout:** 609,757 CKB at $0.00082/CKB (Post #21). Status: `In-Progress`.

**One-sentence summary (original):** Atomic path RGB++ asset (Bitcoin-locked via single-use-seal) → leap to standard CKB UDT → Fiber channel swap for target CKB asset. **Revised scope isolates the advertisement/discovery layer** as the funded deliverable; leap+swap execution is out-of-scope for this Spark grant and deferred to a follow-on.

## Revised Timeline & Budget (Authoritative)

| Week | Budget | Work |
|------|--------|------|
| Week 1 — Design and setup | $100 | Stand up CKB + Fiber testnet nodes (fnn), study `fiber-lib` existing gossip code (`BroadcastMessage`/`GossipMessage` types), finalize `SwapAdvertisement` message schema (asset pair, rate, fee, operator pubkey, signature, expiry) |
| Week 2 — Gossip integration | $150 | Implement `SwapAdvertisement` signing/verification, wire into `fiber-lib` broadcast/relay path as new message type. Highest-effort (touches core gossip) |
| Week 3 — Discovery index & interface | $150 | Build listening-side index (`list_offers()`, `best_rate(pair)`), expose via API endpoint, wire CLI to query live advertisements |
| Week 4 — Testing, demo, documentation | $100 | Two-node broadcast/discovery test, record short demo, write setup docs for running own advertising node, post write-up to Discussion #1243 |
| **Total** | **$500** | Dev time only, no hardware/third-party |

## What This Project IS and IS NOT (per revision)

- **IS:** Gossip-layer market/discovery for Fiber CCH — signed `SwapAdvertisement` broadcast via existing peer gossip (same mechanism as `NodeAnnouncement`/`ChannelAnnouncement`/`ChannelUpdate`), relay + discovery index. Opt-in extended Fiber node required for participants; unmodified nodes unaffected (same pattern as CCH itself).
- **IS NOT (for this grant):** Full leap+swap orchestration, JS client wrapper beyond CLI query, edge-case failure recovery demos, mainnet, audit, second asset pair beyond first RGB++/CKB pair. Those remain in original 6-week design (see `docs/proposal-original.md`) as future work.

## Technical Context (distilled, scope-relevant)

- **Fiber gossip:** `crates/fiber-lib/src/fiber/gossip.rs`, `BroadcastMessage`/`GossipMessage` cursor stream, `NodeAnnouncement`/`ChannelAnnouncement`/`ChannelUpdate` via `ExtendedGossipMessageStore`. New type follows same signing/verification and relay/refresh cycle.
- **SwapAdvertisement schema (to finalize W1):** asset pair (e.g., RGB++ xUDT type script ↔ target CKB UDT type script), rate, fee, operator pubkey, signature over message, expiry timestamp (stale-offer pruning).
- **CCH background:** Currently hard-coded to one pair (BTC ↔ wrapped-BTC 1:1) — Discussion #1243. Team-proposed fix: operators broadcast signed ads. This project implements that fix.
- **RGB++ relevance:** Lock conflict (RGB++ lock vs Fiber `FundingLock` 2-of-2) forces leap before channel entry — explains *why* ad pair is RGB++-derived UDT, but leap itself is not built here.

## References
- Approved thread: https://talk.nervos.org/t/spark-program-fiber-rgb-swap/10487
- Revised budget post: https://talk.nervos.org/t/spark-program-fiber-rgb-swap/10487/20
- Payout post: https://talk.nervos.org/t/spark-program-fiber-rgb-swap/10487/21
- Original CCH gap discussion: `nervosnetwork/fiber` Discussion #1243
- Prior art analogy: Lightning Liquidity Ads

## Folder Layout
- `docs/proposal-revised.md` — Posts #20-#21 verbatim (authoritative $500/4w)
- `docs/context.md` — Distilled scope-only understanding
- `docs/upstream.md` — Starter repo `oxdev6/Fiber-RGB-Swap` (`upstream/`) structure & gap to scope
- `docs/implementation-plan-week1-2.md` — **W1+W2 step-by-step plan (small manageable steps)**
- `docs/references.md` — Links + local code pointers
- `upstream/` — Local clone of starter (Actix+Yew mocked scaffold) — starting point per instruction
- `docs/gossip-notes.md` / `docs/schema-draft.md` / `docs/week1-checkpoint.md` / `docs/week2-smoke.md` — to be created in W1-2

> Status: **Context + W1-2 plan captured, ready. No implementation started** — awaiting go-ahead.
