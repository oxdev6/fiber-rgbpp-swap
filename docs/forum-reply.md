Hi xingtian, committee,

I won't argue with the review. At the point you closed the project, two of the
three findings were correct: there was no swap, and nothing had been validated
on a real testnet. I was running local nodes against a local chain and calling
that testing. That was my mistake, not a misunderstanding of the milestone.

Since then I finished the part that was missing, on testnet3, with the asset
issued fresh for the run:

- RGB++ issuance, leap into the BTC time lock, unlock with an SPV proof of the
  leap transaction, transfer into the trading node: six transactions across
  Bitcoin and CKB, with block heights.
- A Fiber channel carrying that exact asset, an advertisement at rate 100, and
  a swap that settled: 1 unit of the asset for 100 CKB, order Success.

The dossier is `docs/submission.md` in
https://github.com/oxdev6/fiber-rgbpp-swap, with an explorer link for every
hash. There is also a script that re-checks all six against the public
explorers, so nothing depends on my write-up:

    bash scripts/verify-evidence.sh

Two things I want to be straight about, because the proposal overstated them.

First, the swap is atomic: one invoice, both legs settle or the hub refunds.
The leap is not atomic with it. A cell cannot hold the RGB++ lock and a channel
lock at the same time, so the conversion has to be a separate on-chain step
before the swap. "Conversion and swap composed so that they succeed or fail
together" was not achievable without changing the lock model, and I should have
said so in the proposal instead of writing it as a goal.

Second, the refund path is still only unit-tested. I did not force a live
timeout against the testnet nodes.

On the budget: the notice cites $1,000, but the scope was revised to $500 in
post #18 and I accepted it in #19, and the plan in #20 that I was paid against
has no swap in it. I am not asking for the stopped balance. I would like the
public record to say which baseline governed, and if it is the $1,000 one, then
the swap that baseline required now exists and can be verified above.

Happy to walk through the run live if that is more useful than reading it.

Carl (@oxdev6)
