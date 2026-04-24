#!/usr/bin/env python3
"""
BLACKSCLUB — Partial Payment + Reserved Balance — Backend validation
See review request for context. Runs against EXPO_PUBLIC_BACKEND_URL.
"""
import os
import sys
import json
import uuid
from typing import Any, Dict, Optional, Tuple, List

import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://member-shop-2.preview.emergentagent.com"
API = BASE.rstrip("/") + "/api"
TIMEOUT = 30

BUYER_EMAIL = "demo@blacksclub.com"
BUYER_PASSWORD = "novasenha123"
ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_PASSWORD = "admin123"

# Mateus: diamond with ~195.85 BLX, used as low-balance buyer
POOR_MEMBER_ID = "mem_4f1c23b894d2"

PASS_COUNT = 0
FAIL_COUNT = 0
FAIL_DETAILS: List[str] = []


def _color(msg: str, code: int) -> str:
    return f"\033[{code}m{msg}\033[0m"


def expect(cond: bool, label: str, extra: Any = None):
    global PASS_COUNT, FAIL_COUNT
    if cond:
        PASS_COUNT += 1
        print(_color(f"  ✓ {label}", 32))
    else:
        FAIL_COUNT += 1
        d = f"{label}" + (f" | {extra}" if extra is not None else "")
        FAIL_DETAILS.append(d)
        print(_color(f"  ✗ {label}", 31) + (f"  [{extra}]" if extra is not None else ""))


def post(path: str, body: Any = None, token: Optional[str] = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", headers=headers, data=json.dumps(body or {}), timeout=TIMEOUT)


def get(path: str, token: Optional[str] = None, **params):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=headers, params=params or None, timeout=TIMEOUT)


def section(title: str):
    print("\n" + _color("=" * 70, 36))
    print(_color(f" {title}", 36))
    print(_color("=" * 70, 36))


