# Fiber RGB++ Swap

Rust + CKB SDK prototype for an atomic swap / channel boundary dApp.

## Architecture

- `backend/` — Actix Web API server with CKB SDK integration points.
- `frontend/` — Yew web UI that talks to the backend.

## Requirements

- Rust toolchain (stable)
- `trunk` for Yew frontend builds
- A local or remote CKB node RPC endpoint for the backend

## Run locally

1. Start the backend:

```powershell
cd "c:\Users\MRNOBODY\Documents\Fiber RGB++ Swap\backend"
cargo run
```

2. Start the frontend:

```powershell
cd "c:\Users\MRNOBODY\Documents\Fiber RGB++ Swap\frontend"
trunk serve --open
```

3. Open the UI in the browser and use the swap form.

## Notes

This prototype now includes:

- `POST /api/swap/initiate` for swap creation with mock transaction hashes
- `GET /api/swap/{swap_id}` for status polling and phase progression
- `GET /api/swap` to list persisted swaps from the backend
- `GET /api/swap/{swap_id}/raw` to fetch raw transaction JSON for a specific swap
- frontend status refresh, swap detail display, and swap history table
- raw transaction JSON for funding and leap transactions included in API responses
- simulated funding/leap workflow state and verification command output

## Next recommended improvements

1. Implement real CKB transaction construction for channel funding and settlement.
2. Add RGB++ leap integration using actual RGB++ validators and on-chain anchor logic.
3. Add transaction validation and error handling for timeout/failure paths.
4. Extend the UI with swap history, on-chain status indicators, and transaction hash links.
