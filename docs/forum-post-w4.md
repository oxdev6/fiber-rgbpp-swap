Hi all — Week 4 done, and with it the full $500 scope. Closing update on Fiber RGB++ Swap.

What Week 4 was: testing, demo, docs.

**Testing.** Ran the complete two-node flow on local testnet nodes: hub publishes a signed ad, listener discovers it over gossip sync, best-rate picks the max, both books converge. Also verified expiry pruning (day-old ads correctly disappear from listings) and the CLI (`fnn-cli swap_ad …`) returning identical results to the API. One real bug found and fixed along the way: publishes originally only saved locally and waited on the peer's next scheduled poll — now publish also pushes straight into the gossip actor, so ads arrive within seconds, no manual re-sync. Details and curl logs are in the repo.

**Demo.** Recorded the whole thing on the market board UI I built for this (single HTML file, no build step) — publish on the left, watch it appear on the right, best-rate flip when a better offer lands:

https://drive.google.com/file/d/1aTsZ2Wqp3wROZkPkbuVD1f9v7Aom6hZV/view?usp=sharing

**Docs.** Everything needed to run your own advertising node is in the repos: node configs, one-command run/stop scripts (`scripts/run.sh --fresh`), the API/CLI reference, and a testing guide including the quirks I hit (slow first boot on testnet init, publish responses lagging on loaded machines while the write still lands). The swap-ad message schema and gossip integration points are documented for anyone extending this to a third asset pair.

**Repos:**
- Code (fiber fork, branch feat/swap-advertisement): https://github.com/oxdev6/fiber
- Docs, board UI, run scripts, test logs: https://github.com/oxdev6/fiber-rgbpp-swap

**Where this lands against the proposal:** W1 design + schema, W2 gossip type and signing/verification, W3 discovery index with RPC/CLI, W4 testing plus demo plus docs — all four delivered. The leap and the generalized swap execution stay exactly where the revised scope put them: follow-on work, with the design notes from my CCH deep-dive ready to become that proposal.

Thanks to everyone who commented along the way — Matt's OP_RETURN question and Arthur's Liquidity Ads parallel both shaped the final design. Happy to address any review points.
