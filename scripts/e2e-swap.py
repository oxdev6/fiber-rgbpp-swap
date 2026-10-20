#!/usr/bin/env python3
"""L3 orchestrator — chain the whole RGB++ -> swap pipeline, printing every
reference at each stage.

Stages, in order:
  market   pick the best advertisement for (base, quote) from the hub
  leap     CKB RGB++ lock -> BTC_TIME lock   (sidecar: testnet3-leap.js)
  unlock   BTC_TIME lock  -> plain xUDT      (sidecar: testnet3-unlock.js)
  fund     ensure the user holds a UDT channel carrying the asset
  swap     execute_swap on the hub, pay the base invoice, wait for settlement
  report   emit the reference chain (BTC tx, CKB txs, order, channel deltas)

`leap`+`unlock` are the slow stages: each needs the other chain to confirm
(SPV), so a truly fresh run takes ~1-2h. Pass --skip-leap to chain from
"asset already a plain UDT" (the leap/unlock references are then read from
the recorded state files and still appear in the report).

Usage:
  e2e-swap.py [--hub URL] [--user URL] [--base ARGS] [--rate N]
              [--skip-leap] [--from STAGE] [--only STAGE] [--dry]
"""
import json, os, re, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HUB = "http://127.0.0.1:8327"
USER = "http://127.0.0.1:8328"
XUDT_CODE = "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb"
BASE_ARGS = "0xd045213e601bcf592cac347c69f65caf3a0fe0201e5b33dad03f06b62700fceb"  # RGB++ asset
UNITS = 100000000          # 1 UDT unit (8 decimals)
DEFAULT_SEAL = "1ce1026e53a022d0bae9ca0fa36d517e5403a0838d2d83c4c843d095e77064f0:1"
B_ADDR = "ckt1qyqf6vpwj39mh4vzwvhjeu4rrscn8fppeg0svt70ms"          # node B wallet
HUB_PUBKEY = "02a716c45b2c2a28e8f7b299fa779acccb1eba669025c4d70704008453f2ee6fe5"
STATE_FILE = ROOT / "localnet" / "e2e-state.json"
REF = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
if REF.get("unique_id"):                      # resume: adopt the fresh asset
    BASE_ARGS = REF["unique_id"]
    UDT = {"code_hash": XUDT_CODE, "hash_type": "type", "args": BASE_ARGS}
# References from the recorded (already executed) leap + unlock, used on the
# --skip-leap path so the report still carries the full on-chain chain.
RECORDED = {
    "leap_ckb_tx": "0xa3e94654f5d4d3db242671249cd52a3157e99f63e6e339880142b3041ae111c1",
    "leap_btc_tx": "1ce1026e53a022d0bae9ca0fa36d517e5403a0838d2d83c4c843d095e77064f0",
    "unlock_tx": "0x55a73bc8facd0951af1e2995cd45c1e532a1e5ccb25ed6217891247748309dcb",
}

argv = sys.argv[1:]
def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default

HUB = opt("--hub", HUB)
USER = opt("--user", USER)
BASE_ARGS = opt("--base", BASE_ARGS)
SKIP_LEAP = "--skip-leap" in argv
DRY = "--dry" in argv
ONLY = opt("--only")
F = opt("--from")

UDT = {"code_hash": XUDT_CODE, "hash_type": "type", "args": BASE_ARGS}

def rpc(url, method, params=None, timeout=180):
    body = json.dumps({"id": 1, "jsonrpc": "2.0", "method": method, "params": params or []})
    out = subprocess.run(["curl", "-s", "-m", str(timeout), "-X", "POST", url,
                          "-H", "Content-Type: application/json", "-d", body],
                         capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except Exception:
        return {"raw": out}

def sh(cmd, timeout=1800, done=None):
    """Run a stage command, streaming output. `done` is a regex for the terminal
    marker; on match the child is terminated (some sidecar scripts keep handles
    open after their work is finished)."""
    print(f"  $ {' '.join(cmd)}", flush=True)
    proc = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)
    lines, hit = [], False
    for line in proc.stdout:
        line = line.rstrip("\n")
        lines.append(line)
        print("   ", line, flush=True)
        if done and re.search(done, line):
            hit = True
            break
    if hit:
        proc.terminate()
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        raise SystemExit(f"stage timed out: {cmd[0]}")
    if not hit and proc.returncode != 0:
        raise SystemExit(f"stage command failed: {cmd[0]} (rc={proc.returncode})")
    return "\n".join(lines)

def _btc_utxos(addr):
    out = subprocess.run(["curl", "-s", "-m", "25",
        f"https://mempool.space/testnet/api/address/{addr}/utxo"],
        capture_output=True, text=True).stdout
    return json.loads(out)

