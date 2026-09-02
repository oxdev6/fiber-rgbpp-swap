# References

## Primary (Approved Scope)
- Thread: https://talk.nervos.org/t/spark-program-fiber-rgb-swap/10487
- Revised Budget Post #20: https://talk.nervos.org/t/spark-program-fiber-rgb-swap/10487/20 — $500/4 weeks, W1-4 breakdown (authoritative)
- Payout Post #21: https://talk.nervos.org/t/spark-program-fiber-rgb-swap/10487/21 — 609,757 CKB at $0.00082, In-Progress tag
- CCH gap source: `nervosnetwork/fiber` Discussion #1243 — "Fiber CCH Summary and Future Plan" (April 2026) — CCH hard-coded to one pair, proposed fix = signed advertisements
- Prior art: Lightning Liquidity Ads (https://www.spark.money/glossary/liquidity-ads)

## Archived Original Proposal (Not Scope, For Context)
- Full 11-section $1000/6-week proposal: Post #1 (July 14, 2026) — overview, team (Carl @oxdev6), background, architecture diagram, solution flow, technical approach, to-do list, funding breakdown, deliverables, current state, CKB alignment
- Includes comment thread Q&A (Hanssen #11, fgh #8, Matt #2, Arthur #3, etc.) clarifying lock conflict (RGB++ lock vs FundingLock), node-modification requirement, architecture opt-in nature
- Prototype scaffold (pre-revision): https://github.com/oxdev6/Fiber-RGB-Swap (Actix + Yew, mocked funding/leap) — Post #10

## Code Touchpoints (Local)
- Fiber repo: `/home/agate/Projects/docs.nervos.org/fiber`
  - `crates/fiber-lib/src/fiber/gossip.rs` / `gossip_policy.rs` / `gossip_metrics.rs`
  - `crates/fiber-lib/src/fiber/types.rs` + `crates/fiber-types` (molecule gen)
  - `crates/fiber-lib/src/cch/` (existing CCH module — read-only for this grant, not modified)
  - `crates/fiber-lib/src/store/` + `fiber-types` gossip store traits
  - `docs/specs/p2p-message.md` (channel/announcement message patterns)
  - `crates/fiber-lib/src/rpc/README.md` (where new `list_offers` would surface)
- RGB++ site clone (scrapped, archived): `/tmp/opencode/rgbpp-website` — isomorphic binding, leap mechanism docs

## Workspace Notes
- Prior broad dives consciously scrapped for this folder — only gossip/advertisement subset carried forward.
- No implementation started; dependencies not yet added.
