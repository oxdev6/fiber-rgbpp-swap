# Fiber RGB++ Swap — completion record

What was agreed, what was delivered, and where each claim can be checked.

## 1. Two records that do not match

The termination notice and the payment history describe different grants.

| | Revised scope (what was paid) | Notice (what was judged) |
|---|---|---|
| Baseline | [$500 / 4 weeks](https://talk.nervos.org/t/spark-program-fiber-rgbpp-swap/10487/18) | [$1,000](https://talk.nervos.org/t/spark-program-fiber-rgbpp-swap/10487/30) |
| RGB++ integration | removed from scope | required |
| Deliverables | [design, gossip, discovery, testing](https://talk.nervos.org/t/spark-program-fiber-rgbpp-swap/10487/20) | "at least the core Swap functionality" |
| Approved | [609,757 CKB](https://talk.nervos.org/t/spark-program-fiber-rgbpp-swap/10487/21) | — |
| Paid | [121,952 CKB (20%)](https://talk.nervos.org/t/spark-program-fiber-rgbpp-swap/10487/24) | — |

I accepted the revision in [post 19](https://talk.nervos.org/t/spark-program-fiber-rgbpp-swap/10487/19).
The four-week plan in post 20 contains no swap stage.

The second mismatch is the artifact. The notice describes hardcoded data and
no testnet verification. That matches the August scaffold shared in
[post 10](https://talk.nervos.org/t/spark-program-fiber-rgbpp-swap/10487/10),
whose leap logic was explicitly simulated
([post 13](https://talk.nervos.org/t/spark-program-fiber-rgbpp-swap/10487/13)).
The delivered work was the fork at
[oxdev6/fiber, branch `feat/swap-advertisement`](https://github.com/oxdev6/fiber/tree/feat/swap-advertisement),
tested against CKB testnet (chain hash `0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606`
in `node_info`), with rates, signatures and expiries generated per publish.
The notice's own "Related Links" line still reads "Cell Sandbox (placeholder
— please confirm)", which is a different project.

## 2. Delivered under the $500 scope

| Week | Deliverable | Where |
|---|---|---|
| 1 | `SwapAdvertisement` schema, fork pinned, two testnet nodes | [`crates/fiber-lib/src/fiber/gossip.rs`](https://github.com/oxdev6/fiber/blob/feat/swap-advertisement/crates/fiber-lib/src/fiber/gossip.rs) |
| 2 | signing, verification, expiry, gossip relay | [`crates/fiber-lib/src/fiber/network.rs`](https://github.com/oxdev6/fiber/blob/feat/swap-advertisement/crates/fiber-lib/src/fiber/network.rs) |
| 3 | discovery index, RPC, CLI | [`crates/fiber-lib/src/fiber/swap_advertisement.rs`](https://github.com/oxdev6/fiber/blob/feat/swap-advertisement/crates/fiber-lib/src/fiber/swap_advertisement.rs), [`crates/fiber-lib/src/rpc/swap_ad.rs`](https://github.com/oxdev6/fiber/blob/feat/swap-advertisement/crates/fiber-lib/src/rpc/swap_ad.rs) |
| 4 | tests, demo, docs | [running a node](https://github.com/oxdev6/fiber-rgbpp-swap/blob/main/docs/TESTING.md), [market board](https://github.com/oxdev6/fiber-rgbpp-swap) |

## 3. Delivered beyond it: the swap, on testnet3

On 2026-10-20, one asset, issued fresh for the run:

`0xeb4963dbd4e5af3047326a377a6817c31deee19e415da5215a603d264331f7b2`

| Stage | Bitcoin | CKB |
|---|---|---|
| RGB++ issuance | [4fc006d8369ec621afadbe8b6d20258097912d4c90ba0e58935ed38672e081fc](https://mempool.space/testnet/tx/4fc006d8369ec621afadbe8b6d20258097912d4c90ba0e58935ed38672e081fc) (block 5195883) | [0xfc29fb99fb07a237e4736a7dac0122ec43c78459d6f460d3858d5b5e796bf671](https://testnet.explorer.nervos.org/transaction/0xfc29fb99fb07a237e4736a7dac0122ec43c78459d6f460d3858d5b5e796bf671) (block 22805185) |
| leap into BTC time lock | [312f1bc29e7c7770ddfb2cc8fb91267f3026126ba8242eadebde3682f60370bb](https://mempool.space/testnet/tx/312f1bc29e7c7770ddfb2cc8fb91267f3026126ba8242eadebde3682f60370bb) (block 5195884) | [0x958d8fab158551f19b3f83d66c9c2fddc7e46f4d1a0867a4515420973c245f1b](https://testnet.explorer.nervos.org/transaction/0x958d8fab158551f19b3f83d66c9c2fddc7e46f4d1a0867a4515420973c245f1b) (block 22805330) |
| unlock via SPV proof | — | [0xe9fb7df0aa465c3d6e605244ab3551b93dbad53c1b7550b92950d02d324f91ef](https://testnet.explorer.nervos.org/transaction/0xe9fb7df0aa465c3d6e605244ab3551b93dbad53c1b7550b92950d02d324f91ef) (block 22806239) |
| transfer to trading node | — | [0xe5eb776a53b360aa14378d319726a05bca3a8683c004379185fa10cec9909ed1](https://testnet.explorer.nervos.org/transaction/0xe5eb776a53b360aa14378d319726a05bca3a8683c004379185fa10cec9909ed1) (block 22806243) |

Then in Fiber:

- channel `0xbdfbc4511046bbef056bd3173b9a10083b898f734b660cd16b4f39c13d9a4cf8`
- advertisement `0x0668dd84ada4a4597deb45c9d705516e7ceb71fe48e1608aaa4ebdb4b93fdcd5`, rate 100.0, quote CKB
- payment hash `0x2823d3ec5242502c2e0d3303663c56ff91ba765ad3144e462fc8de8d3b67cdb0`
- order **Success**, 1 unit of the asset for 100 CKB

Channel balances on the node that paid the asset, before → after:

- UDT: `2099999900000000` / `0` → `2099999900000000` / `100000000`
- CKB: `30000100000` / `4960099900000` → `40000100000` / `4950099900000`

The asset moved one unit and the CKB side moved exactly 100 CKB the other way,
in the same order under one payment hash.

The code that executed it:
[`execute_swap`](https://github.com/oxdev6/fiber/blob/feat/swap-advertisement/crates/fiber-lib/src/rpc/cch.rs),
[`get_swap_order`](https://github.com/oxdev6/fiber/blob/feat/swap-advertisement/crates/fiber-lib/src/rpc/cch.rs),
[swap actions](https://github.com/oxdev6/fiber/blob/feat/swap-advertisement/crates/fiber-lib/src/cch/actions/swap_actions.rs).

The run itself is scripted and resumable:
[`scripts/e2e-swap.py`](https://github.com/oxdev6/fiber-rgbpp-swap/blob/main/scripts/e2e-swap.py),
[`scripts/e2e-run.sh`](https://github.com/oxdev6/fiber-rgbpp-swap/blob/main/scripts/e2e-run.sh),
stage-by-stage notes in
[`docs/l3-orchestration.md`](https://github.com/oxdev6/fiber-rgbpp-swap/blob/main/docs/l3-orchestration.md).

## 4. Checking it

```
git clone https://github.com/oxdev6/fiber-rgbpp-swap
cd fiber-rgbpp-swap
bash scripts/verify-evidence.sh
```

The script reads
[`docs/evidence-state.json`](https://github.com/oxdev6/fiber-rgbpp-swap/blob/main/docs/evidence-state.json),
queries the public CKB and Bitcoin testnet APIs for each hash, prints the block
height and explorer URL, and exits non-zero if anything is missing. It does not
touch my machines and needs no call with me.

Last run: six of six `OK`, exit 0.

## 5. Corrections to the original proposal

Two sentences in the proposal were wrong, and I would rather fix them than
repeat them.

- The swap is atomic: one invoice, one payment hash, both legs settle or the hub
  refunds. The **leap is not atomic with it**. A cell cannot carry the RGB++
  lock and a channel lock at once, so the conversion is a separate on-chain
  step that precedes the swap. "Conversion and swap composed so that they
  succeed or fail together" is not achievable without changing the lock model.
- The refund path is covered by unit tests and by live validation failures
  ([`docs/s4-evidence.md`](https://github.com/oxdev6/fiber-rgbpp-swap/blob/main/docs/s4-evidence.md):
  rate mismatch, expired ad, unknown ad — all rejected with no funds moved).
  A live mid-flight timeout was not staged.

## 6. Against the $1,000 baseline

| Requirement | State | Evidence |
|---|---|---|
| RGB++ asset issued and usable | done | issuance pair, section 3 |
| leap out of the RGB++ lock | done | leap pair, section 3 |
| swap through a Fiber channel | done | order Success, section 3 |
| verified on a public network | done | `scripts/verify-evidence.sh` |
| built on Fiber, not beside it | done | runs in the CCH path, links in section 3 |
