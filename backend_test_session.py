#!/usr/bin/env python3
"""
Ad-hoc test suite for BLACKSCLUB session changes:
A) Marketplace tier-based access control
B) Wallet topup/withdraw restricted to staff
C) Product creation protected
D) Regression of existing flows
"""
import os
import sys
import requests
import json

BASE_URL = os.environ.get("BASE_URL") or "https://member-shop-2.preview.emergentagent.com/api"
# Fallback to localhost if base URL does not respond
try:
    r = requests.get(f"{BASE_URL}/plans", timeout=5)
    if r.status_code >= 500:
        raise Exception("public url 5xx")
except Exception as e:
    print(f"[WARN] Base URL failed ({e}), falling back to localhost")
    BASE_URL = "http://localhost:8001/api"

print(f"[INFO] Using BASE_URL: {BASE_URL}\n")

DEMO_EMAIL = "demo@blacksclub.com"
DEMO_PASS = "novasenha123"
ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_PASS = "admin123"
SUPPORT_EMAIL = "suporte@blacksclub.com"
SUPPORT_PASS = "suporte123"
FIN_EMAIL = "financeiro@blacksclub.com"
FIN_PASS = "financeiro123"

passes = []
fails = []

def ok(name, details=""):
    passes.append(name)
    print(f"✅ PASS  {name}  {details}")

def fail(name, details=""):
    fails.append((name, details))
    print(f"❌ FAIL  {name}  {details}")


def login_staff(email, password):
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        raise Exception(f"staff login failed {email}: {r.status_code} {r.text}")
    data = r.json()
    return data.get("token") or data.get("access_token")