def state_files():
    out = {}
    for tag, pat in (("leap", "localnet/testnet3-leap.done.*.json"),
                     ("issue", "localnet/testnet3-pending.done.*.json")):
        hits = sorted(ROOT.glob(pat))
        if hits:
            out[tag] = hits[-1]
    return out

# ---------------------------------------------------------------- stages
def stage_market():
    print("== market ==", flush=True)
    RATE = 100 * 10**8

    def offers():
        r = rpc(HUB, "list_swap_advertisements",
                [{"base_udt_script": UDT, "quote_udt_script": None}])
        return [o for o in (r.get("result") or {}).get("offers", []) if not o.get("is_expired")]

    live = offers()
    if not live:
        print("  no live ad — publishing one on the hub (base=asset, quote=CKB, rate 100)")
        pub = rpc(HUB, "publish_swap_advertisement", [{
            "base_udt_script": UDT, "quote_udt_script": None,
            "rate": hex(RATE), "fee_rate": "0x0",
            "expiry_delta_millis": hex(24 * 3600 * 1000)}])
        if not pub.get("result"):
            raise SystemExit(f"publish_swap_advertisement failed: {json.dumps(pub)}")
        print(f"  published: {json.dumps(pub['result'])[:150]}")
        time.sleep(3)
        live = offers()
    if not live:
        raise SystemExit("no live advertisement for this pair")
    best = max(live, key=lambda o: int(o["rate"], 16))
    REF["ad_hash"] = best["ad_hash"]
    REF["ad_rate"] = best["rate"]
    print(f"  offers={len(live)} best rate={int(best['rate'],16)/1e8} ad={best['ad_hash']}")
    return best

def stage_leap():
    print("== leap (CKB RGB++ -> BTC_TIME; waits on BTC confirmations) ==")
    if SKIP_LEAP:
        REF.update(RECORDED)
        print(f"  skipped; recorded ckb={RECORDED['leap_ckb_tx']} btc={RECORDED['leap_btc_tx']}")
        return
    uid = REF.get("unique_id") or BASE_ARGS
    fs = REF["issue_btc_tx"]
    out = sh(["node", "leap-sidecar/src/testnet3-leap.js", "all",
              "--uid", uid, "--cell", f"{REF['issue_ckb_tx']}:0",
              "--fat-seal-tx", "0x" + fs.lstrip("0x"),
              "--fat-seal-idx", str(_btc_largest_out(fs))], timeout=14400, done=r"CKB leap tx:")
    mc = re.search(r"CKB leap tx: (0x[0-9a-f]{64})", out)
    mb = re.search(r"BTC leap tx broadcast: ([0-9a-f]{64})", out)
    REF["leap_ckb_tx"] = mc.group(1) if mc else "?"
    REF["leap_btc_tx"] = mb.group(1) if mb else "?"

def stage_unlock():
    print("== unlock (BTC_TIME -> plain xUDT; waits on SPV proof) ==")
    if SKIP_LEAP:
        REF.setdefault("unlock_tx", RECORDED["unlock_tx"])
        print(f"  skipped; asset already plain xUDT (unlock {RECORDED['unlock_tx']})")
        return
    out = sh(["node", "leap-sidecar/src/testnet3-unlock.js",
              "--cell", f"{REF['leap_ckb_tx']}:0"], timeout=14400, done=r"CKB unlock tx:")
    m = re.search(r"CKB unlock tx: (0x[0-9a-f]{64})", out)
    REF["unlock_tx"] = m.group(1) if m else "?"

def stage_fund():
    print("== fund ==")
    r = rpc(USER, "list_channels", [{}])
    live = [c for c in (r.get("result") or {}).get("channels", [])
            if (c.get("funding_udt_type_script") or {}).get("args") == BASE_ARGS
            and c["state"]["state_name"] == "ChannelReady"]
    if live:
        REF["udt_channel"] = live[0]["channel_id"]
        print(f"  reusing {live[0]['channel_id'][:20]} ({int(live[0]['local_balance'],16)} units)")
        return
    print("  no UDT channel for this asset — open one before swapping")
    raise SystemExit("fund the asset channel first (open_channel with funding_udt_type_script)")

