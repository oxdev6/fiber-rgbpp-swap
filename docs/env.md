# Environment — W1-01 & W1-02

## W1-01 — Env & Fork
- **Pinned upstream:** `04e091b08953368aa5ee977f562ad628c3000ff4` (develop, #1539) — `docs/pinned-upstream.md`
- **Work copy:** `work/fiber` branch `feat/swap-advertisement` (from above)
- **Toolchain:** `1.95.0` (`rust-toolchain.toml` channel 1.95.0, targets wasm32-unknown-unknown). Available toolchains: 1.80,1.87,1.91,1.93,1.94,1.95,stable,risc0.
- **Verify:** `cargo +1.95.0 check -p fiber-types --locked` — **OK** (Finished dev profile in 52.40s, EXIT 0) — `work/fiber/crates/fiber-types` compiles. Full workspace `cargo check --locked` started successfully (compilation progressed without errors before timeout; expected multi-minute build per `AGENTS.md`).
- **CKB binary:** `ckb 0.202.0 (d0a6c95 2025-06-11)` at `/home/agate/.local/bin/ckb`

## W1-02 — CKB Testnet RPC
- **RPC URL (from `work/fiber/config/testnet/config.yml:88`):** `https://testnet.ckbapp.dev/`
- **Verify:** `curl -X POST https://testnet.ckbapp.dev/ -d '{"id":2,"jsonrpc":"2.0","method":"get_tip_header","params":[]}'`
```json
{
  "jsonrpc": "2.0",
  "result": {
    "hash": "0x8fbe36c6bf3f98e8f8ccc60e6f76f061dc063acb2afdacaf8c59cc7e04fd53f9",
    "number": "0x153b762",
    "epoch": "0x70806b10035ab",
    "timestamp": "0x1a05775897a"
  }
}
```
- **Indexer check:** RPC reachable; Fiber config uses same URL for `ckb.rpc_url` + indexer. No local CKB node required for W1-2 (public testnet sufficient per Fiber testnet bootnodes). Local `ckb` binary available if dev chain needed later.

## Next
- W1-03: Build `fnn` from `work/fiber` and launch two testnet peers.
