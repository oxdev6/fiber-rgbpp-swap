Hi all — quick update on Fiber RGB++ Swap, W1–W3 are done.

Week 1 was setup and design. Got a local fork of fiber running, stood up two testnet nodes on my machine (one on 8828/8327 and one on 8829/8328), and finalized the SwapAdvertisement message — basically a signed note from a hub saying “I’ll swap this pair at this rate/fee, valid until this time”.

Week 2 was wiring that message into Fiber’s gossip. It’s now a proper broadcast message alongside NodeAnnouncement/ChannelAnnouncement, with signing/verification and expiry handling. The store and graph both know how to handle it.

Week 3 was the discovery part. Hubs can now publish an ad (signed with their node key), and anyone can list active ads or ask for the best rate for a pair. That’s exposed both as RPC and as fnn-cli swap_ad commands.

Tested live with two nodes:

I published an ad on node A (rate 10B), listed on A — saw 1. Connected A to B, listed on B after a few seconds — saw the same 1. Published a second ad on A with a higher rate (20B), listed on A — saw 2, and after about 20 seconds B also saw 2. get_best on both correctly returned the higher one. Same results via curl and via fnn-cli.

It’s all on my fork and the docs repo:

- Code: https://github.com/oxdev6/fiber/tree/feat/swap-advertisement
- Docs + smoke logs: https://github.com/oxdev6/fiber-rgbpp-swap

Next: Week 4 — clean up the hub setup docs, record a short demo video, and post the write-up here.

Happy to fix anything you spot in review. Thanks!
