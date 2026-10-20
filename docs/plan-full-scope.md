# Plan — Deliver the Remaining $1,000 Scope (leap + swap execution)

**Goal:** make the termination's core claim ("no Swap component") false by
building it, so the rebuttal becomes one line: *re-review, it's all there.*
No new arguments needed — only new commits, new testnet txs, new demos.

**Continuity with what's built:** stages 1–2 (advertise/discover) become the
order entry for stage 4 — a user picks a `SwapAdvertisement` (pair + rate)
and the client executes leap → swap against it. The board doesn't change;
it gains an "Execute swap" path.

## Phase 0 — Study & decisions (done / nearly done)

- [x] **A1:** CCH deep-read. Findings: `cch/actor.rs:59`
  (`SendBTC`/`ReceiveBTC` messages), `order/state_machine.rs:1`
  (Pending → IncomingAccepted → OutgoingInFlight → OutgoingSuccess →
  Success/Failed), `config.rs:60` (`wrapped_btc_type_script_args`, 8-decimal
  UDT), trackers split LND-side (`LndTrackerActor`) vs Fiber-side
  (invoice/payment tracking), actions with retry/backoff
  (`send_outgoing_payment.rs`, `settle_incoming_invoice.rs`), scheduler +
  order store. Key insight: our swap needs **both legs Fiber-native** — a
  new Fiber→Fiber order kind reusing invoice+payment HTLC primitives and
  the scheduler skeleton, NOT the LND half.
- [ ] **B1:** Leap tooling survey. Known: primary SDK is TypeScript
  (`ckb-devrel/ccc#rgbpp-sdk`), legacy `RGBPlusPlus/rgbpp-sdk`,
  `btc-assets-api` testnet endpoints, leap = `RGBPP_lock` →
  `BTC_TIME_lock` with SPV proofs (~6 confirmations). Our backend is Rust
  (fiber fork) — TS SDK can't link in. Decision needed in B2.
- [ ] **A2:** Design doc — generalized order type (`SwapOrder`: Fiber
  invoice leg + Fiber payment leg, same payment_hash/preimage; pair +
  rate taken from the selected `SwapAdvertisement`; expiry math per
  `cch-expiry-dependency` pattern). Reuses `CchOrderStateMachine`
  transitions, `CchFiberAgent` for both legs, existing retry/backoff.

## Phase 1 — Swap execution (Fiber→Fiber atomic order)

Small verifiable steps, each `cargo check` before the next:

- **S1 — New order type.** `cch/order/swap_order.rs`: `SwapOrder`
  { base_script, quote_script, rate, fee, payment_hash, preimage_holder,
  legs: (FiberInvoice, FiberPayment), status } + store
  (`CchOrderStore` extension, new prefix) + unit tests (transitions only).
- **S2 — Fiber-side actions.** `cch/actions/swap_*.rs`: create invoice for
  leg A via `CchFiberAgent`, pay invoice for leg B, settle on preimage
  reveal — mirroring `send_outgoing_payment.rs` /
  `settle_incoming_invoice.rs` but both legs through the fiber agent.
  Reuse scheduler retry/backoff constants.
- **S3 — Actor messages + RPC.** `CchMessage::ExecuteSwap { ad_hash, … }`,
  RPC `execute_swap_advertisement` (takes the advertised pair + amount,
  returns order id), CLI passthrough. Wire into `start_rpc` next to
  `swap_ad` module.
- **S4 — Recovery paths.** Timeout on either leg → refund path; partial
  fill → order stays fillable or fails clean with reason (same
  `failure_reason` pattern as `CchOrderStateMachine`). Unit + mocked-actor
  tests.
- **Verify S1–S4:** `cargo test -p fnn --lib cch` green; mocked two-leg
  swap settles in-process; failure injection refunds.

## Phase 2 — Leap integration (Bitcoin → CKB UDT)

- **L1 — Decision (B2).** Recommendation: **sidecar TS service** exposing
  `POST /leap { rgbpp_utxo, … } → { ckb_tx, status }` using the official
  `ccc` rgbpp-sdk, called by our Rust backend over localhost. Rationale:
  leap logic (commitment calc, SPV polling, BTC_TIME_lock) is consensus-
  adjacent — reimplementing in Rust risks consensus bugs; shelling out is
  fragile; sidecar keeps audited logic intact with a narrow API.
- **L2 — Sidecar + client.** Minimal TS service (issue/leap/status only),
  Rust client in backend (`leap_client.rs`), intermediate UDT tracked as
  recoverable state (leap-first design: if swap fails, user keeps the
  plain UDT — never stuck, never auto-reversed).
- **L3 — Orchestration.** `swap_client` chains: select ad → leap → confirm
  on-chain (SPV) → execute swap order → confirm settlement; prints tx
  references at each stage. Failure matrix from original proposal W5
  (leap-ok/swap-fail, leg timeout, expired/malformed ad, rate drift).
- **Verify L1–L3:** leap of a REAL testnet RGB++ asset → UDT, confirmable
  in explorer (BTC tx + CKB tx). This is the highest-risk dependency —
  see Resources.

## Phase 3 — End-to-end + evidence (kills every claim)

- **E1 — Funded testnet channels:** open + fund Fiber channels carrying the
  leaped UDT and the target asset (needs CKB testnet funds).
- **E2 — Full run on video:** RGB++ asset → leap (BTC+CKB txs) → swap
  (Fiber HTLC both legs) → target asset. Three on-chain references +
  order id, all explorer-checkable.
- **E3 — Failure demos:** swap-leg timeout with refund; leap-ok/swap-fail
  leaving recoverable UDT. Recorded, not asserted.
- **E4 — Docs + forum post:** setup guide for a third pair, architecture
  update (advertise → discover → leap → swap), new demo video.

## Resources needed (from you / testnet)

1. **A real RGB++ asset on Bitcoin testnet/signet** to leap — mint one via
   the issuance flow or source from a holder. Without this, L3/E2 cannot
   happen. (Biggest gating item.)
2. **Bitcoin testnet funds** (dust + fees; leap touches BTC twice).
3. **CKB testnet funds** (channel funding + UDT cells + tx fees).
4. **Time:** realistic 4–8 weeks of protocol engineering. This is
   follow-on-grant-sized whether or not the committee reinstates.

## Risks, stated plainly

- Leap SDK drift (TS `ccc` canary) — pin versions, wrap narrowly.
- CCH generalization touching audited code paths — keep LND paths
  untouched; new order kind only, reviewed diff kept small.
- Testnet flakiness (slow CKB testnet init, BTC confirmations) — budget
  waiting time, record accordingly.
- Response-hang quirk seen in publish RPC — watch whether it recurs in
  new RPC paths; instrument with timing logs if so.

## Verification map (reviewer needs no code reading)

- Leap: BTC tx + CKB tx hashes in explorer showing RGB++ lock → UDT.
- Swap: order id + both Fiber leg references + final balances.
- Failures: two videos (timeout/refund, leap-ok/swap-fail recovery).
- Docs: third-pair setup guide a stranger can follow.
