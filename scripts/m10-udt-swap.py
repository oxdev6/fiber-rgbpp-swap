#!/usr/bin/env python3
"""M10 driver: RGB++-issued testnet xUDT swap over Fiber (A=hub, B=user).

Ad: base = our xUDT (the asset the USER pays), quote = CKB (what the user receives).
rate 100.0 -> 1 UDT unit (1e8 raw) costs 100 CKB (1e10 shannons).
A pays the quote (CKB) from channel 0x464aa80cfc58; B pays the base (xUDT)
over the UDT channel 0x20d97d7e2f06.

Usage: m10-udt-swap.py [publish|invoice|execute AD_HASH PAY_REQ|pay PAY_REQ|order PAYMENT_HASH|all]
"""
import json, subprocess, sys

A = "http://127.0.0.1:8327"  # hub
B = "http://127.0.0.1:8328"  # user
UDT = {
    "code_hash": "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
    "hash_type": "type",
    "args": __import__("os").environ.get(
        "UDT_ARGS",
        "0xa1590e840807299cccbf15ec84dc82c4528f94d99de3380bfb4e05dcee5c59a8",
    ),
}
RATE = "0x2540be400"   # 10_000_000_000 == 100.0
FEE = "0xbb8"
BASE_AMOUNT = "0x5f5e100"          # 1e8 raw = 1 UDT unit
QUOTE_AMOUNT = "0x2540be400"       # 1e10 shannons = 100 CKB


def rpc(url, method, params=None):
    body = json.dumps({"id": 1, "jsonrpc": "2.0", "method": method, "params": params or []})
    out = subprocess.run(
        ["curl", "-s", "-m", "180", "-X", "POST", url,
         "-H", "Content-Type: application/json", "-d", body],
        capture_output=True, text=True, check=True).stdout
    try:
        return json.loads(out)
    except Exception:
        return {"raw": out}


def publish():
    r = rpc(A, "publish_swap_advertisement", [{
        "base_udt_script": UDT, "quote_udt_script": None,
        "rate": RATE, "fee_rate": FEE, "expiry_delta_millis": "0x5265c00"}])
    print("publish:", json.dumps(r))
    if "result" in r:
        print("AD_HASH", r["result"]["ad_hash"])


def invoice():
    r = rpc(B, "new_invoice", [{
        "amount": QUOTE_AMOUNT, "description": "m10-udt-swap",
        "currency": "Fibt", "udt_type_script": None,
        "hash_algorithm": "sha256"}])
    print("invoice:", json.dumps(r))
    if "result" in r:
        print("QUOTE_PAY_REQ", r["result"]["invoice_address"])


def execute(ad_hash, quote_pay_req):
    r = rpc(A, "execute_swap", [{
        "ad_hash": ad_hash, "base_amount": BASE_AMOUNT, "quote_pay_req": quote_pay_req}])
    print("execute:", json.dumps(r, indent=2))
    if "result" in r:
        print("PAYMENT_HASH", r["result"]["payment_hash"])
        print("BASE_PAY_REQ", r["result"]["base_pay_req"])


def pay(pay_req):
    r = rpc(B, "send_payment", [{"invoice": pay_req}])
    print("pay:", json.dumps(r, indent=2))
    if "result" in r:
        print("PAYMENT_HASH", r["result"].get("payment_hash"))


def order(payment_hash):
    r = rpc(A, "get_swap_order", [{"payment_hash": payment_hash}])
    print("order:", json.dumps(r, indent=2))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "publish":
        publish()
    elif cmd == "invoice":
        invoice()
    elif cmd == "execute":
        execute(sys.argv[2], sys.argv[3])
    elif cmd == "pay":
        pay(sys.argv[2])
    elif cmd == "order":
        order(sys.argv[2])
    else:
        print(__doc__)
