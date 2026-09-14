# Demo Recording Script — UI Edition (W4 showcase)

Goal: prove the swap-ad market using only the web board at
`http://127.0.0.1:8000` — no terminal on camera except the final stop.
Total ~4 min. Browser full-window, zoom to ~125%. Each step has SHOW
(what to do/click) and SAY (word-for-word narration).

## Setup (do BEFORE hitting record, off camera)

```bash
cd /home/agate/Projects/fiber-rgbpp-swap
pkill -f "target/debug/fnn -c"; sleep 2
rm -rf work/fnn-a/fiber/store/* work/fnn-b/fiber/store/*
FIBER_SECRET_KEY_PASSWORD=test123 ./work/fiber/target/debug/fnn -c work/fnn-a/config.yml -d work/fnn-a > /tmp/fnn-a.log 2>&1 &
FIBER_SECRET_KEY_PASSWORD=test123 ./work/fiber/target/debug/fnn -c work/fnn-b/config.yml -d work/fnn-b > /tmp/fnn-b.log 2>&1 &
# wait 3–5 min until: ss -tlnp | grep -E "8327|8328|8828|8829"  → 4 lines
cd demo && (python3 -m http.server 8000 > /tmp/demo-ui.log 2>&1 &) ; cd ..
```

Open `http://127.0.0.1:8000`, reload once, confirm both status dots are
green and both books read *"No offers yet"*. Start recording.

## Record from here

### SHOT 0 — Intro (facecam or title card)

SAY:

> "Fiber moves assets fast off-chain, and RGB++ brings Bitcoin assets onto
> CKB. What's missing is a way to find out who will swap what, at what
> rate. So I built a market board: hubs broadcast signed offers, wallets
> just listen. This page is talking to two live nodes on my machine — let's
> watch it happen."

### SHOT 1 — The empty board (15s)

SHOW: Slow scroll from the journey strip down through both cards. Hover the
two green dots. Point at both *"No offers yet"* states.

SAY:

> "Left is the hub — it publishes offers. Right is the listener — it only
> discovers. Both books are empty, both nodes are online. At the top you can
> see the full journey: advertising and discovery are live today; the leap
> and the swap itself are the marked next milestones."

### SHOT 2 — Hub publishes at rate 100 (45s)

SHOW: Click into Rate, type `100` (fee stays 3000, days stays 1). Click
**Publish offer**. Keep the cursor still while it says *"signing &
broadcasting…"*. When the hub table gains its row, point at the rate, the
operator key, and the log strip entry.

SAY:

> "The hub posts an offer: swap this pair at rate 100, small fee, valid one
> day. It's signed with the hub's own key, so no one can forge it — and it
> expires on its own, so stale offers rot away. There it is in the hub's
> book. Note what I did *not* do: I sent nothing to the listener."

Fallback (only if the button spins past ~45s): say *"The network round-trip
is slow on this loaded machine — but watch the table, not the button,"*
and let the auto-refresh reveal the row. Do not click twice (each click is
one offer).

### SHOT 3 — Connect the nodes (20s)

SHOW: The peer address field is already filled. Click **Connect hub →
listener**. Point at the log line *"Peering requested"*.

SAY:

> "One click peers them — a bare IP address, no central server, no registry.
> From here on, everything the listener learns arrives over gossip."

### SHOT 4 — The money shot: the listener discovers it (40s)

SHOW: Say nothing for a few seconds; let an auto-refresh tick visibly. When
the listener table gains the `100` row, point at it, then at the best-rate
banner, then at journey stage 2 flipping to ✓.

SAY (after a two-beat pause, letting the viewer read it first):

> "And there it is. Nobody told the listener anything — it found the hub's
> offer through gossip sync, the same channel Fiber uses for routing. Best
> rate already shows 100. *That discovery, without asking, is the entire
> project.*"

If it takes longer than ~30s: say *"Gossip syncs in rounds — one more
refresh cycle,"* wait for the next 5s tick on camera (patience reads as
confidence), or cut the wait in editing.

### SHOT 5 — A better offer wins (45s)

SHOW: Back on the left card, change Rate to `200`, click **Publish offer**.
Wait for the hub table to show two rows. Then watch the right card: best
banner flips to 200.

SAY:

> "Now the hub posts a better offer — 200. Watch the right side: two offers
> now, and best-rate jumps to 200 by itself. A wallet never negotiates, never
> messages the hub. It reads the board and takes the biggest number. That is
> a market."

### SHOT 6 — Both books agree (15s)

SHOW: Scroll slowly so both tables are visible side by side (zoom out one
notch if needed). Point left, then right: same two rows, same best.

SAY:

> "Left and right, identical books on two independent databases. That
> convergence is gossip doing its job — and everything you just saw is also
> available as API and CLI for the engineers."

### SHOT 7 — Outro (10s)

SHOW: Scroll back up to the journey strip. Point at stages 3–4.

SAY:

> "Stages one and two, live, just demonstrated. The leap and the atomic swap
> ride on proven code and are the marked next milestones. Code and docs are
> linked below. Thanks for watching."

Stop recording. Then off camera: `pkill -f "target/debug/fnn -c"`.

## If something deviates on camera

- Dots red / books stuck on "loading…" → a node isn't up; wait 60s, reload.
- Publish spins long → don't re-click; the row appears via auto-refresh.
- Listener empty past ~30s → click **Connect** once more, wait one more cycle.
- Books show old offers after a restart days later → they expired (1-day
  validity); publish fresh ones — that rot is a feature, say so.
- Keep a terminal with `tail -f /tmp/fnn-*.log` off-screen, not on camera.
