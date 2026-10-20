# S4 — Failure-path evidence (all live, testnet nodes 8327/8328)

## F1. Rate drift rejected before any funds move
- Quote invoice asks 99,999; ad rate gives 100,000 (base 1000 @ 100.0).
- `execute_swap` → `Swap quote amount mismatch: invoice asks 99999, ad rate gives 100000`
- No order created, no HTLC opened. Verified: subsequent `list`/`get_swap_order`
  show nothing new.

## F2. Expired advertisement rejected
- Published ad with `expiry_delta_millis: 0x1` → hash
  `0xd9de67f5…`; execute 3s later →
  `Swap advertisement not found or expired: Hash256(0xd9de67f5…)`.
- Same result for unknown hashes (tested earlier with `0x000…0`).

## F3. Unknown ad hash → NotFound (no order, no side effects)
- Covered by F2 pattern with `0x000…0` hash on the live node.

## F4. Timeout / refund design (verified by construction + unit tests)
- Pre-payment: orders only exist after validation; unpaid Pending orders move
  no funds (nothing to refund — demonstrated implicitly by F1–F3 creating nothing).
- Mid-flight: HTLC expiry refunds are Fiber protocol guarantees; order
  expiry (`update_if_expired`, unit-tested in fiber-types) marks stale orders
  Failed with reason; scheduler prune jobs are payment-hash keyed.
- Live mid-flight timeout staging (a payment that hangs past TLC expiry)
  requires adversarial network conditions not reproducible on demand in this
  session; covered for follow-on E3 with a dedicated chaos run.

## Live success reference (E2, same session)
- Order `0x2578ccf8…`: Pending → Success, preimage captured, both legs
  settled through channels `0x20cda8eb…` (A→B) and `0xd97cbb1e…` (B→A).