def stage_swap():
    print("== swap ==")
    ad = REF.get("ad_hash") or stage_market()["ad_hash"]
    rate = int(REF.get("ad_rate", "0x2540be400"), 16)
    quote = UNITS * rate // 10**8
    inv = rpc(USER, "new_invoice", [{"amount": hex(quote), "description": "l3-orchestrated",
                                     "currency": "Fibt", "hash_algorithm": "sha256"}])
    pay_req = inv["result"]["invoice_address"]
    REF["quote_amount"] = quote
    r = rpc(HUB, "execute_swap", [{"ad_hash": ad, "base_amount": hex(UNITS), "quote_pay_req": pay_req}])
    if "result" not in r:
        raise SystemExit(f"execute_swap failed: {json.dumps(r)}")
    order = r["result"]
    REF["payment_hash"] = order["payment_hash"]
    REF["base_pay_req"] = order["base_pay_req"]
    print(f"  order {order['payment_hash']} Pending (base {UNITS} units -> quote {quote} shannons)")
    paid = rpc(USER, "send_payment", [{"invoice": order["base_pay_req"]}])
    if "result" not in paid:
        raise SystemExit(f"send_payment failed: {json.dumps(paid)}")
    for i in range(30):
        s = (rpc(HUB, "get_swap_order", [{"payment_hash": order["payment_hash"]}]).get("result") or {}).get("status")
        print(f"  [{i*10}s] order={s}")
        if s in ("Success", "Failed"):
            REF["order_status"] = s
            break
        time.sleep(10)
    if REF.get("order_status") != "Success":
        raise SystemExit("order did not reach Success")

def stage_report():
    print("\n== report ==")
    print(f"  asset              : {XUDT_CODE[:12]}/{BASE_ARGS[:14]}")
    for k in ("ad_hash", "ad_rate", "leap_btc_tx", "leap_ckb_tx", "unlock_tx",
              "udt_channel", "payment_hash", "quote_amount", "order_status"):
        if REF.get(k):
            print(f"  {k:19}: {REF[k]}")
    r = rpc(USER, "list_channels", [{}])
    for c in (r.get("result") or {}).get("channels", []):
        u = c.get("funding_udt_type_script")
        tag = ("UDT:" + u["args"][:12]) if u else "CKB"
        print(f"  channel {tag:19} {c['channel_id'][:16]} local={int(c['local_balance'],16)} remote={int(c['remote_balance'],16)}")
    print("\n  references json:", json.dumps(REF))

def _btc_largest_out(txid):
    """Index of the largest non-OP_RETURN output of a BTC tx (the fat seal)."""
    d = json.loads(subprocess.run(["curl", "-s", "-m", "25",
        f"https://mempool.space/testnet/api/tx/{txid}"], capture_output=True, text=True).stdout)
    best = (2, 0)
    for i, o in enumerate(d.get("vout", [])):
        if o.get("value", 0) > best[1] and o.get("scriptpubkey_type") != "op_return":
            best = (i, o["value"])
    return best[0]

def stage_issue():
    print("== issue (fresh RGB++ asset; BTC commit tx then ~1h confirm) ==")
    seal = opt("--seal")
    if not seal:                                  # largest UTXO at the sidecar address
        addr = (ROOT / "BTC-FUNDING-ADDRESS.txt").read_text().strip()
        u = sorted(_btc_utxos(addr), key=lambda x: -x["value"])
        if not u:
            raise SystemExit("no BTC UTXO available for the issuance seal")
        seal = f'{u[0]["txid"]}:{u[0]["vout"]}'
    print(f"  seal: {seal}")
    out = sh(["node", "leap-sidecar/src/testnet3-issue.js", "all", "--seal", seal], timeout=14400, done=r"CKB issuance tx:")
    uids = re.findall(r"unique id[^:]*:\s*(0x[0-9a-f]{64})", out)
    mb = re.search(r"BTC commitment tx broadcast:\s*([0-9a-f]{64})", out)
    mc = re.search(r"CKB issuance tx:\s*(0x[0-9a-f]{64})", out)
    REF["unique_id"] = uids[-1] if uids else "?"
    REF["issue_btc_tx"] = mb.group(1) if mb else "?"
    REF["issue_ckb_tx"] = mc.group(1) if mc else "?"
    global BASE_ARGS, UDT
    BASE_ARGS = REF["unique_id"]
    UDT = {"code_hash": XUDT_CODE, "hash_type": "type", "args": BASE_ARGS}
    print(f"  asset {REF['unique_id']}  btc={REF['issue_btc_tx']}  ckb={REF['issue_ckb_tx']}")

def stage_transfer():
    print("== transfer (sidecar -> node B wallet) ==")
    out = sh(["node", "leap-sidecar/src/transfer-udt.js",
              "--asset", REF["unique_id"], "--to", B_ADDR,
              "--amount", "21000000", "--cap-to", "160"], timeout=1800, done=r"SENT tx:")
    m = re.search(r"SENT tx: (0x[0-9a-f]{64})", out)
    REF["transfer_tx"] = m.group(1) if m else "?"
    print(f"  transfer {REF['transfer_tx']}")

