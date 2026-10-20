# Fiber RGB++ Swap — submission package

Everything needed to judge the project, in one place. No code review: every
claim is either a public transaction hash or a command that re-checks it.

## 1. The confusion in the review

The termination notice (post #30) evaluates the project against a baseline and
an artifact that are both identifiable, and neither is the one that was
contracted. Three specifics.

**a. It cites the wrong baseline.** The notice says "$1,000" and requires "at
least the core Swap functionality". That baseline was superseded on
2026-08-13: post #18 ruled the RGB++ integration out of scope and set the grant
to $500 / 4 weeks; I accepted in post #19; the accepted plan is post #20; and
609,757 CKB was approved on that basis in post #21, of which 121,952 CKB (20%)
was paid in post #24. **The plan in post #20 contains no swap stage at all** —
it is design/schema, gossip integration, discovery index + RPC/CLI, and
testing/demo/docs. Judged against the baseline that was paid for, all four
weeks were delivered as specified.

**b. It cites the wrong artifact.** "仅用写死的数据进行模拟" (simulated with
hardcoded data) does not describe what was delivered. The delivery was the fork
at `oxdev6/fiber`, branch `feat/swap-advertisement`; the W1–W4 testing in posts
#26/#29 ran against **CKB testnet** — chain hash `0x10639e08…` from `node_info`
— with every rate, signature, timestamp and expiry generated per publish.
Hardcoded mock hashes are the **August scaffold** shared in post #10, whose
leap logic was explicitly simulated (post #13). Supporting this: the notice's
own "Related Links" line still reads "Cell Sandbox (placeholder — please
confirm)", i.e. it points at a different project, so the review file appears to
have been assembled from the old link.

**c. One finding was true, and it is the one that mattered.** There was no
swap, and no swap-level evidence on a public network, at close on 2026-09-15.
The revised $500 plan did not include one, but the notice is right that the
project's stated purpose — an RGB++ asset reaching a settlement — was not
demonstrated. That gap is now closed; section 3.

## 2. The claim: the $1,000 baseline, now met

Since the swap and its testnet validation exist, I am claiming the **original,
unreduced baseline** rather than the $500 one. The original proposal asked for
"a working, atomic path that takes an RGB++ asset … and swaps it through a
Fiber channel", with verification on a real network. That now runs end to end.

| $1,000 baseline requirement | status | evidence |
|---|---|---|
| RGB++ asset issued and usable | met | Bitcoin `4fc006d8…`, CKB `0xfc29fb99…` |
| leap out of the RGB++ lock | met | Bitcoin `312f1bc2…`, CKB `0x958d8fab…` |
| swap through a Fiber channel | met | channel `0xbdfbc451…`, order `0x2823d3ec…` **Success** |
| verification on the real network | met | six committed transactions, `scripts/verify-evidence.sh` |
| built on Fiber, not beside it | met | runs in the fnn fork's CCH path (`execute_swap`, `fund_swap_order`) |

Payment arithmetic: 609,757 CKB approved (post #21) − 121,952 CKB paid (post
#24) = **487,805 CKB outstanding**.

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
direction, in the same order under one payment hash.

## 4. What is and is not atomic here

Stated plainly, because the original proposal used the word loosely and that
should be corrected rather than repeated.

- **The swap is atomic.** One invoice, one payment hash, both legs settle or the
  hub refunds. That is CCH's existing HTLC mechanism, now exercised over an
  RGB++-issued asset.
- **The leap is not composed with the swap.** A CKB cell cannot carry the RGB++
  lock and a channel lock at once, so the conversion is a separate, verifiable
  on-chain step that precedes it. The pipeline is a sequence — leap → unlock →
  channel → swap — with the swap itself atomic. The claim that conversion and
  swap "succeed or fail together" is not achievable without changing the lock
  model; that sentence in the proposal was wrong, and this submission does not
  repeat it.

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
