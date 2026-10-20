# L3 — End-to-end orchestration

`scripts/e2e-swap.py` chains the whole pipeline and prints every reference at
each stage. `scripts/e2e-run.sh [--from STAGE]` runs it, logging to
`localnet/e2e-run.log` and persisting state to `localnet/e2e-state.json`.

| stage | what it does |
|---|---|
| `issue` | fresh RGB++ xUDT issuance; seal = largest UTXO at the sidecar BTC address |
| `leap` | CKB RGB++ lock → BTC_TIME lock, committing to Bitcoin |
| `unlock` | BTC_TIME → plain xUDT, via SPV proof of the leap BTC tx |
| `transfer` | move the unlocked asset from the sidecar address into node B's wallet |
| `whitelist` | add the asset to both node configs' `udt_whitelist`, restart, wait for RPC |
| `open` | ensure node B holds a `ChannelReady` channel carrying the asset |
| `market` | pick the best live ad; **publish one** if the pair has none |
| `swap` | `execute_swap` on the hub, user pays the base invoice, await settlement |
| `report` | print the reference chain and channel balances as JSON |

Every stage is resume-safe: `--from` starts at a named stage, and state carries
the references produced by earlier ones.

## Proven run — full live pass on testnet (2026-10-20)

Started 14:48:37Z, finished 17:26:54Z (~2h38m; two Bitcoin confirmation windows
and one node restart dominated). All nine stages completed without manual steps.

    asset           0xeb4963dbd4e5af3047326a377a6817c31deee19e415da5215a603d264331f7b2
    issue_btc_tx    4fc006d8369ec621afadbe8b6d20258097912d4c90ba0e58935ed38672e081fc
    issue_ckb_tx    0xfc29fb99fb07a237e4736a7dac0122ec43c78459d6f460d3858d5b5e796bf671
    leap_btc_tx     312f1bc29e7c7770ddfb2cc8fb91267f3026126ba8242eadebde3682f60370bb
    leap_ckb_tx     0x958d8fab158551f19b3f83d66c9c2fddc7e46f4d1a0867a4515420973c245f1b
    unlock_tx       0xe9fb7df0aa465c3d6e605244ab3551b93dbad53c1b7550b92950d02d324f91ef
    transfer_tx     0xe5eb776a53b360aa14378d319726a05bca3a8683c004379185fa10cec9909ed1
    udt_channel     0xbdfbc4511046bbef056bd3173b9a10083b898f734b660cd16b4f39c13d9a4cf8
    ad_hash         0x0668dd84ada4a4597deb45c9d705516e7ceb71fe48e1608aaa4ebdb4b93fdcd5  (rate 100.0)
    payment_hash    0x2823d3ec5242502c2e0d3303663c56ff91ba765ad3144e462fc8de8d3b67cdb0
    order_status    Success            (1 unit of base → 100 CKB)

Channel deltas (node B's view):

| channel | local | remote |
|---|---|---|
| UDT `0xeb4963db…` | 2,099,999,900,000,000 | 100,000,000 |
| CKB `0x464aa80cfc58…` | 30,000,100,000 → 40,000,100,000 | 4,960,099,900,000 → 4,950,099,900,000 |

i.e. B paid one unit of the RGB++-issued asset and received 100 CKB, with the
asset in the channel having gone `2.1e15 → 2.1e15 − 1e8` and the CKB channel `±1e10`.

Stage wall-clock: issue 3 min, leap 20 min, unlock 120 min (BTC block drought),
transfer 4 s, whitelist 4.5 min, open 11 s, market 67 s, swap 10 s.

## Robustness notes (bugs found and fixed while proving this)

- **`transfer-udt.js` never exited.** The other sidecar scripts end with
  `main().then(() => process.exit(0))`; this one only had `process.exit(1)` in
  the catch, so it kept an open handle and the orchestrator waited on its stdout
  forever — the first attempt stalled for 21 h *after* the transfer tx had
  already committed. Fixed, plus `sh()` now accepts a `done` sentinel and
  terminates the child as soon as its terminal marker streams.
- **`open_channel` does not return `channel_id`.** The channel is created (it
  appears in `list_channels` as `AwaitingTxSignatures`); `stage_open` now
  discovers it by asset args and polls to `ChannelReady`.
- **Per-asset whitelist.** A fresh issuance produces a new xUDT `args`, and
  `open_channel` rejects it with `Invalid UDT type script` unless it is in both
  nodes' `udt_whitelist`. `stage_whitelist` inserts the entry and restarts the
  nodes.
- **Ads do not survive a restart**, and a fresh asset has none to begin with.
  `stage_market` now publishes one on the hub when the pair has no live offer.
- The BtcAssetsAPI requires **tip ≥ target + 6** for the SPV proof, so each
  `leap`/`unlock` waits on six Bitcoin blocks, not five.

## Run it

    bash scripts/e2e-run.sh                 # full chain from a clean state
    bash scripts/e2e-run.sh --from open     # resume from a stage
    python3 scripts/e2e-swap.py --only report