def stage_open():
    print("== open (fund the user's UDT channel) ==", flush=True)
    def channels():
        return (rpc(USER, "list_channels", [{}]).get("result") or {}).get("channels", [])
    def mine():
        return [c for c in channels()
                if (c.get("funding_udt_type_script") or {}).get("args") == REF["unique_id"]]

    cur = mine()
    ready = [c for c in cur if c["state"]["state_name"] == "ChannelReady"]
    if ready:
        REF["udt_channel"] = ready[0]["channel_id"]
        print(f"  reusing {ready[0]['channel_id'][:20]}")
        return
    if cur:
        REF["udt_channel"] = cur[0]["channel_id"]
        print(f"  already opening {cur[0]['channel_id'][:20]} ({cur[0]['state']['state_name']})")
    else:
        total = 21000000 * 10**8
        o = rpc(USER, "open_channel", [{"pubkey": HUB_PUBKEY, "funding_amount": hex(total),
                                        "public": False, "funding_udt_type_script": UDT}])
        if not o.get("result"):
            raise SystemExit(f"open_channel failed: {json.dumps(o)}")
        print(f"  open_channel -> {json.dumps(o['result'])[:160]}")
        if o["result"].get("channel_id"):
            REF["udt_channel"] = o["result"]["channel_id"]

    for i in range(60):
        cur = mine()
        if cur:
            REF["udt_channel"] = cur[0]["channel_id"]
            st = cur[0]["state"]["state_name"]
        else:
            st = "?"
        print(f"  [{i*10}s] {st}", flush=True)
        if st == "ChannelReady":
            return
        if st in ("Closed", "ShuttingDown", "Abandoned"):
            raise SystemExit("channel failed to open")
        time.sleep(10)
    raise SystemExit("channel not ready")


WHITELIST_TPL = """    - name: E2E{tag}
      script:
        code_hash: 0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb
        hash_type: type
        args: {args}
      cell_deps:
        - cell_dep:
            out_point:
              tx_hash: 0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f
              index: 0x0
            dep_type: code
      auto_accept_amount: 1000000000000000
"""

def wait_rpc(timeout=600):
    print("  waiting for node RPC…", flush=True)
    t0 = time.time()
    while time.time() - t0 < timeout:
        ok = True
        for port in (8327, 8328):
            code = subprocess.run(["curl", "-s", "-m", "5", "-o", "/dev/null", "-w", "%{http_code}",
                "-X", "POST", f"http://127.0.0.1:{port}", "-H", "Content-Type: application/json",
                "-d", '{"id":1,"jsonrpc":"2.0","method":"list_peers","params":[{}]}'],
                capture_output=True, text=True).stdout.strip()
            ok = ok and code == "200"
        if ok:
            print(f"  RPC up after {int(time.time() - t0)}s", flush=True)
            return
        time.sleep(10)
    raise SystemExit("nodes did not come up")

def stage_whitelist():
    print("== whitelist (make the fresh asset acceptable to both nodes) ==")
    args = REF["unique_id"]
    changed = False
    for cfg in ("work/fnn-a/config.yml", "work/fnn-b/config.yml"):
        cp = ROOT / cfg
        txt = cp.read_text()
        if args in txt:
            print(f"  {cfg}: already whitelisted")
            continue
        if "\ncch:" not in txt:
            raise SystemExit(f"{cfg}: no 'cch:' anchor for the whitelist insert")
        txt = txt.replace("\ncch:", "\n" + WHITELIST_TPL.format(tag=args[2:8], args=args) + "cch:", 1)
        cp.write_text(txt)
        changed = True
        print(f"  {cfg}: added E2E{args[2:8]}")
    if not changed:
        print("  both nodes already know the asset; no restart needed")
        return
    sh(["bash", "scripts/stop.sh"], timeout=180)
    sh(["bash", "scripts/run.sh"], timeout=180)
    wait_rpc()

STAGES = [("issue", stage_issue), ("leap", stage_leap), ("unlock", stage_unlock),
          ("transfer", stage_transfer), ("whitelist", stage_whitelist),
          ("open", stage_open), ("market", stage_market),
          ("swap", stage_swap), ("report", stage_report)]

if __name__ == "__main__":
    started = F is None
    for name, fn in STAGES:
        if ONLY and name != ONLY:
            continue
        if F and not started:
            started = name == F
            if not started:
                continue
        fn()
        STATE_FILE.write_text(json.dumps(REF, indent=2))
