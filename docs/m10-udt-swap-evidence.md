# M10 — RGB++-issued testnet xUDT swapped over Fiber (live)

Two-node demo on testnet, `feat/swap-advertisement` (`fnn 0.9.0-rc7`, `ebcf00c-dirty`).
Nodes: A = hub (`8828`/`8327`, pubkey `02a716c4…`), B = user (`8829`/`8328`, pubkey `0286f567…`).

Asset: the xUDT issued by the RGB++ bitcointime-lock flow
(`0x4995160e…`, unique id `0xd045213e…`) — the same asset taken
issuance → leap → unlock earlier.

## Prerequisites added this run
- Both node configs: `testnet.ckb.dev` (the node's type-id resolver failed on
  `testnet.ckbapp.dev`; `testnet.ckb.dev` boots clean).
- Whitelisted the asset in both `ckb.udt_whitelist` entries (`SWAPUDT`,
  `0x25c29dc3…`/`0xa1590e84…`, direct `cell_dep` `0xbf6fb538…:0`,
  `auto_accept_amount: 1000000000000`). `auto_accept_amount` is a **minimum**.
- Opened a **UDT channel** B→A funded with the xUDT (both pre-existing channels
  were CKB-only): `0x20d97d7e2f066475e167…`, funding outpoint
  `0xb1d674ee463d4a7555daa710f73cba24b97c34a0f487c9e2496f68990ccf7913:0`,
  funded 1e12 raw (10,000 units), `ChannelReady` in ~90s.

## Ad
Hub A `publish_swap_advertisement`: base = xUDT `0xa1590e84…`, quote = CKB,
`rate 0x2540be400` (100.0), `fee_rate 0xbb8`, expiry 1 day.
- ad_hash `0x6bb8e03630e4313b6ea0107932919ac857ad04220bf6a0c2187c83d53aea87f3`
- operator_pubkey `0230c7dc464617c141941602b8e68948608e4ccd6388b86186eb5464afb3dead1f`

A second ad published on B (`0xa0e80e2d…`, same pair) was discovered by A via
gossip (~25 s) — the rebuild restored ad discovery.

## Execution
Flow: the **caller of `execute_swap` is the user** (pays `base`, receives
`quote`); the hub returns the base invoice. So B (holds xUDT) is the user and
A (holds CKB) the hub.

1. B `new_invoice { amount: 0x2540be400 (100 CKB), currency: Fibt,
   hash_algorithm: sha256 }` → quote invoice
   (`payment_hash 0xb92dae3e…`). The engine **requires SHA256** invoice hashes
   ("CKB invoice hash algorithm is not SHA256, which is required for LND
   compatibility"); the default is rejected.
2. A `execute_swap { ad_hash: 0x6bb8e036…, base_amount: 0x5f5e100 (1 UDT unit),
   quote_pay_req: <B's invoice> }` → order **Pending**,
   `quote_amount 0x2540be400`, returns the base invoice (`base_pay_req`).
3. B `send_payment <base_pay_req>` → routed over the UDT channel
   `0xb1d674ee…:0`, amount `0x5f5e100`.
4. Both legs settled → order **Success** within ~10 s.

- `payment_hash` `0xb92dae3ea85578411e0efcdcb4a91804f29e17f34157e5d0b039074435500a5d`
- `ad_hash` `0x6bb8e036…`, `base_amount 0x5f5e100`, `quote_amount 0x2540be400`, `status Success`

## Balance deltas (channel state, before → after)
| channel | side | before | after |
|---|---|---|---|
| UDT `0x20d97d7e2f06…` | B local | 1,000,000,000,000 | 999,900,000,000 (−1e8) |
| UDT `0x20d97d7e2f06…` | A (B remote) | 0 | 100,000,000 (+1e8) |
| CKB `0x464aa80cfc58…` | B local | 100,000 | 10,000,100,000 (+1e10) |
| CKB `0x464aa80cfc58…` | A (B remote) | 4,990,099,900,000 | 4,980,099,900,000 (−1e10) |

B paid 1 xUDT unit to A; A paid 100 CKB to B. The RGB++-issued asset moved
through a swap, priced by the advertisement.

## Reproduce
`scripts/m10-udt-swap.py publish|invoice|execute AD PAY_REQ|pay PAY_REQ|order PH`
(set `UDT_ARGS` to pick the asset)

## Tightened run (E2) — swapping the RGB++ asset itself

The run above swapped `0xa1590e84…`, a separately minted UDT — **not** the RGB++
lineage asset. Tightened so the swapped asset *is* the one produced by
issue → leap → unlock:

- Moved the RGB++-issued asset (`0xd045213e…`, 21,000,000 units) from the
  sidecar address into node B's wallet:
  `node src/transfer-udt.js --amount 21000000 --cap-to 160` → tx
  `0x3b663736a4a5e3d04ab02460162290bc3987dbc1bfeb031f3d9281aaa27af8db`
  (committed). An xUDT cell needs ~142 CKB occupied, so a 247 CKB cell can only
  produce one UDT output — the change is plain CKB.
- Whitelisted it as `RGBPPUDT` (same code hash + singleton dep).
- Opened a UDT channel funded with the whole asset: `0x21d3f4e76c9ff781f0…`,
  funding `0xe3aec7831804b26be7d549c87149f1d2f42ab72cf4c6b3241ba3c040c70643b8:0`,
  21,000,000 units, `ChannelReady` in ~80 s.
- Ad on A `0xb9c38f348194b3b17c7851fbce49dd2fc71b2a58389367deeb7b24492f209188`
  (base = RGB++ xUDT); B invoice 100 CKB (sha256); `execute_swap`; B pays the
  base invoice.
- Order `0x3d2cc0b8f8fedc4ddaffdcc541056a420818792ccdbfc8f56711c16a0081e8bc`
  → **Success** in ~20 s.

| channel | side | before | after |
|---|---|---|---|
| RGBPP-UDT `0x21d3f4e7…` | B local | 2,100,000,000,000,000 | 2,099,999,900,000,000 (−1e8) |
| RGBPP-UDT `0x21d3f4e7…` | A (B remote) | 0 | 100,000,000 (+1e8) |
| CKB `0x464aa80cfc58…` | B local | 10,000,100,000 | 20,000,100,000 (+1e10) |
| CKB `0x464aa80cfc58…` | A (B remote) | 4,980,099,900,000 | 4,970,099,900,000 (−1e10) |

### Why not "straight out of the leap"
A leap lands the asset in a **BTC_TIME** cell, spendable only with an SPV proof
of a Bitcoin transaction, and Fiber channels carry only plain / channel-locked
UDT. So the pipeline is issue → leap → unlock → channel → swap; the asset
identity is unchanged throughout (same unique id `0xd045213e…`).
