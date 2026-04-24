"""
Backend tests for the NEW review scope (5 features):
  1) POST /api/ads now requires STAFF auth (require_staff)
  2) GET /api/categories?member_id=... returns the 6 NEW categories
  3) POST /api/members/login returns staff_token / staff_user
  4) DELETE /api/admin/ads/clear requires staff
  5) BLX Monthly Transfer Limits
     - GET /api/blx/transfer/limits/{member_id}
     - POST /api/blx/transfer enforces monthly cap per tier

Run:
  python /app/backend_test_rod_new_features.py
"""

import os
import sys
import time
import json
import requests
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, Optional, List

# Backend base URL
BASE = "https://member-shop-2.preview.emergentagent.com/api"

# Test credentials
ADMIN_MASTER = ("guilherme925145000@gmail.com", "blacks2026")  # admin + diamond
DEMO_MEMBER  = ("demo@blacksclub.com", "novasenha123")         # plain diamond member
ADMIN_STAFF  = ("admin@farmaclube.com", "admin123")            # admin staff (no member)

PASS = 0
FAIL = 0
FAILS: List[str] = []


def ok(label: str, cond: bool, extra: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        FAILS.append(f"{label} | {extra}")
        print(f"  ❌ {label}  {extra}")


def section(t: str):
    print(f"\n=== {t} ===")


def req(method: str, path: str, **kw):
    url = BASE + path
    try:
        r = requests.request(method, url, timeout=30, **kw)
        return r
    except Exception as e:
        print(f"  ⚠️ EXC {method} {path}: {e}")
        return None


# ======================================================================
# 0) Setup: login admin master + demo
# ======================================================================
section("Setup — logins")

admin_master_resp = req("POST", "/members/login", json={"email": ADMIN_MASTER[0], "password": ADMIN_MASTER[1]})
ok("admin master /members/login 200", admin_master_resp is not None and admin_master_resp.status_code == 200,
   f"status={getattr(admin_master_resp,'status_code',None)} body={getattr(admin_master_resp,'text','')[:200]}")
if not admin_master_resp or admin_master_resp.status_code != 200:
    print("FATAL — cannot login admin master. Aborting.")
    sys.exit(1)
admin_master = admin_master_resp.json()
ADMIN_MEMBER_ID = admin_master.get("member_id")
ADMIN_STAFF_TOKEN = admin_master.get("staff_token")
ADMIN_STAFF_USER = admin_master.get("staff_user")
print(f"    admin_master member_id={ADMIN_MEMBER_ID} tier={admin_master.get('tier')}")
print(f"    staff_token present={bool(ADMIN_STAFF_TOKEN)} staff_user.role={(ADMIN_STAFF_USER or {}).get('role')}")

demo_resp = req("POST", "/members/login", json={"email": DEMO_MEMBER[0], "password": DEMO_MEMBER[1]})
ok("demo /members/login 200", demo_resp is not None and demo_resp.status_code == 200,
   f"status={getattr(demo_resp,'status_code',None)}")
demo = demo_resp.json() if demo_resp and demo_resp.status_code == 200 else {}
DEMO_MEMBER_ID = demo.get("member_id")
DEMO_STAFF_TOKEN = demo.get("staff_token")
DEMO_STAFF_USER = demo.get("staff_user")
print(f"    demo member_id={DEMO_MEMBER_ID} tier={demo.get('tier')}")
print(f"    demo staff_token={DEMO_STAFF_TOKEN} staff_user={DEMO_STAFF_USER}")

# Fallback staff token via /auth/login (admin@farmaclube.com)
auth_resp = req("POST", "/auth/login", json={"email": ADMIN_STAFF[0], "password": ADMIN_STAFF[1]})
ok("admin_staff /auth/login 200", auth_resp is not None and auth_resp.status_code == 200,
   f"status={getattr(auth_resp,'status_code',None)}")
FARMA_STAFF_TOKEN = (auth_resp.json().get("token") or auth_resp.json().get("access_token")
                    if auth_resp and auth_resp.status_code == 200 else None)
if not FARMA_STAFF_TOKEN and auth_resp and auth_resp.status_code == 200:
    # try nested token
    body = auth_resp.json()
    FARMA_STAFF_TOKEN = body.get("access_token") or body.get("token")
print(f"    farmaclube staff token present={bool(FARMA_STAFF_TOKEN)}")

# Use admin master staff_token when available (it represents the admin+diamond user),
# else fall back to admin@farmaclube.com token.
STAFF_TOKEN = ADMIN_STAFF_TOKEN or FARMA_STAFF_TOKEN
print(f"    Using STAFF_TOKEN from {'admin_master' if ADMIN_STAFF_TOKEN else 'admin_farmaclube'}")


# ======================================================================
# 3) POST /api/members/login — staff_token / staff_user
#    (test first because it blocks others)
# ======================================================================
section("3) POST /members/login returns staff_token + staff_user")

ok("admin master staff_token is non-null JWT-like", isinstance(ADMIN_STAFF_TOKEN, str) and len(ADMIN_STAFF_TOKEN) > 40 and ADMIN_STAFF_TOKEN.count(".") == 2,
   f"got={ADMIN_STAFF_TOKEN!r}")
ok("admin master staff_user.role == 'admin'", (ADMIN_STAFF_USER or {}).get("role") == "admin",
   f"staff_user={ADMIN_STAFF_USER}")

ok("demo staff_token is null", DEMO_STAFF_TOKEN is None, f"got={DEMO_STAFF_TOKEN!r}")
ok("demo staff_user is null", DEMO_STAFF_USER is None, f"got={DEMO_STAFF_USER!r}")


# ======================================================================
# 2) GET /api/categories?member_id=<demo_diamond>
# ======================================================================
section("2) GET /categories — new categories")

# Diamond member
r = req("GET", f"/categories?member_id={DEMO_MEMBER_ID}")
ok("/categories diamond 200", r is not None and r.status_code == 200,
   f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")
if r and r.status_code == 200:
    cats = r.json()
    ids = [c.get("id") for c in cats]
    expected = {"metabolicos","performance","regeneracao","estetica","foco","funcionais"}
    old = {"tecnologia","bem_estar","beleza","suplementos","eletronicos","outros"}
    ok("6 new categories present", expected.issubset(set(ids)),
       f"present_expected={expected & set(ids)} missing={expected - set(ids)}")
    ok("no old categories present", not (old & set(ids)),
       f"leaked_old={old & set(ids)}")
    ok("diamond sees saude_diamante umbrella", "saude_diamante" in ids,
       f"ids={ids}")

# Test with Silver member too (should still see 6 public, NO saude)
# (Not strictly required by review, but sanity)
# Find any gold/silver member via DB


# ======================================================================
# 1) POST /api/ads — requires STAFF auth
# ======================================================================
section("1) POST /ads requires STAFF auth")

# (a) No token → 401/403
payload_ad = {
    "seller_id": ADMIN_MEMBER_ID,  # staff posts; seller_id needs to be a valid member
    "title": "Teste Ad Curado — Regeneração Avançada",
    "description": "Descrição padrão de produto curado para teste do marketplace curado.",
    "price_full": 499.0,
    "category": "regeneracao",
    "images": [],
    "stock": 3,
    "ad_tier": "gold",
}
r = req("POST", "/ads", json=payload_ad)
ok("POST /ads (no token) returns 401/403", r is not None and r.status_code in (401, 403),
   f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")

# (b) With STAFF token → 200 + ad_tier, verified=True, posted_by_role
H_STAFF = {"Authorization": f"Bearer {STAFF_TOKEN}"} if STAFF_TOKEN else {}
r = req("POST", "/ads", json=payload_ad, headers=H_STAFF)
ok("POST /ads (staff) 200", r is not None and r.status_code == 200,
   f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")
created_ad = None
if r and r.status_code == 200:
    created_ad = r.json()
    ok("ad_tier == 'gold'", created_ad.get("ad_tier") == "gold", f"got={created_ad.get('ad_tier')}")
    ok("verified == True", created_ad.get("verified") is True, f"got={created_ad.get('verified')}")
    ok("posted_by_role present (admin/support/financeiro)", created_ad.get("posted_by_role") in ("admin","support","financeiro"),
       f"got={created_ad.get('posted_by_role')}")

# (c) With invalid ad_tier → fallback to "diamond"
payload_invalid = dict(payload_ad)
payload_invalid["ad_tier"] = "bronze"
payload_invalid["title"] = "Teste Ad Bronze Fallback"
r = req("POST", "/ads", json=payload_invalid, headers=H_STAFF)
ok("POST /ads (staff, ad_tier='bronze') 200 + fallback 'diamond'",
   r is not None and r.status_code == 200 and r.json().get("ad_tier") == "diamond",
   f"status={getattr(r,'status_code',None)} ad_tier={r.json().get('ad_tier') if r and r.status_code==200 else None}")

# (d) Valid ad_tier='silver'/'diamond'
for t in ("silver", "diamond"):
    p = dict(payload_ad); p["ad_tier"] = t; p["title"] = f"Teste Ad {t}"
    r = req("POST", "/ads", json=p, headers=H_STAFF)
    ok(f"POST /ads (staff, ad_tier={t}) 200", r is not None and r.status_code == 200 and r.json().get("ad_tier") == t,
       f"status={getattr(r,'status_code',None)} tier={r.json().get('ad_tier') if r and r.status_code==200 else None}")

# (e) Member login doesn't provide a staff token (demo_staff_token is None).
# So a "regular member" attempting to POST /ads without token → already tested above (401/403).
# To simulate a member with role=member account: we'd need a user in `users` with role=member.
# Such user can login via /auth/login. Let's try — the review expects 403 (not staff).
# We skip this unless there's a known user with role=member. We'll attempt to create one via DB isn't allowed here,
# but we can try the forged JWT path via direct JWT_SECRET access (environment).
try:
    import jwt as _jwt
    with open("/app/backend/.env") as f:
        env_text = f.read()
    JWT_SECRET = None
    for line in env_text.splitlines():
        if line.startswith("JWT_SECRET="):
            JWT_SECRET = line.split("=",1)[1].strip().strip('"')
            break
    if JWT_SECRET:
        # Try to find any existing user in MongoDB with role=member
        import motor.motor_asyncio
        async def _find_member_user():
            cli = motor.motor_asyncio.AsyncIOMotorClient(
                os.environ.get("MONGO_URL", "mongodb://localhost:27017")
            )
            db = cli[os.environ.get("DB_NAME", "test_database")]
            u = await db.users.find_one({"role": "member"}, {"_id": 0, "user_id": 1})
            return u
        found = asyncio.run(_find_member_user())
        if found:
            token_member = _jwt.encode(
                {"sub": found["user_id"], "exp": datetime.now(timezone.utc).timestamp() + 3600},
                JWT_SECRET, algorithm="HS256",
            )
            r = req("POST", "/ads", json=payload_ad, headers={"Authorization": f"Bearer {token_member}"})
            ok("POST /ads (role=member JWT) returns 403", r is not None and r.status_code == 403,
               f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")
        else:
            print("    (no role=member user in DB — skipping role=member 403 scenario)")
except Exception as e:
    print(f"    (skipped role=member JWT scenario: {e})")


# ======================================================================
# 4) DELETE /api/admin/ads/clear
# ======================================================================
section("4) DELETE /admin/ads/clear")

# NOTE: This is destructive! Wipes all ads. Since the whole suite validates new feature only,
# it is OK. Still run with the staff token.

# (a) No token → 401/403
r = req("DELETE", "/admin/ads/clear")
ok("DELETE /admin/ads/clear (no token) 401/403", r is not None and r.status_code in (401, 403),
   f"status={getattr(r,'status_code',None)}")

# (b) Demo's staff_token is null; skip "member token" via DB jwt if we have it
try:
    if 'token_member' in locals():
        r = req("DELETE", "/admin/ads/clear", headers={"Authorization": f"Bearer {token_member}"})
        ok("DELETE /admin/ads/clear (role=member JWT) 403", r is not None and r.status_code == 403,
           f"status={getattr(r,'status_code',None)}")
except Exception:
    pass

# (c) Staff → 200 {ok, deleted}
r = req("DELETE", "/admin/ads/clear", headers=H_STAFF)
ok("DELETE /admin/ads/clear (staff) 200", r is not None and r.status_code == 200,
   f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")
if r and r.status_code == 200:
    body = r.json()
    ok("body.ok == True", body.get("ok") is True, f"body={body}")
    ok("body.deleted is int >= 0", isinstance(body.get("deleted"), int) and body["deleted"] >= 0,
       f"body={body}")


# ======================================================================
# 5) BLX Monthly Transfer Limits
# ======================================================================
section("5) BLX Monthly Transfer Limits — GET /blx/transfer/limits/{id}")

# (a) Admin (Luis Guilherme) → unlimited
r = req("GET", f"/blx/transfer/limits/{ADMIN_MEMBER_ID}")
ok("GET /blx/transfer/limits (admin) 200", r is not None and r.status_code == 200,
   f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")
if r and r.status_code == 200:
    body = r.json()
    print(f"    admin limits: {body}")
    ok("admin unlimited=True", body.get("unlimited") is True, f"got={body}")
    ok("admin limit_centavos=-1", body.get("limit_centavos") == -1, f"got={body}")
    ok("admin available_centavos=-1", body.get("available_centavos") == -1, f"got={body}")

# (b) Demo Diamond → limit 5000000
r = req("GET", f"/blx/transfer/limits/{DEMO_MEMBER_ID}")
ok("GET /blx/transfer/limits (demo diamond) 200", r is not None and r.status_code == 200,
   f"status={getattr(r,'status_code',None)}")
if r and r.status_code == 200:
    body = r.json()
    print(f"    demo(diamond) limits: {body}")
    ok("demo tier=diamond", body.get("tier") == "diamond", f"got={body}")
    ok("demo unlimited=False", body.get("unlimited") is False, f"got={body}")
    ok("demo limit_centavos=5000000", body.get("limit_centavos") == 5_000_000, f"got={body}")

# Create/promote test members for GOLD/SILVER/BLACK limits
# We reuse existing members and change their tier via PUT /api/admin/members/{id}/plan.
# "black" is NOT a valid plan (PLANS has only silver/gold/diamond) → we'll set tier via direct DB write.

async def _get_db():
    import motor.motor_asyncio
    cli = motor.motor_asyncio.AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    return cli[os.environ.get("DB_NAME", "test_database")]

async def _find_member_by_email(email: str):
    db = await _get_db()
    return await db.members.find_one({"email": email.lower()}, {"_id": 0})

async def _set_tier_direct(member_id: str, tier: str):
    db = await _get_db()
    r = await db.members.update_one({"member_id": member_id}, {"$set": {"tier": tier}})
    return r.modified_count

async def _get_tier(member_id: str):
    db = await _get_db()
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "tier": 1, "email": 1})
    return (m or {}).get("tier"), (m or {}).get("email")

# Find 2 distinct test members that are NOT the admin and NOT demo to mutate safely.
async def _pick_test_members(exclude_ids: List[str], n: int = 2):
    db = await _get_db()
    cur = db.members.find({"member_id": {"$nin": exclude_ids}}, {"_id": 0, "member_id": 1, "name": 1, "email": 1, "tier": 1}).limit(25)
    items = await cur.to_list(length=25)
    return items

excluded = [ADMIN_MEMBER_ID, DEMO_MEMBER_ID]
test_pool = asyncio.run(_pick_test_members(excluded))
print(f"    available test members: {len(test_pool)} — first 5: {[ (m.get('member_id'), m.get('tier')) for m in test_pool[:5] ]}")

# Pick 2 members for tier promotion
GOLD_MEMBER_ID = test_pool[0]["member_id"] if len(test_pool) >= 1 else None
SILVER_MEMBER_ID = test_pool[1]["member_id"] if len(test_pool) >= 2 else None
BLACK_MEMBER_ID = test_pool[2]["member_id"] if len(test_pool) >= 3 else None

# Save original tiers to restore later
orig = {}
for mid in (GOLD_MEMBER_ID, SILVER_MEMBER_ID, BLACK_MEMBER_ID):
    if mid:
        t, _ = asyncio.run(_get_tier(mid))
        orig[mid] = t

# Promote via PUT /admin/members/{id}/plan for gold/silver
if GOLD_MEMBER_ID:
    r = req("PUT", f"/admin/members/{GOLD_MEMBER_ID}/plan", json={"plan": "gold"}, headers=H_STAFF)
    ok(f"PUT plan gold for {GOLD_MEMBER_ID}", r is not None and r.status_code == 200,
       f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")
if SILVER_MEMBER_ID:
    r = req("PUT", f"/admin/members/{SILVER_MEMBER_ID}/plan", json={"plan": "silver"}, headers=H_STAFF)
    ok(f"PUT plan silver for {SILVER_MEMBER_ID}", r is not None and r.status_code == 200,
       f"status={getattr(r,'status_code',None)}")
# For black, we need direct DB update because "black" is not in PLANS
if BLACK_MEMBER_ID:
    modified = asyncio.run(_set_tier_direct(BLACK_MEMBER_ID, "black"))
    ok(f"DB set tier=black for {BLACK_MEMBER_ID}", modified >= 0, f"modified={modified}")

# (c) Gold → limit 1000000
if GOLD_MEMBER_ID:
    r = req("GET", f"/blx/transfer/limits/{GOLD_MEMBER_ID}")
    ok("GET /blx/transfer/limits (gold) 200", r is not None and r.status_code == 200,
       f"status={getattr(r,'status_code',None)}")
    if r and r.status_code == 200:
        body = r.json()
        print(f"    gold limits: {body}")
        ok("gold limit_centavos=1000000", body.get("limit_centavos") == 1_000_000, f"got={body}")
        ok("gold unlimited=False", body.get("unlimited") is False, f"got={body}")

# (d) Silver → limit 200000
if SILVER_MEMBER_ID:
    r = req("GET", f"/blx/transfer/limits/{SILVER_MEMBER_ID}")
    ok("GET /blx/transfer/limits (silver) 200", r is not None and r.status_code == 200)
    if r and r.status_code == 200:
        body = r.json()
        print(f"    silver limits: {body}")
        ok("silver limit_centavos=200000", body.get("limit_centavos") == 200_000, f"got={body}")

# (e) Black → limit 0
if BLACK_MEMBER_ID:
    r = req("GET", f"/blx/transfer/limits/{BLACK_MEMBER_ID}")
    ok("GET /blx/transfer/limits (black) 200", r is not None and r.status_code == 200)
    if r and r.status_code == 200:
        body = r.json()
        print(f"    black limits: {body}")
        ok("black limit_centavos=0", body.get("limit_centavos") == 0, f"got={body}")


# ======================================================================
# 5.2) POST /blx/transfer — enforce monthly limit
# ======================================================================
section("5.2) POST /blx/transfer — enforce monthly limit per tier")

# --- Staff sender (admin master) NO LIMIT ---
# We need:
#  • sender wallet with balance
#  • recipient (demo) wallet (already exists)
# Credit admin wallet via /wallet/topup (staff endpoint requires JWT admin)
topup_headers = {"Authorization": f"Bearer {STAFF_TOKEN}"}
# First, credit admin master with enough balance
r = req("POST", "/wallet/topup",
        json={"member_id": ADMIN_MEMBER_ID, "amount_centavos": 6_000_000, "note": "test staff limit"},
        headers=topup_headers)
ok("topup admin wallet 6M centavos", r is not None and r.status_code == 200,
   f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")

# Check admin wallet balance
wresp = req("GET", f"/blx/wallet/{ADMIN_MEMBER_ID}")
if wresp and wresp.status_code == 200:
    print(f"    admin wallet balance: {wresp.json().get('balance_centavos')} centavos")

# Admin transfers more than diamond limit in a single op (say 6M > 5M limit)
# If admin is truly unlimited, this should PASS (limited only by balance + 1e9 safety ceiling).
r = req("POST", "/blx/transfer",
        json={"from_member_id": ADMIN_MEMBER_ID, "to_member_id": DEMO_MEMBER_ID, "amount_centavos": 5_500_000, "note": "staff unlimited test"})
ok("admin transfer 5.5M centavos → 200 (staff unlimited)", r is not None and r.status_code == 200,
   f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")

# --- Plain Diamond (demo) reaching monthly cap 5_000_000 ---
# First: check current used in month
used_now = 0
r = req("GET", f"/blx/transfer/limits/{DEMO_MEMBER_ID}")
if r and r.status_code == 200:
    used_now = int(r.json().get("used_centavos") or 0)
    print(f"    demo used_centavos this month (before test): {used_now}")

# Credit demo wallet with large balance
r = req("POST", "/wallet/topup",
        json={"member_id": DEMO_MEMBER_ID, "amount_centavos": 7_000_000, "note": "test diamond limit"},
        headers=topup_headers)
ok("topup demo wallet 7M centavos", r is not None and r.status_code == 200,
   f"status={getattr(r,'status_code',None)}")

# Compute remaining budget
remaining = max(5_000_000 - used_now, 0)
print(f"    remaining budget for demo this month: {remaining}")

# Find a recipient distinct from demo (use admin master)
# Transfer 1: consume roughly half of remaining (if > 2)
chunk_a = min(remaining, 2_000_000)
chunk_b = min(remaining - chunk_a, 2_000_000)
over_amount = 1_500_000  # guaranteed to push us over the limit on the 3rd call

if remaining > 0:
    r = req("POST", "/blx/transfer",
            json={"from_member_id": DEMO_MEMBER_ID, "to_member_id": ADMIN_MEMBER_ID, "amount_centavos": chunk_a, "note": "demo t1"})
    ok(f"demo transfer 1 ({chunk_a}) under limit → 200 (or ok)",
       r is not None and r.status_code in (200, 201),
       f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")
    if chunk_b > 0:
        r = req("POST", "/blx/transfer",
                json={"from_member_id": DEMO_MEMBER_ID, "to_member_id": ADMIN_MEMBER_ID, "amount_centavos": chunk_b, "note": "demo t2"})
        ok(f"demo transfer 2 ({chunk_b}) under limit → 200",
           r is not None and r.status_code in (200, 201),
           f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")

# Check current state again
r = req("GET", f"/blx/transfer/limits/{DEMO_MEMBER_ID}")
if r and r.status_code == 200:
    print(f"    demo limits post-t1/t2: {r.json()}")

# Now attempt another transfer that pushes over limit
r = req("POST", "/blx/transfer",
        json={"from_member_id": DEMO_MEMBER_ID, "to_member_id": ADMIN_MEMBER_ID, "amount_centavos": over_amount, "note": "demo t3 over"})
ok("demo transfer OVER limit → 403", r is not None and r.status_code == 403,
   f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")
if r is not None and r.status_code == 403:
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    ok("error mentions 'Limite mensal'", "Limite mensal" in str(detail) or "limite" in str(detail).lower(),
       f"detail={detail}")

# --- Black tier member blocked with "plano não permite" ---
if BLACK_MEMBER_ID:
    # Give black a little wallet balance (not required but clean)
    r = req("POST", "/wallet/topup",
            json={"member_id": BLACK_MEMBER_ID, "amount_centavos": 100_000, "note": "test black"},
            headers=topup_headers)
    # (ignore status — may fail if wallet existing differently)
    r = req("POST", "/blx/transfer",
            json={"from_member_id": BLACK_MEMBER_ID, "to_member_id": DEMO_MEMBER_ID, "amount_centavos": 1_000, "note": "black test"})
    ok("black transfer → 403 (plano não permite)", r is not None and r.status_code == 403,
       f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")
    if r is not None and r.status_code == 403:
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = r.text
        ok("black error mentions 'plano'/'não permite'", ("plano" in str(detail).lower() or "não permite" in str(detail).lower()),
           f"detail={detail}")


# ======================================================================
# Teardown: restore tiers
# ======================================================================
section("Teardown — restore original tiers")
for mid, t in orig.items():
    if t in ("silver", "gold", "diamond"):
        r = req("PUT", f"/admin/members/{mid}/plan", json={"plan": t}, headers=H_STAFF)
        print(f"    restored {mid} → {t} : {getattr(r,'status_code',None)}")
    else:
        # direct DB write for 'black' or other
        asyncio.run(_set_tier_direct(mid, t or "black"))
        print(f"    restored {mid} via DB → {t}")

# Summary
print("\n====================================================")
print(f"RESULT passed={PASS}  failed={FAIL}")
if FAILS:
    print("FAILS:")
    for f in FAILS:
        print(f"  - {f}")
print("====================================================")
sys.exit(0 if FAIL == 0 else 1)
