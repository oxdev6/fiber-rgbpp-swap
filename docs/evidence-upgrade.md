# Evidence upgrade — verifying the swap itself

`scripts/verify-evidence.sh` now checks **seven** on-chain references: issuance
(BTC + CKB), leap (BTC + CKB), unlock, transfer, and the channel funding tx
(whose output 0 must carry the advertised xUDT and report whether the cell is
still live). That proves the asset lineage and that the asset is in a real
FundingLock cell.

It does **not** prove the swap. `ad_hash`, `payment_hash` and `order_status`
are read from `docs/evidence-state.json`; the script labels them
"self-reported". The channel funding cell is currently `live`, so no close tx
exists and the two HTLC legs remain off-chain.

## What to capture on the next run

1. **The advertisement itself** (not just its hash):

   ```bash
   curl -s -X POST http://127.0.0.1:8327 -H 'Content-Type: application/json' \
     -d '{"id":1,"jsonrpc":"2.0","method":"list_swap_advertisements","params":[{}]}' \
     > localnet/ad.json
   ```

   This includes `operator_pubkey`, `rate`, `expiry`, `chain_hash`; the
   signature can be checked with `SwapAdvertisement::verify()`.

2. **Both invoices and their status**, from each node:

   ```bash
   # hub: base invoice status
   curl -s -X POST http://127.0.0.1:8327 -d '{"id":1,"jsonrpc":"2.0","method":"get_invoice","params":[{"payment_hash":"<BASE_HASH>"}]}'
   # user: quote invoice status
   curl -s -X POST http://127.0.0.1:8328 -d '{"id":1,"jsonrpc":"2.0","method":"get_invoice","params":[{"payment_hash":"<QUOTE_HASH>"}]}'
   # both nodes: payment records
   curl -s -X POST http://127.0.0.1:8327 -d '{"id":1,"jsonrpc":"2.0","method":"list_payments","params":[{}]}'
   curl -s -X POST http://127.0.0.1:8328 -d '{"id":1,"jsonrpc":"2.0","method":"list_payments","params":[{}]}'
   ```

   The same `payment_hash` on both sides, both `Success`, is the atomic link.
   (This build's payment RPC does not expose the preimage; the invoice status
   plus the close tx are the practical anchors.)

3. **Channel state before/after**, from both nodes:

   ```bash
   curl -s -X POST http://127.0.0.1:8328 -d '{"id":1,"jsonrpc":"2.0","method":"list_channels","params":[{}]}'
   ```

4. **Close the channel** after settlement (cooperative close is fine) and add
   the close tx to `evidence-state.json`; extend `check_channel` to require
   the close tx to be committed and its outputs to match the final balances.
   A close tx is the only fully node-independent proof of the final split.

5. **Add the artifacts to the repo** under `localnet/` or `docs/`, with a
   timestamp. The current repository has no `localnet/e2e-state.json`; the
   checked-in `docs/evidence-state.json` is the only state.

## Why the channel is still live

`get_live_cell` for `0x4b7d0e83…:0` returns `live`. Fiber settles HTLCs
off-chain; the funding cell stays live until the channel is closed. Keeping it
open is normal, but it means there is no on-chain transaction that records the
swap's final balances.
