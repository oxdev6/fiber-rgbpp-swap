# Discussion #1243 Post Draft — W1-07

**Target:** `https://github.com/nervosnetwork/fiber/discussions/1243` — “Fiber CCH Summary and Future Plan”
**Author:** Carl (@oxdev6) — as per proposal contact
**When:** W1-07 (to close duplicate-effort risk)

## Draft Markdown to Post

```markdown
Hi team — quick heads-up from the Spark “Fiber RGB++ Swap” grant (approved $500/4w, post #20 on Nervos Talk).

For W1 I’m focusing on the advertisement layer you called out as the fix for CCH’s single-pair limit: signed operator ads broadcast via gossip.

**Plan for W1-2:** add a new gossip message type `SwapAdvertisement` (union id 3 on `BroadcastMessage`) carrying `chain_hash, base_udt_script, quote_udt_script, rate Uint128, fee_rate Uint128, operator_pubkey Pubkey, timestamp Uint64, expiry Uint64, signature EcdsaSignature(64)`. Signed as `blake2b_256(canonical_bytes_without_sig)` with secp256k1 ECDSA, same as `NodeAnnouncement`, verified on receive with `expiry > now` and `timestamp <= now+60s` drift.

.Full draft schema: https://github.com/oxdev6/Fiber-RGB-Swap/blob/main/docs/schema-draft.md (or local gist link) — flat table, `Cursor` = `timestamp BE + union_id 3 + blake2b_256(content)[32]+4zero`, relayed via existing `GossipMessage::BroadcastMessagesFilterResult` / `GetBroadcastMessages` active+passive sync, pruned on `expiry` + 14d/28d stale.

This is opt-in (extended `fnn` only, stock nodes ignore unknown union id, no hard fork), reusing `GossipMessageStore` + `SubscribableGossipMessageStore` + `PeerFilterProcessor` fanout.

**Question before I build:** is anyone already working on this advertisement/negotiation piece, and any objection to the schema/union_id/signing choice above? Want to avoid duplicate effort and align with your preferred `rate` denom / `fee_rate` units (proportional millionths vs absolute).

Work branch: `feat/swap-advertisement` off `develop@04e091b0` (work/fiber). Warming up two local testnet peers `fnn-a`/`fnn-b` on `https://testnet.ckbapp.dev/`.

Thanks!
```

## After Posting Checklist
- [ ] Post the above to Discussion #1243 (needs GitHub login as `oxdev6`).
- [ ] Save URL of posted comment to this file (edit below).
- [ ] Screenshot response (if any) within 24h.

**Posted URL:** _to be filled after manual post_

**Screenshot:** _attach_

## Notes
- Do not start W2 code until at least 24h after posting or until team confirms no conflict.
- Schema draft file: `docs/schema-draft.md` (this repo).

