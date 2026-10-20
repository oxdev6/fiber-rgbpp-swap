Hi xingtian, committee,

I think the review and the project were looking at two different things. Three
specifics first, then my claim.

**The confusion.**

1. The notice judges against the $1,000 baseline requiring "at least the core
   functions of the Swap component". That baseline was superseded on
   2026-08-13: post #18 removed the RGB++ integration from scope and set the
   grant to $500 / 4 weeks, I accepted in #19, the plan is #20, and 609,757 CKB
   was approved on that basis in #21 with 121,952 CKB paid in #24. The plan in
   #20 has no swap stage in it. Measured against the baseline that was actually
   contracted, all four weeks were delivered.

2. "仅用写死的数据进行模拟" does not describe what was delivered. The delivery
   was the fork at oxdev6/fiber, branch feat/swap-advertisement, and the W1–W4
   testing in posts #26 and #29 ran on CKB testnet — chain hash 0x10639e08…
   in node_info — with every rate, signature, timestamp and expiry generated
   per publish. Hardcoded mock hashes are the August scaffold from post #10,
   whose leap logic was explicitly simulated. The notice's own "Related Links"
   still reads "Cell Sandbox (placeholder — please confirm)", which points at a
   different project, so the review file looks like it was assembled from that
   old link.

3. One finding was true: there was no swap, and no swap-level evidence on a
   public network, at close on 2026-09-15. That scope was removed in #18, but it
   is the project's stated purpose, so I am not going to hide behind the
   revision. It is the gap I closed.

**The claim.**

Because the swap and its testnet validation now exist, I am claiming the
original $1,000 baseline, not the reduced one.

On testnet3, with an asset issued fresh for the run:

- RGB++ issuance, leap into the BTC time lock, unlock with an SPV proof of the
  leap transaction, transfer into the trading node: six transactions across
  Bitcoin and CKB, block 5195883–5195884 on Bitcoin and 22805185–22806243 on
  CKB.
- A Fiber channel carrying that exact asset, an advertisement at rate 100, and
  a swap that settled: 1 unit of the asset for 100 CKB, order 0x2823d3ec…
  Success, under one payment hash.

The dossier is docs/submission.md in
https://github.com/oxdev6/fiber-rgbpp-swap with an explorer link per hash, and
there is a script that re-checks all six against the public explorers so
nothing rests on my write-up:

    bash scripts/verify-evidence.sh

That script is the acceptance test. It needs no code review and no live call.

**Two corrections I owe you.** The swap is atomic — one invoice, both legs
settle or the hub refunds. The leap is not atomic with it: a cell cannot hold
the RGB++ lock and a channel lock at once, so the conversion has to be a
separate on-chain step before the swap. "Conversion and swap composed so that
they succeed or fail together" was not achievable without changing the lock
model, and I should have said that in the proposal instead of writing it as a
goal. Separately, the refund path is still unit-tested only; I did not force a
live timeout.

**What I am asking for:** re-evaluation against the $1,000 baseline, and
release of the outstanding 487,805 CKB (609,757 approved − 121,952 paid) if
that baseline is met. If the committee would rather keep the project closed,
then at least let the public record show which baseline governed, because the
notice and the payment history name different ones.

Carl (@oxdev6)
