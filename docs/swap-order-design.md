# A2 — Fiber→Fiber SwapOrder Design

## Why a new type (not extending CchOrder)
`CchOrder` (`fiber-types/src/cch.rs:70`) is LND-shaped: one leg is a BOLT11
`outgoing_pay_req: String`, the other a `CchInvoice`, amounts in sats, and
the wrapped-BTC script is a single config-level script. Our swap has **both
legs on Fiber/CKB** (leaped base UDT ↔ quote asset), amounts in UDT units,
and the pair comes from a `SwapAdvertisement`, not config. Subclassing
would drag LND-isms (`SendBTC`/`ReceiveBTC`, sat fees, CLTV-block math)
into every match arm. A sibling type reusing the *patterns* (not the
struct) keeps the audited CCH paths byte-identical.

## The type (new, `fiber-types/src/swap_order.rs` or `cch/swap_order.rs`)

```rust
pub struct SwapOrder {
    pub created_at: u64,              // secs epoch (mirror CchOrder)
    pub expiry_delta_seconds: u64,    // default: same 36h constant
    pub ad_hash: Hash256,             // blake2b of the SwapAdvertisement consumed
    pub base_script: Option<Script>,  // packed ckb_types (exact ad scripts)
    pub quote_script: Option<Script>,
    pub rate: u128,                   // frozen at order time (quote/base*1e8)
    pub base_amount: u128,            // user-specified base units in
    pub quote_amount: u128,           // derived: base*rate/1e8 (checked math)
    pub payment_hash: Hash256,        // links both legs (store key)
    pub payment_preimage: Option<Hash256>, // set on reveal (mirror CchOrder)
    pub base_invoice: CchInvoice,      // hub's invoice to the user (leg A)
    pub quote_pay_req: String,         // serialized Fiber invoice WE pay (leg B)
    pub status: CchOrderStatus,        // REUSE enum + allow_transition as-is
    pub failure_reason: Option<String>,
}
impl SwapOrder {
    pub fn is_final(&self) -> bool;              // mirror CchOrder
    pub fn update_if_expired(&mut self, now) -> bool;
}
```

Rate drift guard: `quote_amount` frozen at creation; if legs settle at
different effective rates (routing fees), the difference must stay within
the ad's `fee_rate`, else fail with reason (no silent slippage).

## State machine — reuse, don't fork
`CchOrderStateMachine::{apply, allow_transition}` operates on
`(status, event)` with `CchOrderEvent::{IncomingInvoiceChanged,
OutgoingPaymentChanged}`. `SwapOrder` converts to/from the same events:
- Leg A (user pays hub's base invoice) → `OutgoingPaymentChanged`
  (from OUR side as payer) — or model hub-side symmetrically.
- Leg B (hub pays user's quote invoice) → `IncomingInvoiceChanged`.
Direction mapping is the one design detail to nail in S1; transitions
themselves are reused untouched.

## Actions — mirror existing files
- `cch/actions/swap_pay_quote.rs` ← mirrors `send_outgoing_payment.rs:400`
  but both legs via `CchFiberAgent::{add_invoice, send_payment,
  settle_invoice}` (`cch_fiber_agent.rs:115,141,174`).
- Retry/backoff: reuse `ACTION_RETRY_BASE_MILLIS`/`MAX` + scheduler
  (`scheduler.rs:334`) with a second queue or a `kind` flag — do NOT alter
  existing CCH scheduling behavior.
- Preimage check: same `HashAlgorithm` verification as
  `state_machine.rs:62` before marking success.

## Store — new prefix, same trait shape
- New trait `SwapOrderStore` mirroring `CchOrderStore`
  (`order_store.rs:23`): get/insert/update/delete + keys iter, keyed by
  `payment_hash`.
- New `KeyPrefix` (CCH uses 232; take **233**) + migration entry. Never
  share prefix 232 — old and new orders must not collide.

## Actor + RPC (S3 preview, not this doc's scope)
- `CchMessage::ExecuteSwap { ad_hash, base_amount, quote_script }` →
  builds `SwapOrder` from live `SwapAdvertisement` (reject expired/missing
  ad), drives legs, replies with order id.
- RPC `execute_swap_advertisement` next to `swap_ad` module; CLI
  passthrough. Response must never hang: all leg I/O inside scheduler
  actions, RPC returns order id immediately (unlike the publish path
  lesson — keep RPC handlers non-blocking).

## What S1 must prove (acceptance for next step)
1. `SwapOrder` transitions Pending→…→Success/Failed through the REUSED
   `CchOrderStateMachine` in unit tests (no forked machine).
2. Expired orders mark Failed with reason.
3. Store round-trip under the new prefix; no interference with prefix-232
   CCH orders (test writes both, reads both).
4. `cargo test -p fnn --lib cch` green (existing CCH tests untouched).