def login_admin() -> str:
    r = post("/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def login_member(email: str, password: str) -> Dict[str, Any]:
    r = post("/members/login", {"email": email, "password": password})
    assert r.status_code == 200, f"member login failed: {r.status_code} {r.text}"
    return r.json()


def get_wallet(member_id: str) -> Dict[str, Any]:
    r = get(f"/blx/wallet/{member_id}")
    assert r.status_code == 200, f"wallet {member_id}: {r.status_code} {r.text}"
    return r.json()


def topup(admin_token: str, member_id: str, cents: int):
    r = post("/wallet/topup", {"member_id": member_id, "amount_centavos": int(cents)}, token=admin_token)
    assert r.status_code == 200, f"topup failed: {r.status_code} {r.text}"


_BUYER_ID_FOR_PRODUCTS = "mem_e5bb9b5878dd"  # demo diamond — can list products


def set_product_buyer(mid: str):
    global _BUYER_ID_FOR_PRODUCTS
    _BUYER_ID_FOR_PRODUCTS = mid


def pick_product_with_stock() -> Dict[str, Any]:
    r = get("/products", member_id=_BUYER_ID_FOR_PRODUCTS)
    assert r.status_code == 200, f"/products: {r.status_code} {r.text[:150]}"
    data = r.json() if isinstance(r.json(), list) else (r.json().get("products") or [])
    # Prefer cheap products (<=500 BRL) to avoid insufficient balance in happy-path tests
    cheap = [p for p in data
             if int(p.get("stock") or 0) >= 3
             and 50 <= float(p.get("member_price") or p.get("price") or 0) <= 500]
    if cheap:
        return cheap[0]
    for p in data:
        if int(p.get("stock") or 0) >= 3 and float(p.get("member_price") or p.get("price") or 0) > 0:
            return p
    raise RuntimeError("no product with stock>=3 found")


def pick_ad(exclude_seller: str) -> Dict[str, Any]:
    r = get("/ads")
    data = r.json() if isinstance(r.json(), list) else (r.json().get("ads") or [])
    for a in data:
        if a.get("seller_id") and a["seller_id"] != exclude_seller and float(a.get("price_full") or 0) > 0:
            return a
    raise RuntimeError("no ad with other seller found")


def pick_own_ad(seller_id: str) -> Optional[Dict[str, Any]]:
    r = get("/ads")
    data = r.json() if isinstance(r.json(), list) else (r.json().get("ads") or [])
    for a in data:
        if a.get("seller_id") == seller_id:
            return a
    return None


# ----------------------------------------------------------------
# 1. WALLET
# ----------------------------------------------------------------
def test_wallet_structure(buyer_id: str):
    section("1. GET /api/blx/wallet — structure + reserved_centavos")
    w = get_wallet(buyer_id)
    for k in ["balance_centavos", "balance_blx", "reserved_centavos", "reserved_blx",
              "total_centavos", "total_blx", "wallet_number", "currency"]:
        expect(k in w, f"has field {k}", list(w.keys()))
    expect(isinstance(w.get("balance_centavos"), int), "balance_centavos int")
    expect(isinstance(w.get("reserved_centavos"), int) and w["reserved_centavos"] >= 0,
           "reserved_centavos int>=0", w.get("reserved_centavos"))
    expect(w.get("total_centavos") == int(w["balance_centavos"]) + int(w["reserved_centavos"]),
           "total_centavos == balance + reserved")
    expect(w.get("currency") == "BLX", "currency=BLX")
    expect(isinstance(w.get("wallet_number"), str) and w["wallet_number"].startswith("BLX-"),
           "wallet_number BLX-XXXX", w.get("wallet_number"))

    fake_id = f"mem_test_{uuid.uuid4().hex[:8]}"
    w2 = get_wallet(fake_id)
    expect(w2.get("reserved_centavos") == 0, "lazy wallet reserved=0", w2.get("reserved_centavos"))
    expect(w2.get("balance_centavos") == 0, "lazy wallet balance=0")


# ----------------------------------------------------------------
# 2. PRODUCT BUY-BLX
# ----------------------------------------------------------------
def test_product_buy(buyer_id: str, admin_token: str) -> Dict[str, Any]:
    section("2. POST /api/products/{id}/buy-blx")

    # ensure enough balance (~2000 BLX)
    wb = get_wallet(buyer_id)
    if wb["balance_centavos"] < 200000:
        topup(admin_token, buyer_id, 200000 - wb["balance_centavos"])

    # --- 2a. entry (10%) ---
    print("\n-- 2a. pay_option=entry (10%) --")
    prod = pick_product_with_stock()
    pid = prod["product_id"]
    print(f"   product: {prod.get('name')} pid={pid} member_price={prod.get('member_price')}")

    w0 = get_wallet(buyer_id)
    r = post(f"/products/{pid}/buy-blx", {"member_id": buyer_id, "quantity": 1, "pay_option": "entry"})
    expect(r.status_code == 200, "buy entry → 200", f"{r.status_code} {r.text[:200]}")
    body_a = r.json() if r.status_code == 200 else {}
    order_id_a = body_a.get("order_id")

    total = int(body_a.get("total_cents") or 0)
    entry_c = int(body_a.get("entry_cents") or 0)
    remaining = int(body_a.get("remaining_cents") or 0)
    reserved_on_buyer = int(body_a.get("reserved_on_buyer_cents") or 0)

    expect(entry_c + remaining == total, "entry + remaining == total", f"{entry_c}+{remaining} vs {total}")
    expect(reserved_on_buyer == remaining, "reserved_on_buyer == remaining")
    expect(remaining > 0, "entry leaves remaining>0", remaining)
    expect(abs(entry_c - round(total * 0.10)) <= 1, "entry ≈ 10% of total")
    expect(body_a.get("pay_option") == "entry", "pay_option echoed")
    expect(isinstance(body_a.get("new_balance_centavos"), int), "new_balance_centavos int")

    w1 = get_wallet(buyer_id)
    expect(w1["balance_centavos"] == w0["balance_centavos"] - total,
           "buyer balance -= TOTAL (not just entry)",
           f"delta={w0['balance_centavos']-w1['balance_centavos']} total={total}")
    expect(w1["reserved_centavos"] == w0["reserved_centavos"] + remaining,
           "buyer reserved += remaining",
           f"delta={w1['reserved_centavos']-w0['reserved_centavos']} remaining={remaining}")

    # order present in my-purchases
    r2 = get(f"/orders/my-purchases/{buyer_id}")
    expect(r2.status_code == 200, "my-purchases 200")
    p_list = r2.json().get("orders") or []
    ord_a = next((o for o in p_list if o.get("order_id") == order_id_a), None)
    expect(ord_a is not None, "order_entry in my-purchases")
    if ord_a:
        expect(ord_a.get("status") == "awaiting_delivery_payment",
               "status=awaiting_delivery_payment", ord_a.get("status"))
        expect(int(ord_a.get("entry_cents") or -1) == entry_c, "order.entry_cents matches")
        expect(int(ord_a.get("remaining_cents") or -1) == remaining, "order.remaining_cents matches")
        expect(int(ord_a.get("reserved_on_buyer_cents") or -1) == remaining,
               "order.reserved_on_buyer == remaining")

    # wallet tx: 1 purchase settled amount==entry_cents
    r3 = get(f"/blx/transactions/{buyer_id}", limit=10)
    txs = r3.json() if r3.status_code == 200 and isinstance(r3.json(), list) else []
    tx_p = next((t for t in txs if t.get("product_id") == pid and t.get("type") == "purchase"), None)
    expect(tx_p is not None, "purchase tx exists")
    if tx_p:
        expect(int(tx_p.get("amount_centavos") or -1) == entry_c, "tx.amount_centavos == entry")
        expect(tx_p.get("status") == "settled", "tx status=settled")

    # --- 2b. full (100%) ---
    print("\n-- 2b. pay_option=full (100%) --")
    prod2 = pick_product_with_stock()
    w0b = get_wallet(buyer_id)
    r = post(f"/products/{prod2['product_id']}/buy-blx",
             {"member_id": buyer_id, "quantity": 1, "pay_option": "full"})
    expect(r.status_code == 200, "buy full → 200", f"{r.status_code} {r.text[:200]}")
    body_b = r.json() if r.status_code == 200 else {}
    order_id_b = body_b.get("order_id")
    total_b = int(body_b.get("total_cents") or 0)
    entry_b = int(body_b.get("entry_cents") or 0)
    rem_b = int(body_b.get("remaining_cents") or 0)
    expect(rem_b == 0, "full: remaining=0")
    expect(entry_b == total_b, "full: entry == total")
    w1b = get_wallet(buyer_id)
    expect(w1b["balance_centavos"] == w0b["balance_centavos"] - total_b, "full: balance -= total")
    expect(w1b["reserved_centavos"] == w0b["reserved_centavos"], "full: reserved unchanged")
    r_p = get(f"/orders/my-purchases/{buyer_id}")
    ord_b = next((o for o in (r_p.json().get("orders") or []) if o.get("order_id") == order_id_b), None)
    expect(ord_b is not None and ord_b.get("status") == "settled",
           "order_full status=settled", ord_b.get("status") if ord_b else None)

    # --- 2c. insufficient ---
    print("\n-- 2c. INSUFFICIENT_BLX (poor buyer, expensive product, full) --")
    prods = requests.get(f"{API}/products", params={"member_id": buyer_id}, timeout=TIMEOUT).json()
    if isinstance(prods, dict):
        prods = prods.get("products") or []
    expensive = next((p for p in prods if float(p.get("member_price") or 0) >= 1000
                      and int(p.get("stock") or 0) > 0), None) or pick_product_with_stock()
    r = post(f"/products/{expensive['product_id']}/buy-blx",
             {"member_id": POOR_MEMBER_ID, "quantity": 1, "pay_option": "full"})
    expect(r.status_code == 400, "insufficient → 400", f"{r.status_code} {r.text[:200]}")
    if r.status_code == 400:
        body = r.json()
        det = body.get("detail")
        expect(isinstance(det, dict), "detail is dict (structured)", type(det).__name__)
        if isinstance(det, dict):
            expect(det.get("error_code") == "INSUFFICIENT_BLX", "error_code=INSUFFICIENT_BLX", det.get("error_code"))
            expect(isinstance(det.get("required_centavos"), int) and det["required_centavos"] > 0,
                   "required_centavos int>0", det.get("required_centavos"))
            expect(isinstance(det.get("current_centavos"), int), "current_centavos int")
            expect(isinstance(det.get("missing_centavos"), int) and det["missing_centavos"] > 0,
                   "missing_centavos int>0", det.get("missing_centavos"))
            expect(det.get("support_redirect") is True, "support_redirect=true")
            expect(isinstance(det.get("message"), str) and len(det["message"]) > 5, "message string")

    return {"order_id": order_id_a, "total_cents": total, "entry_cents": entry_c,
            "remaining_cents": remaining, "product_id": pid}


# ----------------------------------------------------------------
# 3. AD BUY-BLX
# ----------------------------------------------------------------
def test_ad_buy(buyer_id: str) -> Dict[str, Any]:
    section("3. POST /api/ads/{id}/buy-blx")

    # --- 3a. half (50%) ---
    print("\n-- 3a. pay_option=half (50%) --")
    ad = pick_ad(exclude_seller=buyer_id)
    ad_id = ad["ad_id"]
    seller_id = ad["seller_id"]
    print(f"   ad: {ad.get('title')} price_full={ad.get('price_full')} seller={seller_id}")

    wb0 = get_wallet(buyer_id)
    ws0 = get_wallet(seller_id)
    r = post(f"/ads/{ad_id}/buy-blx", {"member_id": buyer_id, "pay_option": "half"})
    expect(r.status_code == 200, "ad half → 200", f"{r.status_code} {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    order_id = body.get("order_id")
    total = int(body.get("total_cents") or 0)
    entry = int(body.get("entry_cents") or 0)
    remaining = int(body.get("remaining_cents") or 0)
    reserved_on = int(body.get("reserved_on_buyer_cents") or 0)

    expect(entry + remaining == total, "entry + remaining == total")
    expect(reserved_on == remaining, "reserved_on == remaining")
    expect(abs(entry - round(total * 0.5)) <= 1, "entry ≈ 50% total")

    wb1 = get_wallet(buyer_id)
    ws1 = get_wallet(seller_id)
    expect(wb1["balance_centavos"] == wb0["balance_centavos"] - total, "buyer balance -= total")
    expect(wb1["reserved_centavos"] == wb0["reserved_centavos"] + remaining, "buyer reserved += remaining")
    delta_out = wb1["escrow_out_centavos"] - wb0["escrow_out_centavos"]
    expect(delta_out == entry, "buyer escrow_out += entry", f"delta={delta_out} entry={entry}")
    delta_in = ws1["escrow_in_centavos"] - ws0["escrow_in_centavos"]
    expect(delta_in == entry, "seller escrow_in += entry", f"delta={delta_in} entry={entry}")

    # tx type=escrow pending
    r_t = get(f"/blx/transactions/{buyer_id}", limit=10)
    txs = r_t.json() if r_t.status_code == 200 and isinstance(r_t.json(), list) else []
    tx_e = next((t for t in txs if t.get("ad_id") == ad_id and t.get("type") == "escrow"), None)
    expect(tx_e is not None, "escrow tx created")
    if tx_e:
        expect(tx_e.get("status") == "pending", "escrow tx status=pending")
        expect(int(tx_e.get("amount_centavos") or -1) == entry, "escrow tx amount_centavos==entry")

    # --- 3b. insufficient ---
    print("\n-- 3b. ad insufficient --")
    ad_p = pick_ad(exclude_seller=POOR_MEMBER_ID)
    r = post(f"/ads/{ad_p['ad_id']}/buy-blx", {"member_id": POOR_MEMBER_ID, "pay_option": "full"})
    expect(r.status_code == 400, "ad insufficient → 400", f"{r.status_code} {r.text[:200]}")
    if r.status_code == 400:
        det = r.json().get("detail")
        expect(isinstance(det, dict) and det.get("error_code") == "INSUFFICIENT_BLX",
               "ad insufficient INSUFFICIENT_BLX", det)

    # --- 3c. own ad ---
    print("\n-- 3c. own ad → 400 --")
    own = pick_own_ad(buyer_id)
    if own:
        r = post(f"/ads/{own['ad_id']}/buy-blx", {"member_id": buyer_id, "pay_option": "full"})
        expect(r.status_code == 400, "own ad → 400", f"{r.status_code} {r.text[:200]}")
        if r.status_code == 400:
            det = r.json().get("detail", "")
            expect("próprio" in str(det) or "prprio" in str(det) or "own" in str(det).lower()
                   or "anúncio" in str(det), "message mentions own ad", det)
    else:
        print("   (buyer has no own ad — skipped)")

    return {"order_id": order_id, "total_cents": total, "entry_cents": entry,
            "remaining_cents": remaining, "seller_id": seller_id, "ad_id": ad_id}


# ----------------------------------------------------------------
# 4. CART CHECKOUT
# ----------------------------------------------------------------
def test_cart_checkout(buyer_id: str, admin_token: str) -> Dict[str, Any]:
    section("4. POST /api/cart/checkout-blx")

    wb0 = get_wallet(buyer_id)
    if wb0["balance_centavos"] < 200000:
        topup(admin_token, buyer_id, 200000 - wb0["balance_centavos"])

    requests.delete(f"{API}/cart/{buyer_id}", timeout=TIMEOUT)
    prod = pick_product_with_stock()
    ad = pick_ad(exclude_seller=buyer_id)
    r1 = post("/cart/add", {"member_id": buyer_id, "ad_id": prod["product_id"],
                             "qty": 1, "item_type": "product"})
    expect(r1.status_code == 200, "cart add product", f"{r1.status_code} {r1.text[:150]}")
    r2 = post("/cart/add", {"member_id": buyer_id, "ad_id": ad["ad_id"], "qty": 1, "item_type": "ad"})
    expect(r2.status_code == 200, "cart add ad", f"{r2.status_code} {r2.text[:150]}")

    print("\n-- 4a. checkout half --")
    wb_before = get_wallet(buyer_id)
    r = post("/cart/checkout-blx", {"member_id": buyer_id, "pay_option": "half"})
    expect(r.status_code == 200, "checkout half → 200", f"{r.status_code} {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    total = int(body.get("total_cents") or 0)
    entry = int(body.get("entry_cents") or 0)
    remaining = int(body.get("remaining_cents") or 0)
    reserved_on = int(body.get("reserved_on_buyer_cents") or 0)
    expect(entry + remaining == total, "cart: entry + remaining == total")
    expect(reserved_on == remaining, "cart: reserved_on == remaining")
    expect(len(body.get("orders") or []) >= 2, "≥2 orders created", len(body.get("orders") or []))

    wb_after = get_wallet(buyer_id)
    expect(wb_after["balance_centavos"] == wb_before["balance_centavos"] - total,
           "cart: buyer balance -= total")
    expect(wb_after["reserved_centavos"] == wb_before["reserved_centavos"] + remaining,
           "cart: reserved += total remaining")

    cr = get(f"/cart/{buyer_id}")
    items_after = cr.json().get("items") if cr.status_code == 200 else "err"
    expect(cr.status_code == 200 and items_after == [], "cart emptied", items_after)

    print("\n-- 4b. cart insufficient --")
    ad2 = pick_ad(exclude_seller=POOR_MEMBER_ID)
    requests.delete(f"{API}/cart/{POOR_MEMBER_ID}", timeout=TIMEOUT)
    post("/cart/add", {"member_id": POOR_MEMBER_ID, "ad_id": ad2["ad_id"], "qty": 1, "item_type": "ad"})
    r = post("/cart/checkout-blx", {"member_id": POOR_MEMBER_ID, "pay_option": "full"})
    expect(r.status_code == 400, "cart insufficient → 400", f"{r.status_code} {r.text[:200]}")
    if r.status_code == 400:
        det = r.json().get("detail")
        expect(isinstance(det, dict) and det.get("error_code") == "INSUFFICIENT_BLX",
               "cart insufficient INSUFFICIENT_BLX", det)
    requests.delete(f"{API}/cart/{POOR_MEMBER_ID}", timeout=TIMEOUT)
    return body


# ----------------------------------------------------------------
# 5. DELIVER
# ----------------------------------------------------------------
def test_deliver(order_entry: Dict[str, Any], buyer_id: str):
    section("5. POST /api/orders/{id}/deliver")
    order_id = order_entry["order_id"]
    remaining = int(order_entry["remaining_cents"])

    print("\n-- 5c. RBAC random actor → 403 --")
    rand = f"mem_rand_{uuid.uuid4().hex[:8]}"
    r = post(f"/orders/{order_id}/deliver", {"actor_id": rand})
    expect(r.status_code == 403, "random deliver → 403", f"{r.status_code} {r.text[:200]}")

    print("\n-- 5a. deliver as catalog_admin --")
    wb0 = get_wallet(buyer_id)
    r = post(f"/orders/{order_id}/deliver", {"actor_id": "catalog_admin"})
    expect(r.status_code == 200, "deliver → 200", f"{r.status_code} {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    expect(body.get("status") == "delivered_settled" or body.get("already_settled") is True,
           "delivered_settled", body)

    wb1 = get_wallet(buyer_id)
    expect(wb1["reserved_centavos"] == wb0["reserved_centavos"] - remaining,
           "buyer reserved -= remaining",
           f"{wb0['reserved_centavos']}→{wb1['reserved_centavos']}")

    r_p = get(f"/orders/my-purchases/{buyer_id}")
    ord_x = next((o for o in (r_p.json().get("orders") or []) if o.get("order_id") == order_id), None)
    expect(ord_x is not None and ord_x.get("status") == "delivered_settled",
           "my-purchases status delivered_settled",
           ord_x.get("status") if ord_x else None)
    expect(ord_x is not None and ord_x.get("delivered_at") is not None, "delivered_at present")

    r_t = get(f"/blx/transactions/{buyer_id}", limit=30)
    txs = r_t.json() if r_t.status_code == 200 and isinstance(r_t.json(), list) else []
    tx_ds = next((t for t in txs if t.get("order_id") == order_id and t.get("type") == "delivery_settle"), None)
    expect(tx_ds is not None, "delivery_settle tx created")
    if tx_ds:
        expect(int(tx_ds.get("amount_centavos") or -1) == remaining,
               "delivery_settle amount==remaining")

    print("\n-- 5b. idempotency --")
    r = post(f"/orders/{order_id}/deliver", {"actor_id": "catalog_admin"})
    expect(r.status_code == 200, "re-deliver → 200")
    expect(r.json().get("already_settled") is True, "already_settled=true", r.json())


# ----------------------------------------------------------------
# 6. CANCEL
# ----------------------------------------------------------------
def test_cancel(buyer_id: str):
    section("6. POST /api/orders/{id}/cancel")
    prod = pick_product_with_stock()
    pid = prod["product_id"]
    stock_before = int(prod.get("stock") or 0)
    r = post(f"/products/{pid}/buy-blx",
             {"member_id": buyer_id, "quantity": 1, "pay_option": "entry"})
    assert r.status_code == 200, f"setup cancel failed: {r.status_code} {r.text}"
    bod = r.json()
    order_id = bod["order_id"]
    total = int(bod["total_cents"])
    entry = int(bod["entry_cents"])
    remaining = int(bod["remaining_cents"])

    print("\n-- 6b. RBAC unrelated → 403 --")
    rand = f"mem_rand_{uuid.uuid4().hex[:8]}"
    r = post(f"/orders/{order_id}/cancel", {"actor_id": rand, "reason": "test"})
    expect(r.status_code == 403, "unrelated cancel → 403", f"{r.status_code} {r.text[:200]}")

    print("\n-- 6a. buyer cancels --")
    wb0 = get_wallet(buyer_id)
    r = post(f"/orders/{order_id}/cancel", {"actor_id": buyer_id, "reason": "mudei de ideia"})
    expect(r.status_code == 200, "cancel → 200", f"{r.status_code} {r.text[:200]}")
    wb1 = get_wallet(buyer_id)
    expect(wb1["reserved_centavos"] == wb0["reserved_centavos"] - remaining, "reserved returned")
    expect(wb1["balance_centavos"] == wb0["balance_centavos"] + total,
           "buyer balance += total",
           f"delta={wb1['balance_centavos']-wb0['balance_centavos']} total={total}")

    r_p = get(f"/products/{pid}")
    if r_p.status_code == 200:
        expect(int(r_p.json().get("stock") or 0) == stock_before,
               "stock restored", f"{stock_before} vs {r_p.json().get('stock')}")

    r_o = get(f"/orders/my-purchases/{buyer_id}")
    ord_c = next((o for o in (r_o.json().get("orders") or []) if o.get("order_id") == order_id), None)
    if ord_c:
        expect(ord_c.get("status") == "cancelled", "status=cancelled", ord_c.get("status"))
        expect(ord_c.get("cancelled_at") is not None, "cancelled_at present")
        expect(ord_c.get("cancelled_by") == buyer_id, "cancelled_by matches")
        expect(ord_c.get("cancel_reason") == "mudei de ideia", "cancel_reason saved")

    r_t = get(f"/blx/transactions/{buyer_id}", limit=15)
    txs = r_t.json() if r_t.status_code == 200 and isinstance(r_t.json(), list) else []
    tx_r = next((t for t in txs if t.get("order_id") == order_id and t.get("type") == "refund"), None)
    expect(tx_r is not None, "refund tx created")


# ----------------------------------------------------------------
# 7/8. LISTINGS
# ----------------------------------------------------------------
def test_listings(buyer_id: str, seller_id: str):
    section("7/8. GET /my-purchases + /my-sales")

    r = get(f"/orders/my-purchases/{buyer_id}")
    expect(r.status_code == 200, "my-purchases 200")
    body = r.json()
    for k in ("orders", "count", "total_paid_centavos", "total_reserved_centavos"):
        expect(k in body, f"my-purchases has {k}")
    expect(isinstance(body.get("total_paid_centavos"), int), "total_paid_centavos int")
    expect(isinstance(body.get("total_reserved_centavos"), int), "total_reserved_centavos int")
    orders = body.get("orders") or []
    expect(isinstance(body.get("count"), int) and body["count"] == len(orders),
           "count == orders length")

    expected_paid = sum(int(o.get("entry_cents") or 0) for o in orders
                        if o.get("status") not in ("cancelled", "refunded"))
    expect(body.get("total_paid_centavos") == expected_paid,
           "total_paid_centavos agreed",
           f"api={body.get('total_paid_centavos')} expected={expected_paid}")
    expected_reserved = sum(int(o.get("reserved_on_buyer_cents") or o.get("remaining_cents") or 0)
                            for o in orders if o.get("status") == "awaiting_delivery_payment")
    expect(body.get("total_reserved_centavos") == expected_reserved,
           "total_reserved_centavos agreed",
           f"api={body.get('total_reserved_centavos')} expected={expected_reserved}")

    for o in orders[:3]:
        expect("image" in o, "order has image field (may be null)")
        expect("seller_name" in o, "order has seller_name field")

    r = get(f"/orders/my-sales/{seller_id}")
    expect(r.status_code == 200, "my-sales 200")
    body = r.json()
    for k in ("orders", "count", "total_sold_centavos", "total_received_centavos",
              "total_pending_delivery_centavos", "total_in_escrow_centavos"):
        expect(k in body, f"my-sales has {k}")
        if k != "orders":
            expect(isinstance(body.get(k), int), f"{k} int", type(body.get(k)).__name__)


# ----------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------
def main():
    print(_color(f"\n[BASE URL] {API}\n", 36))

    admin_token = login_admin()
    print(_color(f"admin login OK ({len(admin_token)} chars)", 32))
    buyer = login_member(BUYER_EMAIL, BUYER_PASSWORD)
    buyer_id = buyer["member_id"]
    print(_color(f"buyer login OK: {buyer_id} tier={buyer.get('tier')}", 32))

    try:
        test_wallet_structure(buyer_id)
    except Exception as e:
        FAIL_DETAILS.append(f"wallet structure crashed: {e}")
        print(_color(f"!! wallet structure crashed: {e}", 31))

    order_entry = None
    try:
        order_entry = test_product_buy(buyer_id, admin_token)
    except Exception as e:
        FAIL_DETAILS.append(f"product buy crashed: {e}")
        print(_color(f"!! product buy crashed: {e}", 31))

    ad_ord = None
    try:
        ad_ord = test_ad_buy(buyer_id)
    except Exception as e:
        FAIL_DETAILS.append(f"ad buy crashed: {e}")
        print(_color(f"!! ad buy crashed: {e}", 31))

    try:
        test_cart_checkout(buyer_id, admin_token)
    except Exception as e:
        FAIL_DETAILS.append(f"cart crashed: {e}")
        print(_color(f"!! cart crashed: {e}", 31))

    if order_entry and order_entry.get("order_id"):
        try:
            test_deliver(order_entry, buyer_id)
        except Exception as e:
            FAIL_DETAILS.append(f"deliver crashed: {e}")
            print(_color(f"!! deliver crashed: {e}", 31))

    try:
        test_cancel(buyer_id)
    except Exception as e:
        FAIL_DETAILS.append(f"cancel crashed: {e}")
        print(_color(f"!! cancel crashed: {e}", 31))

    seller_id = (ad_ord or {}).get("seller_id") or "mem_7a9d652945e7"
    try:
        test_listings(buyer_id, seller_id)
    except Exception as e:
        FAIL_DETAILS.append(f"listings crashed: {e}")
        print(_color(f"!! listings crashed: {e}", 31))

    print()
    print(_color("=" * 70, 36))
    total = PASS_COUNT + FAIL_COUNT
    msg = f"RESULT  passed={PASS_COUNT}/{total}  failed={FAIL_COUNT}"
    print(_color(msg, 32 if FAIL_COUNT == 0 else 31))
    if FAIL_DETAILS:
        print(_color("\nFailures:", 31))
        for d in FAIL_DETAILS:
            print(f"  • {d}")
    print(_color("=" * 70, 36))
    sys.exit(0 if FAIL_COUNT == 0 else 1)


if __name__ == "__main__":
    main()