def login_member(email, password):
    r = requests.post(f"{BASE_URL}/members/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        raise Exception(f"member login failed {email}: {r.status_code} {r.text}")
    return r.json()


# ============ PRELUDE: get tokens + demo member_id ============
print("=" * 70)
print("PRELUDE: staff tokens + demo login")
print("=" * 70)

try:
    admin_token = login_staff(ADMIN_EMAIL, ADMIN_PASS)
    ok("Admin login /auth/login", f"token=***{admin_token[-6:]}")
except Exception as e:
    fail("Admin login", str(e))
    sys.exit(1)

try:
    support_token = login_staff(SUPPORT_EMAIL, SUPPORT_PASS)
    ok("Support login /auth/login")
except Exception as e:
    fail("Support login", str(e))

try:
    fin_token = login_staff(FIN_EMAIL, FIN_PASS)
    ok("Financeiro login /auth/login")
except Exception as e:
    fail("Financeiro login", str(e))

# Test 13: Login demo member
print("\n" + "=" * 70)
print("TEST 13: Login demo member (regressão)")
print("=" * 70)
try:
    demo = login_member(DEMO_EMAIL, DEMO_PASS)
    demo_id = demo.get("member_id")
    demo_tier = demo.get("tier", "unknown")
    ok("13. POST /api/members/login demo", f"member_id={demo_id}, tier={demo_tier}")
except Exception as e:
    fail("13. POST /api/members/login demo", str(e))
    sys.exit(1)

ADMIN_HDR = {"Authorization": f"Bearer {admin_token}"}
SUPPORT_HDR = {"Authorization": f"Bearer {support_token}"}
FIN_HDR = {"Authorization": f"Bearer {fin_token}"}

# Ensure demo is diamond — if not force via admin update plan
if demo_tier != "diamond":
    r = requests.put(f"{BASE_URL}/admin/members/{demo_id}/plan", json={"plan": "diamond"}, headers=ADMIN_HDR, timeout=10)
    if r.status_code != 200:
        fail("ensure demo is diamond", f"{r.status_code} {r.text}")
    else:
        demo_tier = "diamond"

# ============ A) Marketplace tier access ============
print("\n" + "=" * 70)
print("A) Marketplace tier-based access control")
print("=" * 70)

# 1. GET /categories without member_id → 403
r = requests.get(f"{BASE_URL}/categories", timeout=10)
if r.status_code == 403 and ("Marketplace" in r.text or "marketplace" in r.text):
    ok("1. GET /categories sem member_id → 403", f"detail={r.json().get('detail','')[:60]}")
else:
    fail("1. GET /categories sem member_id", f"status={r.status_code} body={r.text[:120]}")

# 2a. GET /categories?member_id=demo (diamond) → 200 com 9 categorias
r = requests.get(f"{BASE_URL}/categories", params={"member_id": demo_id}, timeout=10)
if r.status_code == 200:
    cats = r.json()
    saude = [c for c in cats if c.get("group") == "saude"]
    pub = [c for c in cats if c.get("group") == "public"]
    if len(cats) == 9 and len(saude) == 4 and len(pub) == 5:
        ok("2a. GET /categories?member_id=demo(diamond) → 200", f"total={len(cats)} públicas={len(pub)} saude={len(saude)}")
    else:
        fail("2a. GET /categories diamond count", f"total={len(cats)} públicas={len(pub)} saude={len(saude)} (esperava 9/5/4)")
else:
    fail("2a. GET /categories diamond", f"{r.status_code} {r.text[:120]}")

# 2b. GET /products?category=emagrecedores&member_id=demo
r = requests.get(f"{BASE_URL}/products", params={"category": "emagrecedores", "member_id": demo_id}, timeout=10)
if r.status_code == 200 and isinstance(r.json(), list) and len(r.json()) > 0:
    ok("2b. GET /products?category=emagrecedores demo(diamond) → 200", f"items={len(r.json())}")
else:
    fail("2b. GET /products?category=emagrecedores diamond", f"{r.status_code} {r.text[:120]}")

# 2c. GET /products?category=suplementos&member_id=demo
r = requests.get(f"{BASE_URL}/products", params={"category": "suplementos", "member_id": demo_id}, timeout=10)
if r.status_code == 200:
    ok("2c. GET /products?category=suplementos demo(diamond) → 200", f"items={len(r.json())}")
else:
    fail("2c. GET /products?category=suplementos diamond", f"{r.status_code} {r.text[:120]}")

# 3. Create/pre-authorize a test member and test with tier=black
print("\n-- Setting up test member for tier experiments --")
import uuid as _uuid
import time

test_code = f"QA{_uuid.uuid4().hex[:6].upper()}"
test_name = f"QA Tier Test {int(time.time())}"
test_phone = f"+551199{_uuid.uuid4().int % 10000000:07d}"
test_email = f"qa_tier_{_uuid.uuid4().hex[:8]}@gmail.com"

# Pre-authorize
r = requests.post(f"{BASE_URL}/admin/authorized",
                  json={"name": test_name, "phone": test_phone, "code": test_code, "tier": "black"},
                  headers=ADMIN_HDR, timeout=10)
if r.status_code != 200:
    fail("setup: authorize test member", f"{r.status_code} {r.text}")
    test_member_id = None
else:
    ok("setup: authorize test member", f"code={test_code}")

    # Register member
    reg_body = {
        "code": test_code,
        "name": test_name,
        "phone": test_phone,
        "email": test_email,
        "password": "testpass123",
        "neighborhood": "Centro",
        "city": "São Paulo",
        "state": "SP",
    }
    r = requests.post(f"{BASE_URL}/members/enter", json=reg_body, timeout=15)
    if r.status_code != 200:
        fail("setup: register test member", f"{r.status_code} {r.text[:150]}")
        test_member_id = None
    else:
        test_member_id = r.json().get("member_id")
        current_tier = r.json().get("tier", "?")
        ok("setup: register test member", f"member_id={test_member_id} tier={current_tier}")

if test_member_id:
    # Force tier=black first (new registered is likely black already)
    r = requests.put(f"{BASE_URL}/admin/members/{test_member_id}/plan",
                     json={"plan": "black"}, headers=ADMIN_HDR, timeout=10)
    if r.status_code == 200:
        ok("setup: set tier=black on test member")
    else:
        fail("setup: set tier=black", f"{r.status_code} {r.text[:120]}")

    # 3a. GET /categories with black → 403
    r = requests.get(f"{BASE_URL}/categories", params={"member_id": test_member_id}, timeout=10)
    if r.status_code == 403:
        ok("3a. GET /categories?member_id=black → 403", f"detail={r.json().get('detail','')[:60]}")
    else:
        fail("3a. GET /categories black", f"{r.status_code} {r.text[:120]}")

    # 3b. GET /products?category=emagrecedores with black → 403
    r = requests.get(f"{BASE_URL}/products", params={"category": "emagrecedores", "member_id": test_member_id}, timeout=10)
    if r.status_code == 403:
        ok("3b. GET /products?category=emagrecedores black → 403")
    else:
        fail("3b. GET /products emagrecedores black", f"{r.status_code} {r.text[:120]}")

    # 4. Set tier=silver
    r = requests.put(f"{BASE_URL}/admin/members/{test_member_id}/plan",
                     json={"plan": "silver"}, headers=ADMIN_HDR, timeout=10)
    if r.status_code == 200:
        ok("setup: set tier=silver on test member")

        # 4a. GET /categories silver → 200, só 5 públicas
        r = requests.get(f"{BASE_URL}/categories", params={"member_id": test_member_id}, timeout=10)
        if r.status_code == 200:
            cats = r.json()
            has_saude = any(c.get("group") == "saude" for c in cats)
            if len(cats) == 5 and not has_saude:
                ok("4a. GET /categories silver → 200 (5 públicas, sem saude)", f"total={len(cats)}")
            else:
                fail("4a. GET /categories silver", f"total={len(cats)} has_saude={has_saude}")
        else:
            fail("4a. GET /categories silver", f"{r.status_code} {r.text[:120]}")

        # 4b. GET /products?category=peptideos silver → 403
        r = requests.get(f"{BASE_URL}/products", params={"category": "peptideos", "member_id": test_member_id}, timeout=10)
        if r.status_code == 403:
            ok("4b. GET /products?category=peptideos silver → 403")
        else:
            fail("4b. GET /products peptideos silver", f"{r.status_code} {r.text[:120]}")

        # 4c. GET /products?category=suplementos silver → 200
        r = requests.get(f"{BASE_URL}/products", params={"category": "suplementos", "member_id": test_member_id}, timeout=10)
        if r.status_code == 200:
            ok("4c. GET /products?category=suplementos silver → 200", f"items={len(r.json())}")
        else:
            fail("4c. GET /products suplementos silver", f"{r.status_code} {r.text[:120]}")
    else:
        fail("setup: set tier=silver", f"{r.status_code} {r.text[:120]}")

# ============ B) Wallet protected ============
print("\n" + "=" * 70)
print("B) Wallet: topup/withdraw restricted to staff")
print("=" * 70)

# Baseline balance
def get_balance(mid):
    r = requests.get(f"{BASE_URL}/wallet/{mid}", timeout=10)
    if r.status_code == 200:
        return r.json().get("balance", 0)
    return None

baseline = get_balance(demo_id)
print(f"[info] demo baseline balance = {baseline}")

# 5. POST /wallet/topup without auth → 401/403
r = requests.post(f"{BASE_URL}/wallet/topup", json={"member_id": demo_id, "amount": 50}, timeout=10)
if r.status_code in (401, 403):
    ok("5. POST /wallet/topup sem token → 401/403", f"status={r.status_code}")
else:
    fail("5. POST /wallet/topup sem token", f"status={r.status_code} body={r.text[:120]}")

# 6. POST /wallet/topup admin → 200 and +50
r = requests.post(f"{BASE_URL}/wallet/topup", json={"member_id": demo_id, "amount": 50}, headers=ADMIN_HDR, timeout=10)
if r.status_code == 200:
    new_bal = get_balance(demo_id)
    if new_bal is not None and abs(new_bal - (baseline + 50)) < 0.01:
        ok("6. POST /wallet/topup admin (+50) → 200", f"balance {baseline} → {new_bal}")
        baseline = new_bal
    else:
        fail("6. POST /wallet/topup admin balance mismatch", f"baseline={baseline} new={new_bal}")
else:
    fail("6. POST /wallet/topup admin", f"{r.status_code} {r.text[:150]}")

# 7. Support topup
r = requests.post(f"{BASE_URL}/wallet/topup", json={"member_id": demo_id, "amount": 25}, headers=SUPPORT_HDR, timeout=10)
if r.status_code == 200:
    new_bal = get_balance(demo_id)
    if new_bal is not None and abs(new_bal - (baseline + 25)) < 0.01:
        ok("7. POST /wallet/topup support (+25) → 200", f"balance={new_bal}")
        baseline = new_bal
    else:
        fail("7. POST /wallet/topup support balance mismatch", f"exp={baseline+25} got={new_bal}")
else:
    fail("7. POST /wallet/topup support", f"{r.status_code} {r.text[:150]}")

# 8. Financeiro topup
r = requests.post(f"{BASE_URL}/wallet/topup", json={"member_id": demo_id, "amount": 25}, headers=FIN_HDR, timeout=10)
if r.status_code == 200:
    new_bal = get_balance(demo_id)
    if new_bal is not None and abs(new_bal - (baseline + 25)) < 0.01:
        ok("8. POST /wallet/topup financeiro (+25) → 200", f"balance={new_bal}")
        baseline = new_bal
    else:
        fail("8. POST /wallet/topup financeiro balance mismatch", f"exp={baseline+25} got={new_bal}")
else:
    fail("8. POST /wallet/topup financeiro", f"{r.status_code} {r.text[:150]}")

# 9. Withdraw admin -10
r = requests.post(f"{BASE_URL}/wallet/withdraw", json={"member_id": demo_id, "amount": 10}, headers=ADMIN_HDR, timeout=10)
if r.status_code == 200:
    new_bal = get_balance(demo_id)
    if new_bal is not None and abs(new_bal - (baseline - 10)) < 0.01:
        ok("9. POST /wallet/withdraw admin (-10) → 200", f"balance={new_bal}")
        baseline = new_bal
    else:
        fail("9. POST /wallet/withdraw admin balance mismatch", f"exp={baseline-10} got={new_bal}")
else:
    fail("9. POST /wallet/withdraw admin", f"{r.status_code} {r.text[:150]}")

# 10. GET /wallet/{demo_id} without auth → 200
r = requests.get(f"{BASE_URL}/wallet/{demo_id}", timeout=10)
if r.status_code == 200 and "balance" in r.json():
    ok("10. GET /wallet/{demo_id} sem auth → 200", f"balance={r.json().get('balance')}")
else:
    fail("10. GET /wallet/{demo_id}", f"{r.status_code} {r.text[:120]}")

# ============ C) Products protected ============
print("\n" + "=" * 70)
print("C) Products create protected")
print("=" * 70)

product_body = {
    "name": "QA Test Whey 900g",
    "category": "suplementos",
    "subcategory": "Proteínas",
    "description": "Produto QA",
    "price": 100.0,
    "member_price": 80.0,
    "image_url": "https://example.com/img.jpg",
    "stock": 5,
    "featured": False,
}

# 11. POST /products without token → 401/403
r = requests.post(f"{BASE_URL}/products", json=product_body, timeout=10)
if r.status_code in (401, 403):
    ok("11. POST /products sem token → 401/403", f"status={r.status_code}")
else:
    fail("11. POST /products sem token", f"{r.status_code} {r.text[:150]}")

# 12. POST /products with support token → 200
r = requests.post(f"{BASE_URL}/products", json=product_body, headers=SUPPORT_HDR, timeout=10)
if r.status_code == 200:
    created_pid = r.json().get("product_id")
    ok("12. POST /products com support → 200", f"product_id={created_pid}")
    # cleanup
    if created_pid:
        requests.delete(f"{BASE_URL}/products/{created_pid}", headers=ADMIN_HDR, timeout=10)
else:
    fail("12. POST /products support", f"{r.status_code} {r.text[:200]}")

# ============ D) Regressão ============
print("\n" + "=" * 70)
print("D) Regressão dos fluxos existentes")
print("=" * 70)

# 14. GET /goals/dashboard/{demo_id}
r = requests.get(f"{BASE_URL}/goals/dashboard/{demo_id}", timeout=10)
if r.status_code == 200:
    ok("14. GET /goals/dashboard/{demo_id} → 200", f"keys={list(r.json().keys())[:6]}")
else:
    fail("14. GET /goals/dashboard/{demo_id}", f"{r.status_code} {r.text[:150]}")

# 15. GET /subcategories/suplementos?member_id=demo
r = requests.get(f"{BASE_URL}/subcategories/suplementos", params={"member_id": demo_id}, timeout=10)
if r.status_code == 200:
    ok("15. GET /subcategories/suplementos diamond → 200", f"items={len(r.json())}")
else:
    fail("15. GET /subcategories/suplementos diamond", f"{r.status_code} {r.text[:150]}")

# 16. GET /subcategories/landerlan?member_id=silver → 403
if test_member_id:
    # Ensure silver for this test
    r = requests.put(f"{BASE_URL}/admin/members/{test_member_id}/plan",
                     json={"plan": "silver"}, headers=ADMIN_HDR, timeout=10)
    r = requests.get(f"{BASE_URL}/subcategories/landerlan", params={"member_id": test_member_id}, timeout=10)
    if r.status_code == 403:
        ok("16. GET /subcategories/landerlan silver → 403")
    else:
        fail("16. GET /subcategories/landerlan silver", f"{r.status_code} {r.text[:150]}")
else:
    fail("16. GET /subcategories/landerlan silver", "no test member created")

# Cleanup: remove test member
if test_member_id:
    r = requests.delete(f"{BASE_URL}/admin/members/{test_member_id}", headers=ADMIN_HDR, timeout=10)
    print(f"[cleanup] delete test member: {r.status_code}")

# ============ SUMMARY ============
print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
print(f"PASS: {len(passes)}")
print(f"FAIL: {len(fails)}")
if fails:
    print("\n--- FAILED TESTS ---")
    for n, d in fails:
        print(f"  ❌ {n}  |  {d}")

sys.exit(0 if not fails else 1)
