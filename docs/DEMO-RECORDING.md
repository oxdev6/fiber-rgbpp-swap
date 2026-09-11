# Demo Recording Script — Swap-Ad Discovery (W3/W4 showcase)

Goal of the video: prove a hub can advertise a swap rate and a second node
discovers it over gossip, then picks the best rate. Total ~5 min.
Record one terminal, large font. Each step has SHOW (commands) and SAY
(word-for-word narration, plain language).

## Setup (do BEFORE hitting record)

```bash
cd /home/agate/Projects/fiber-rgbpp-swap
pkill -f "target/debug/fnn -c"; sleep 2
rm -rf work/fnn-a/fiber/store/* work/fnn-b/fiber/store/*
FIBER_SECRET_KEY_PASSWORD=test123 ./work/fiber/target/debug/fnn -c work/fnn-a/config.yml -d work/fnn-a > /tmp/fnn-a.log 2>&1 &
FIBER_SECRET_KEY_PASSWORD=test123 ./work/fiber/target/debug/fnn -c work/fnn-b/config.yml -d work/fnn-b > /tmp/fnn-b.log 2>&1 &
```

Wait 3–5 min until all four ports listen (P2P first, RPC later):

```bash
ss -tlnp | grep -E "8327|8328|8828|8829"
# expect 4 lines: 8828, 8829, 8327, 8328
```

## Record from here

### SHOT 0 — Intro (facecam or title card, no commands)

SAY:

> "Fiber already moves assets fast off-chain, and RGB++ brings Bitcoin
> assets onto CKB. What's missing is a way to find out who will swap what,
> at what rate. So I built a market layer: hubs broadcast signed ads over
> gossip, wallets just listen. Let me show you it working with two nodes on
> my machine."

### SHOT 1 — Both nodes are alive, listener starts empty (10s)

SHOW:

```bash
curl -s -m 10 -X POST http://127.0.0.1:8327 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"node_info","params":[]}' | head -c 250; echo
curl -s -m 10 -X POST http://127.0.0.1:8328 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"node_info","params":[]}' | head -c 250; echo
curl -s -m 15 -X POST http://127.0.0.1:8328 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}'
# expect {"offers":[]}
```

SAY:

> "This is the hub on port 8327, and this is the listener on 8328. Same
> software, fresh databases. And look — the listener's offer book is empty.
> It knows nothing yet. Remember that."

### SHOT 2 — Hub publishes an ad at rate 100 (30–60s)

SHOW:

```bash
curl -s -m 150 -X POST http://127.0.0.1:8327 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"publish_swap_advertisement","params":[{"base_udt_script":null,"quote_udt_script":null,"rate":"0x2540be400","fee_rate":"0xbb8","expiry_delta_millis":"0x5265c00"}]}'
# expect {...,"rate":"0x2540be400",...,"operator_pubkey":"0230c7...","is_expired":false}
```

SAY:

> "Now the hub publishes an offer: I'll swap this pair at rate 100, small
> fee, valid for one day. It's signed with the hub's own key, so nobody can
> fake it — and the signature is checked by every node that receives it."

SHOW (confirm on hub):

```bash
curl -s -m 15 -X POST http://127.0.0.1:8327 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('hub offers:', len(d['result']['offers']))"
# expect: hub offers: 1
```

SAY:

> "The hub's own book now shows one offer. And note — nothing was sent to
> the listener directly. Keep that in mind."

Fallback (only if publish stalls ~45s with no response): Ctrl-C, then run
the hub `list` above — the write lands server-side even when the response
is slow on a loaded machine, and the list proves it.

### SHOT 3 — Connect hub → listener (15s)

SHOW:

```bash
curl -s -m 15 -X POST http://127.0.0.1:8327 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"connect_peer","params":[{"address":"/ip4/127.0.0.1/tcp/8829/p2p/QmdccqCxFC8jSf6vj9cob7gRxHWEuMaji9HaHaKV6nATYJ"}]}'
# expect {"result":null}
sleep 8
curl -s -m 15 -X POST http://127.0.0.1:8327 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"list_peers","params":[]}' | head -c 300; echo
# expect peers[] to contain 8829/QmdccqCx...
```

SAY:

> "Now I connect them directly — just an IP address. No bootnodes, no
> central server, no discovery service. They're simply peers now."

### SHOT 4 — The money shot: listener discovers the ad (30s)

SHOW:

```bash
sleep 20
curl -s -m 15 -X POST http://127.0.0.1:8328 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"list_swap_advertisements","params":[{"base_udt_script":null,"quote_udt_script":null}]}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('listener offers:', len(d['result']['offers'])); [print(' rate:', o['rate']) for o in d['result']['offers']]"
# expect: listener offers: 1 / rate: 0x2540be400
```

SAY (pause two beats on the output before speaking, let the viewer read
the `1 offer` themselves):

> "And here it is. Without anyone telling it, the listener now shows the
> hub's offer — same rate, same operator key. It learned it through gossip
> sync, the same channel Fiber already uses for routing info. That
> discovery, without asking, is the entire project."

### SHOT 5 — Second ad at rate 200, best-rate wins (60s)

SHOW:

```bash
curl -s -m 150 -X POST http://127.0.0.1:8327 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"publish_swap_advertisement","params":[{"base_udt_script":null,"quote_udt_script":null,"rate":"0x4a38b2e00","fee_rate":"0xbb8","expiry_delta_millis":"0x5265c00"}]}' | head -c 200; echo
sleep 20
curl -s -m 15 -X POST http://127.0.0.1:8328 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"get_best_swap_rate","params":[{"base_udt_script":null,"quote_udt_script":null}]}' | python3 -c "import json,sys; print('best:', json.load(sys.stdin)['result']['offer']['rate'])"
# expect: best: 0x4a38b2e00
```

SAY:

> "Now the hub posts a better offer — rate 200. Give it one sync round…
> and best-rate returns 200 on the listener. A wallet never needs to
> negotiate or message the hub. It just reads the board and picks the
> biggest number. That's a market."

### SHOT 6 — Same via CLI, both nodes agree (20s)

SHOW:

```bash
./work/fiber/target/debug/fnn-cli --url http://127.0.0.1:8327 swap_ad list_swap_advertisements | grep -c "rate:"
# expect 2
./work/fiber/target/debug/fnn-cli --url http://127.0.0.1:8328 swap_ad list_swap_advertisements | grep -c "rate:"
# expect 2
./work/fiber/target/debug/fnn-cli --url http://127.0.0.1:8328 swap_ad get_best_swap_rate | grep "rate:"
# expect rate: '0x4a38b2e00'
```

SAY:

> "Same data through the command line instead of raw API calls. Hub shows
> two offers, listener shows the same two, and both agree the best is 200.
> Two independent databases, converged — that's gossip doing its job."

### SHOT 7 — Outro, stop nodes (5s)

SHOW:

```bash
pkill -f "target/debug/fnn -c"; sleep 2; echo stopped
```

SAY:

> "So that's it: publish, discover, best-rate — a signed, expiring market
> riding on Fiber gossip, built for RGB++ swaps. Code is on my fiber fork,
> branch feat/swap-advertisement, docs and test logs in fiber-rgbpp-swap.
> Next step is wiring the actual swap behind the ads. Thanks for watching."

## If something deviates on camera

- `Connection refused` on `:8327`/`:8328` → RPC not up yet; wait 60s, re-run.
- `publish` stalls → Ctrl-C after ~45s, run `list` (ad will be there).
- `peers[]` empty → wait 10s, retry `connect_peer` once.
- Listener still 0 offers after 25s → wait one more 20s round (second batch).
- `list` empty after a restart days later → old ads expired (1-day `expiry`);
  publish fresh ones.
