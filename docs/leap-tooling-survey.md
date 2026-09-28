# B1 — Leap Tooling Survey (verified 2026-09-25)

## Runtimes available locally
- Node v22.20.0 + npm 10.9.3 → sidecar approach is viable, no toolchain work.

## SDK options
1. **Primary (recommended): `ckb-devrel/ccc`, branch `rgbpp-sdk`**
   - Repo default branch `dev`, active (updated 2026-09-24).
   - Branch head: `1016ee9` — **pin this** until sidecar is built.
   - TypeScript, leap flow documented in rgbpp-website (`examples/udt`):
     select/prepare UTXO seal (546 sats dust) → build CKB cell with
     RGB++ lock → partial CKB tx → commitment → BTC tx → SPV-confirm →
     replace placeholder with new seal txid → final CKB tx.
2. **Legacy: `RGBPlusPlus/rgbpp-sdk`, branch `develop`** — active, not
   archived. Fallback only if `ccc` canary breaks.

## APIs / services
- `https://api.testnet.rgbpp.io` → HTTP 404 on `/` = host alive.
- `https://api-testnet.rgbpp.com` → HTTP 404 on `/` = host alive.
  (Real endpoints live under paths — resolve exact routes in L2 spike.)
- Mainnet `https://api.rgbpp.io` is whitelisted (`buidl@rgbpp.com`) —
  irrelevant for testnet build.

## Leap mechanics (from rgbpp docs, to be re-verified in L2 spike)
- Leap = `RGBPP_lock(out_index|bitcoin_tx)` cell → `BTC_TIME_lock` cell,
  one BTC tx + one CKB tx, ~6 confirmations default before unlock.
- After unlock the asset is a standard xUDT Cell under a normal lock —
  exactly what Fiber's `funding_udt_type_script` accepts.

## Decision (B2, recorded here)
**Sidecar TS service** (`leap-sidecar/`, Node 22) exposing
`POST /leap`, `GET /leap/:id`, built on pinned `ccc#rgbpp-sdk`.
Rust backend talks localhost HTTP only. Rationale: leap touches
commitment math + SPV polling — reimplementing in Rust risks consensus
divergence; shell-outs are fragile; sidecar keeps audited logic behind
a 3-endpoint API. BTC wallet keys live in the sidecar, never in fiber.

## Open items for L2 spike (needs testnet resources)
- Exact `btc-assets-api` routes for testnet leap status polling.
- A real RGB++ testnet asset to leap (gating — asked separately).
- Bitcoin testnet fee/dust budget for 2 on-chain touches per leap.
