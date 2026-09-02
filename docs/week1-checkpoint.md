# Week 1 Checkpoint — Verifiable Outputs

**Date:** 2026-08-31
**Branch:** `work/fiber` `feat/swap-advertisement` @ `04e091b0` (#1539)
**Scope:** W1 Design & setup ($100) — per Post #20 (https://talk.nervos.org/t/spark-program-fiber-rgb-swap/10487/20)

## 1. Env & Fork (W1-01)
- **Pinned upstream:** `04e091b08953368aa5ee977f562ad628c3000ff4` (`docs/pinned-upstream.md`)
- **Toolchain:** `1.95.0` (rust-toolchain.toml) — available
- **Cargo checks:**
  - `cargo +1.95.0 check -p fiber-types --locked` — **PASS** (Finished dev profile in 52.40s, EXIT 0)
  - `cargo +1.95.0 check -p fiber-bin --no-default-features --features sqlite --locked` — **PASS** (Finished in 2m53s, EXIT 0) — proves `fiber-bin`/`fnn` compiles with sqlite (default rocksdb fails `stdbool.h` without clang, avoided via sqlite feature)
- **CKB binary:** `ckb 0.202.0 (d0a6c95)` at `/home/agate/.local/bin/ckb`

**Verify:**
```bash
git -C work/fiber rev-parse HEAD # 04e091b08953368aa5ee977f562ad628c3000ff4
git -C work/fiber branch --show-current # feat/swap-advertisement
cat work/fiber/rust-toolchain.toml
```

## 2. CKB Testnet (W1-02)
- **RPC URL:** `https://testnet.ckbapp.dev/` (from `work/fiber/config/testnet/config.yml:88`)
- **Probe:**
```bash
curl -s -X POST https://testnet.ckbapp.dev/ -d '{"id":2,"jsonrpc":"2.0","method":"get_tip_header","params":[]}' | jq .
# result.hash 0x8fbe36c6bf3f98e8f8ccc60e6f76f061dc063acb2afdacaf8c59cc7e04fd53f9, number 0x153b762
curl -s -X POST https://testnet.ckbapp.dev/ -d '{"id":2,"jsonrpc":"2.0","method":"get_blockchain_info","params":[]}' | jq .result.chain
# "ckb_testnet", is_initial_block_download false
```
- **Docs:** `docs/env.md`

## 3. Fiber fnn ×2 (W1-03)
- **Configs:**
  - `work/fnn-a/config.yml` — `fiber.listening_addr /ip4/127.0.0.1/tcp/8828`, `rpc 127.0.0.1:8327`, `announced_node_name fnn-a-swap-ad`, `chain: testnet`, `udt_whitelist: RUSD`
  - `work/fnn-b/config.yml` — `fiber.listening_addr /ip4/127.0.0.1/tcp/8829`, `rpc 127.0.0.1:8328`, `announced_node_name fnn-b-swap-ad`
- **Status:** Configs prepared and verified. Binary `fnn` build attempted (`cargo build -p fiber-bin --no-default-features --features sqlite`) — failed initially `No space left on device` (2.7G target, disk 100% → freed to 2.7G free by `rm work/fiber/target`). Cargo **check** passes, so compilability proven; full build deferred to W2 when more disk freed (e.g., clean `logos/lp-0002-private-multisig/target` 7.3G with approval) or use prebuilt release.
- **Docs:** `docs/w1-03.md`

**Verify:**
```bash
cat work/fnn-a/config.yml | grep -E "listening_addr|announced_node_name"
cat work/fnn-b/config.yml | grep -E "listening_addr|announced_node_name"
ls -lh work/fnn-*/config.yml
```

## 4. Gossip Deep-Read (W1-04)
- **Files read:** `crates/fiber-types/src/schema/gossip.mol:1` (Cursor[45], BroadcastMessage union, GossipMessage union), `fiber.mol:1` (ChannelUpdate), `blockchain.mol:1`, `crates/fiber-lib/src/fiber/gossip.rs:1` (GossipMessageStore, GossipActor, GossipSyncingActor, PeerFilterProcessor, DelayedGossipMessageQueue)
- **Output:** `docs/gossip-notes.md` — cursor layout, message types, store trait, active vs passive sync, validation, 5 call sites to extend

## 5. Requirements (W1-05)
- **Output:** `docs/requirements.md` — FR-01..06 (broadcast/validation/relay/persistence/expiry/query), NFR opt-in/rate-limit/no new transport, out-of-scope leap/swap, open questions on rate denom/fee

## 6. Schema Draft (W1-06)
- **Output:** `docs/schema-draft.md` — proposed `SwapAdvertisement` table (signature Ecdsa 64, chain_hash Byte32, base/quote ScriptOpt, rate Uint128, fee_rate Uint128, operator_pubkey Pubkey 33, timestamp Uint64, expiry Uint64), union id 3, Cursor `timestamp BE + 3 + blake2b_256[32]+4zero`, signing `blake2b_256` + ECDSA as NodeAnnouncement, verification checks, example JSON, store integration sketch

## 7. Discussion Post (W1-07)
- **Output:** `docs/discussion-post.md` — draft markdown for `https://github.com/nervosnetwork/fiber/discussions/1243` (to be posted manually as `@oxdev6`), closing duplicate-effort risk, waiting 24h before W2 code

## 8. Next (W2)
- W2-01 Molecule + types (union id 3, regen)
- W2-02 Sign/verify
- W2-03 Store
- W2-04 Broadcast/relay
- W2-05 Sync (active+passive generic)
- W2-06 Rate-limit
- W2-07 Tests (`cargo nextest run test_swap`)
- W2-08 Two-node smoke (hub broadcast → listener parsed, log to `docs/week2-smoke.md`)

**Reviewer one-liner:** `ls docs/*.md && cat docs/week1-checkpoint.md` shows all W1 artifacts verifiable without running code; W1-02 RPC probe replicable via curl.

**Known blocker:** Disk space (`/dev/nvme0n1p2 2.7G free` after cleanup). Mitigation noted in `docs/w1-03.md`; does not block W1 deliverables (all docs/checks), but W2 binary build will need additional cleanup.

