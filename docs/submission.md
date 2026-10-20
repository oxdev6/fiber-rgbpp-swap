# Fiber RGB++ Swap — submission package

Everything a reviewer needs, in one place. No code review required: every claim
either has a public transaction hash or a command that re-checks it.

## 1. Against the termination notice

The notice (post #30) gave three substantive grounds. This is the state of each.

| Finding in the notice | At close (2026-09-15) | Now |
|---|---|---|
| Only a quote network; the Swap core is missing | accurate | **swap executes end-to-end on testnet3**, order `Success` |
| No testnet verification, hardcoded/mock data | accurate | **six transactions committed on two public chains**, re-checked by a script |
| No integration path into Fiber | arguable | swap runs in the fnn CCH path itself (`execute_swap`, `fund_swap_order`); advertising is a real gossip message type in fiber-lib |
| Budget cited as $1,000 | — | revised to **$500** in post #18, accepted in #19, planned in #20 |

The first two were true when the project closed. They are not true now.

## 2. Which baseline governs

Two different baselines appear in the thread, and they ask for different things:

- **Post #18–#20 (the one that was paid):** RGB++ integration ruled out of scope;
  $500 / 4 weeks; deliverables are the advertisement schema, gossip integration,
  a discovery index with RPC + CLI, and testing/demo/docs. **No swap.**
- **Post #30 (the one used to terminate):** "$1,000", requiring "at least the
  Swap core functionality."

Delivered against the $500 plan: W1–W4 as reported in posts #26 and #29.
Delivered **in addition**, after close: the swap execution that only the $1,000
baseline asked for, proven on testnet3 — section 3.

I am not asking for the unpaid balance on the basis of work the committee removed
from scope. I am putting the record straight on which baseline was contracted,
and showing that the gap named in the notice has since been closed.

## 3. The live chain — testnet3, 2026-10-20

One asset, one lineage, issued fresh for this run:

    asset (xUDT type args)  0xeb4963dbd4e5af3047326a377a6817c31deee19e415da5215a603d264331f7b2

| stage | transaction | chain |
|---|---|---|
| RGB++ issuance (BTC commitment) | [`4fc006d8…e081fc`](https://mempool.space/testnet/tx/4fc006d8369ec621afadbe8b6d20258097912d4c90ba0e58935ed38672e081fc) | Bitcoin, block 5195883 |
| RGB++ issuance (CKB xUDT) | [`0xfc29fb99…6bf671`](https://testnet.explorer.nervos.org/transaction/0xfc29fb99fb07a237e4736a7dac0122ec43c78459d6f460d3858d5b5e796bf671) | CKB, block 22805185 |
| leap → BTC_TIME lock (BTC side) | [`312f1bc2…0370bb`](https://mempool.space/testnet/tx/312f1bc29e7c7770ddfb2cc8fb91267f3026126ba8242eadebde3682f60370bb) | Bitcoin, block 5195884 |
| leap → BTC_TIME lock (CKB side) | [`0x958d8fab…245f1b`](https://testnet.explorer.nervos.org/transaction/0x958d8fab158551f19b3f83d66c9c2fddc7e46f4d1a0867a4515420973c245f1b) | CKB, block 22805330 |
| unlock ← SPV proof of the leap | [`0xe9fb7df0…4f91ef`](https://testnet.explorer.nervos.org/transaction/0xe9fb7df0aa465c3d6e605244ab3551b93dbad53c1b7550b92950d02d324f91ef) | CKB, block 22806239 |
| transfer into the trading node's wallet | [`0xe5eb776a…099ed1`](https://testnet.explorer.nervos.org/transaction/0xe5eb776a53b360aa14378d319726a05bca3a8683c004379185fa10cec9909ed1) | CKB, block 22806243 |

Then, in Fiber:

    channel          0xbdfbc4511046bbef056bd3173b9a10083b898f734b660cd16b4f39c13d9a4cf8
    advertisement    0x0668dd84ada4a4597deb45c9d705516e7ceb71fe48e1608aaa4ebdb4b93fdcd5  (rate 100.0, CKB quote)
    payment hash     0x2823d3ec5242502c2e0d3303663c56ff91ba765ad3144e462fc8de8d3b67cdb0
    order            Success — 1 unit of the asset for 100 CKB

Channel deltas on the node that paid the asset:

| channel | before | after |
|---|---|---|
| UDT `0xeb4963db…` | 2,099,999,900,000,000 local | 2,099,999,900,000,000 local / 100,000,000 remote |
| CKB `0x464aa80cfc58…` | 30,000,100,000 local | 40,000,100,000 local |

The asset moved one unit; the CKB side moved exactly 100 CKB in the opposite
direction. Both moves are in the same order and the same invoice.

## 4. What is and is not atomic here

Worth stating plainly, because the original proposal used the word loosely.

- **The swap is atomic.** One invoice, one payment hash, both legs settle or the
  hub refunds. That is CCH's existing HTLC mechanism, now exercised over an
  RGB++-issued asset.
- **The leap is not composed with the swap.** A CKB cell cannot carry the RGB++
  lock and a channel lock at once, so the conversion is a separate, verifiable
  on-chain step that precedes it. The pipeline is *sequence*: leap → unlock →
  channel → swap, with the swap itself atomic. This submission does not claim
  leap and swap succeed or fail as one unit, and no design can without changing
  the lock model.

## 5. Where the code is

- Fiber fork, branch `feat/swap-advertisement` — `https://github.com/oxdev6/fiber`
  - `crates/fiber-lib/src/fiber/gossip.rs` — `SwapAdvertisement` broadcast variant
  - `crates/fiber-lib/src/fiber/network.rs` — signing, publishing, expiry
  - `crates/fiber-lib/src/fiber/swap_ad_index.rs` — `list_offers` / `best_rate`
  - `crates/fiber-lib/src/rpc/swap_ad.rs` — RPC surface
  - `crates/fiber-lib/src/rpc/cch.rs`, `cch/actions/swap_actions.rs` — swap execution
- This repo — orchestration, sidecar tooling, evidence
  - `scripts/e2e-swap.py` — the nine-stage pipeline
  - `scripts/e2e-run.sh` — supervisor, resumable with `--from`
  - `scripts/verify-evidence.sh` — re-checks section 3 against the public chains
  - `leap-sidecar/src/{testnet3-issue,testnet3-leap,testnet3-unlock,transfer-udt,balance}.js`
  - `docs/l3-orchestration.md`, `docs/m10-udt-swap-evidence.md`

## 6. Verify it yourself

```
$ bash scripts/verify-evidence.sh
verifying localnet/e2e-state.json against public testnets

  RESULT STAGE          TXID                                                               WHERE
  OK     issue_btc_tx   4fc006d8…  btc block 5195883
  OK     issue_ckb_tx   0xfc29fb99…  ckb block 22805185
  OK     leap_btc_tx    312f1bc2…  btc block 5195884
  OK     leap_ckb_tx    0x958d8fab…  ckb block 22805330
  OK     unlock_tx      0xe9fb7df0…  ckb block 22806239
  OK     transfer_tx    0xe5eb776a…  ckb block 22806243

  asset (xUDT type args) : 0xeb4963dbd4e5af3047326a377a6817c31deee19e415da5215a603d264331f7b2
  channel                : 0xbdfbc4511046bbef056bd3173b9a10083b898f734b660cd16b4f39c13d9a4cf8
  advertisement          : 0x0668dd84ada4a4597deb45c9d705516e7ceb71fe48e1608aaa4ebdb4b93fdcd5
  invoice payment hash   : 0x2823d3ec5242502c2e0d3303663c56ff91ba765ad3144e462fc8de8d3b67cdb0
  swap order status      : Success

OK: every reference is committed on its public testnet
```

To watch the market and swap legs again against the existing state:

    bash scripts/e2e-run.sh --from market      # publish/select ad → swap → report

The full chain from a clean asset takes ~2.5 h, dominated by two six-block
Bitcoin confirmation windows; every stage is resumable.

## 7. Not claimed

- A **live** timeout/refund demonstration. The refund path is unit-tested
  (F1–F4); forcing an expiry against testnet nodes was not run.
- **Multi-hop** routing through an RGB++ leg.
- **Mainnet.** Everything above is testnet3 by design.

## 8. Documents in this package

| file | use |
|---|---|
| `docs/submission.md` | this dossier — send this one |
| `docs/forum-reply.md` | post-ready reply for the thread |
| `docs/l3-orchestration.md` | how the pipeline works, stage by stage |
| `docs/m10-udt-swap-evidence.md` | first live swap of an RGB++-issued asset |
| `docs/rebuttal-notes-PRIVATE.md` | internal notes, not for submission |
| `docs/response-termination.md`, `docs/email-grant-closeout.md` | superseded drafts |
