# Revised Proposal — Verbatim (Authoritative Scope)

Source: https://talk.nervos.org/t/spark-program-fiber-rgb-swap/10487/20 (Post #20) + #21

## Post #20 — Carl — Aug 13, 2026, 08:53 UTC

> **Revised Budget — $500, 4 weeks**
>
> **Week 1 — Design and setup — $100**  
> Stand up CKB/Fiber testnet nodes, study `fiber-lib`’s existing gossip code (`BroadcastMessage`/`GossipMessage` types), and finalize the `SwapAdvertisement` message schema (asset pair, rate, fee, operator pubkey, signature, expiry).
>
> **Week 2 — Gossip integration — $150**  
> Implement `SwapAdvertisement` signing/verification and wire it into `fiber-lib`’s existing broadcast/relay path as a new message type. This is the highest-effort week, since it touches the core gossip protocol directly.
>
> **Week 3 — Discovery index and interface — $150**  
> Build the listening-side index (`list_offers()`, `best_rate(pair)`), expose it through an API endpoint, and wire up the CLI so a user can query live advertisements.
>
> **Week 4 — Testing, demo, documentation — $100**  
> Run the two-node broadcast/discovery test, record a short demo, write setup docs for anyone wanting to run their own advertising node, and post the write-up to Discussion #1243.
>
> **Total — $500**, no hardware or third-party costs, development time only.

## Post #21 — zz_tovarishch — Aug 13, 2026, 09:21 UTC

> Based on the agreed **$500** budget and the current CKB price of **$0.00082**, the grant amount is **609,757 CKB**. Please reply to this thread with your **CKB payout address**, **email address**, and **Discord handle** to facilitate grant distribution and team communications. We also invite you to participate in our upcoming **Ecosystem Monthly Call** to share progress.

## Implication

- This revision **supersedes** the original 6-week / $1000 plan (Weeks 3-6 of original: leap integration, swap generalization, client composition, edge-case/failure handling, JS client). Those are now explicitly out-of-scope for Spark and deferred to a follow-on Community Fund DAO proposal.
- Deliverable verification for this grant is: two-node broadcast/discovery test + demo + docs + Discussion #1243 write-up (no on-chain leap tx hashes required for this scope).
- `In-Progress` tag applied to thread.

## Original Scope Reference (for contrast)

Original 6-week plan allocated $300 W1-2 (advertisement), $400 W3-4 (leap + swap generalization + first live leap-and-swap), $300 W5-6 (edge cases, JS wrapper, two demos including timeout/refund). Revised scope keeps only the advertisement/discovery layer (roughly original W1-2 + part of W6 docs), re-budgeted to $500.
