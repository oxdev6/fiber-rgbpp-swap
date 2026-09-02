# Upstream Starter — oxdev6/Fiber-RGB-Swap

**Clone:** https://github.com/oxdev6/Fiber-RGB-Swap  
**Local copies:**
- `/tmp/opencode/Fiber-RGB-Swap` (temp clone for inspection)
- `/home/agate/Projects/fiber-rgbpp-swap/upstream` (project-local starter, tracked as starting point)

**Commit:** `3a4205d Initial commit` (single commit at clone time Aug 31)

## Structure (actual inspected)
```
upstream/
  Cargo.toml (workspace: backend, frontend)
  backend/
    Cargo.toml (actix-web 4, actix-cors 0.7, ckb-sdk 0.103, ckb-types 0.103, serde, uuid, chrono)
    src/main.rs (Actix HttpServer :8080, 4 routes: health, initiate, status, raw, list)
    src/swap.rs (SwapManager: Mutex<HashMap>, persist to ./backend/state/swaps.json, SwapRequest/Response/Status)
    src/ckb_helpers.rs (dummy build_funding_transaction / build_leap_transaction via TransactionBuilder with dummy outpoint/scripts)
  frontend/
    Cargo.toml (yew 0.22 csr, yew-router 0.18, gloo-net, gloo-console)
    Trunk.toml (wasm32-unknown-unknown, proxy_backend http://127.0.0.1:8080)
    src/lib.rs (Yew App: initiate form + status polling 10s Interval + raw fetch + swap history table; ~640 LOC duplicated rendering)
    index.html + demo.html + static/styles.css + mock_backend.py
```

## Current Behavior (mocked)
- `POST /api/swap/initiate` builds two dummy CKB txs (funding/leap) with `build_script_from_address` using raw address bytes as args, zero code_hash, dummy cell_dep, capacity = amount shannons; hashes are `0x<tx.hash>`, persisted with phase `funding`.
- `GET /api/swap/{id}` advances mock `stage` 0→1→2: funding→leap→completed, updates `last_update`.
- `GET /api/swap/{id}/raw` returns stored pretty-printed tx JSONs.
- `GET /api/swap` lists persisted swaps.
- Frontend mirrors this: form (offerer/counterparty address+asset_type, amount), status polling, raw payload copy, history refresh.

## Gap to Revised Scope ($500/4w)
Starter implements **mocked swap orchestration** (funding+leap). Revised Spark scope is **advertisement gossip discovery** (SwapAdvertisement message, broadcast/relay, index, CLI query) — not present in starter. Starter remains useful as Actix/API skeleton and for W4 demo plumbing, but W1-3 work (fiber-lib gossip extension) is greenfield Rust against `nervosnetwork/fiber` types, not against this scaffold's dummy txs.

## Notes
- `rustup-init.exe` (10 MB Windows binary) checked in accidentally at repo root + backend — should be gitignored.
- Frontend `lib.rs` contains duplicated `<div class="app">` rendering (lines 450+ vs 551+) — likely copy-paste artifact.
- `ckb_helpers.rs` dummy scripts are non-broadcastable; real needs Fiber `FundingLock`/`CommitmentLock` + `ckb-sdk` cell collection.

> Status: understood, preserved locally as starting point. No edits made.
