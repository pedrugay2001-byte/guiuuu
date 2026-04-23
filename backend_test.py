"""
BLACKSCLUB — SMOKE TEST PRE-DEPLOY
Testes críticos de read-only antes de deploy em produção (blacksclub.com).
Não cria dados, não altera estado.
"""
import os
import sys
import json
import requests
from typing import Dict, List, Tuple

BASE = os.environ.get("REACT_APP_BACKEND_URL") or "https://member-shop-2.preview.emergentagent.com"
API = f"{BASE}/api"

# Credenciais oficiais (ver /app/memory/test_credentials.md)
ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_PASS = "admin123"
OWNER_EMAIL = "guilherme925145000@gmail.com"
OWNER_PASS = "blacks2026"
DEMO_EMAIL = "demo@blacksclub.com"
DEMO_PASS = "novasenha123"

# Entidades fixas do review
DIAMOND_MEMBER_ID = "mem_7a9d652945e7"  # Luiz Guilherme (owner)
DIAMOND_WALLET = "BLX-JCM5T48X"
STORY_ID_PROBE = "st_bd34019616c5"

RESULTS: List[Tuple[str, bool, str]] = []
TIMEOUT = 30


def record(name: str, ok: bool, detail: str = ""):
    RESULTS.append((name, ok, detail))
    icon = "PASS" if ok else "FAIL"
    print(f"[{icon}] {name}  {detail}")


def safe_get(path: str, token: str = None, params: Dict = None) -> Tuple[int, dict | list | str]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        r = requests.get(f"{API}{path}", headers=headers, params=params, timeout=TIMEOUT)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, r.text[:500]
    except Exception as e:
        return -1, str(e)


def safe_post(path: str, body: dict, token: str = None) -> Tuple[int, dict | list | str]:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        r = requests.post(f"{API}{path}", headers=headers, json=body, timeout=TIMEOUT)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, r.text[:500]
    except Exception as e:
        return -1, str(e)


def section(title: str):
    print(f"\n{'='*70}\n{title}\n{'='*70}")


# =============================================================================
# 1. AUTH
# =============================================================================
section("1. AUTH — admin login + /auth/me")

status, body = safe_post("/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASS})
admin_token = None
if status == 200 and isinstance(body, dict):
    admin_token = body.get("token") or body.get("access_token")
    record(
        "POST /api/auth/login (admin)",
        bool(admin_token),
        f"status={status}, token_len={len(admin_token) if admin_token else 0}, role={body.get('role')}",
    )
else:
    record("POST /api/auth/login (admin)", False, f"status={status}, body={str(body)[:200]}")

if admin_token:
    status, body = safe_get("/auth/me", token=admin_token)
    ok = status == 200 and isinstance(body, dict) and body.get("email") == ADMIN_EMAIL
    record("GET /api/auth/me (admin token)", ok, f"status={status}, email={body.get('email') if isinstance(body, dict) else '-'}")
else:
    record("GET /api/auth/me (admin token)", False, "sem admin_token")


# =============================================================================
# 2. BLEX TOKEN (moeda interna)
# =============================================================================
section("2. BLEX TOKEN — wallet, lookup, transactions, orders, ratings")

status, body = safe_get(f"/blx/wallet/{DIAMOND_MEMBER_ID}")
ok = (
    status == 200
    and isinstance(body, dict)
    and body.get("wallet_number") == DIAMOND_WALLET
    and isinstance(body.get("balance_centavos"), int)
    and body.get("currency") == "BLX"
)
record(
    f"GET /api/blx/wallet/{DIAMOND_MEMBER_ID}",
    ok,
    f"status={status}, wallet={body.get('wallet_number') if isinstance(body, dict) else '-'}, balance_c={body.get('balance_centavos') if isinstance(body, dict) else '-'}",
)

status, body = safe_get("/blx/lookup", params={"q": DIAMOND_WALLET})
ok = status == 200 and isinstance(body, list) and len(body) >= 1 and any(x.get("wallet_number") == DIAMOND_WALLET for x in body)
record(
    f"GET /api/blx/lookup?q={DIAMOND_WALLET}",
    ok,
    f"status={status}, hits={len(body) if isinstance(body, list) else '-'}",
)

status, body = safe_get(f"/blx/transactions/{DIAMOND_MEMBER_ID}", params={"limit": 10})
ok = status == 200 and isinstance(body, list)
record(
    f"GET /api/blx/transactions/{DIAMOND_MEMBER_ID}?limit=10",
    ok,
    f"status={status}, txs={len(body) if isinstance(body, list) else '-'}",
)

status, body = safe_get(f"/blx/orders/{DIAMOND_MEMBER_ID}", params={"role": "buyer"})
ok = status == 200 and isinstance(body, list)
record(
    f"GET /api/blx/orders/{DIAMOND_MEMBER_ID}?role=buyer",
    ok,
    f"status={status}, orders={len(body) if isinstance(body, list) else '-'}",
)

status, body = safe_get(f"/blx/ratings/seller/{DIAMOND_MEMBER_ID}")
ok = status == 200 and isinstance(body, dict) and "ratings" in body and "average" in body and "count" in body
record(
    f"GET /api/blx/ratings/seller/{DIAMOND_MEMBER_ID}",
    ok,
    f"status={status}, count={body.get('count') if isinstance(body, dict) else '-'}, avg={body.get('average') if isinstance(body, dict) else '-'}",
)


# =============================================================================
# 3. MARKETPLACE DIAMOND
# =============================================================================
section("3. MARKETPLACE — ads, cart, favorites")

status, body = safe_get("/ads")
ok = status == 200 and isinstance(body, list)
record("GET /api/ads", ok, f"status={status}, ads={len(body) if isinstance(body, list) else '-'}")

status, body = safe_get(f"/cart/{DIAMOND_MEMBER_ID}")
# cart endpoint returns dict with items list
ok = status == 200 and (isinstance(body, dict) or isinstance(body, list))
record(
    f"GET /api/cart/{DIAMOND_MEMBER_ID}",
    ok,
    f"status={status}, type={type(body).__name__}",
)

status, body = safe_get(f"/favorites/{DIAMOND_MEMBER_ID}")
ok = status == 200 and isinstance(body, list)
record(
    f"GET /api/favorites/{DIAMOND_MEMBER_ID}",
    ok,
    f"status={status}, favs={len(body) if isinstance(body, list) else '-'}",
)


# =============================================================================
# 4. COMUNIDADE
# =============================================================================
section("4. COMUNIDADE — stories, feed, members, groups, events")

status, body = safe_get("/stories")
# Review pede: retornar array (mesmo que vazio)
ok = status == 200 and isinstance(body, list)
record(
    "GET /api/stories (deve ser array)",
    ok,
    f"status={status}, groups={len(body) if isinstance(body, list) else '-'}",
)

# Story image probe
status, body = safe_get(f"/stories/{STORY_ID_PROBE}/image")
# pode ser 200 se existe, ou 404 se foi deletado/expirou — mas NÃO 500
if status == 200:
    ok = isinstance(body, dict) and isinstance(body.get("image_base64"), str) and len(body.get("image_base64", "")) > 100
    detail = f"status=200, image_len={len(body.get('image_base64', '')) if isinstance(body, dict) else 0}"
elif status == 404:
    ok = True  # story pode ter expirado 24h — não é crítico para smoke
    detail = f"status=404 (story probe expirado, não-crítico)"
else:
    ok = False
    detail = f"status={status}, body={str(body)[:200]}"
record(f"GET /api/stories/{STORY_ID_PROBE}/image", ok, detail)

status, body = safe_get("/feed/posts")
ok = status == 200 and isinstance(body, list)
record("GET /api/feed/posts", ok, f"status={status}, posts={len(body) if isinstance(body, list) else '-'}")

status, body = safe_get("/community/members", params={"exclude": DIAMOND_MEMBER_ID})
ok = status == 200 and isinstance(body, list)
record(
    f"GET /api/community/members?exclude={DIAMOND_MEMBER_ID}",
    ok,
    f"status={status}, members={len(body) if isinstance(body, list) else '-'}",
)

status, body = safe_get("/community/groups")
ok = status == 200 and isinstance(body, list)
record("GET /api/community/groups", ok, f"status={status}, groups={len(body) if isinstance(body, list) else '-'}")

status, body = safe_get("/community/events")
ok = status == 200 and isinstance(body, list)
record("GET /api/community/events", ok, f"status={status}, events={len(body) if isinstance(body, list) else '-'}")


# =============================================================================
# 5. BLACK AI
# =============================================================================
section("5. BLACK AI — especialistas")

status, body = safe_get("/ai/specialists")
ok = status == 200 and isinstance(body, list) and len(body) >= 15
record(
    "GET /api/ai/specialists (deve ter >=15)",
    ok,
    f"status={status}, specialists={len(body) if isinstance(body, list) else '-'}",
)
if isinstance(body, list) and len(body) > 0:
    cats = {}
    for s in body:
        cats[s.get("category", "?")] = cats.get(s.get("category", "?"), 0) + 1
    print(f"    categorias: {cats}")


# =============================================================================
# 6. ADMIN
# =============================================================================
section("6. ADMIN — stats, metrics, members (staff token)")

if admin_token:
    status, body = safe_get("/admin/stats", token=admin_token)
    ok = status == 200 and isinstance(body, dict)
    record("GET /api/admin/stats (admin)", ok, f"status={status}, keys={list(body.keys()) if isinstance(body, dict) else '-'}")

    status, body = safe_get("/admin/metrics", token=admin_token)
    ok_struct = (
        status == 200
        and isinstance(body, dict)
        and all(k in body for k in ["supply", "volume_30d", "orders", "top_sellers"])
    )
    record(
        "GET /api/admin/metrics (admin)",
        ok_struct,
        f"status={status}, keys={list(body.keys()) if isinstance(body, dict) else '-'}",
    )

    if ok_struct:
        supply = body.get("supply", {})
        total_c = supply.get("total_cents")
        avail_c = supply.get("available_cents")
        escrow_out_c = supply.get("escrow_out_cents")
        invariant = (
            isinstance(total_c, int)
            and isinstance(avail_c, int)
            and isinstance(escrow_out_c, int)
            and total_c == avail_c + escrow_out_c
        )
        record(
            "Invariante: supply.total_cents == available_cents + escrow_out_cents",
            invariant,
            f"total={total_c}, avail={avail_c}, escrow_out={escrow_out_c}",
        )

        vol = body.get("volume_30d", {})
        orders = body.get("orders", {})
        top = body.get("top_sellers", [])
        ok_types = (
            isinstance(vol.get("total_cents"), int)
            and isinstance(vol.get("tx_count"), int)
            and isinstance(orders.get("open"), int)
            and isinstance(orders.get("completed"), int)
            and isinstance(top, list)
        )
        record(
            "admin/metrics: tipos corretos (volume_30d, orders, top_sellers)",
            ok_types,
            f"vol_30d.total={vol.get('total_cents')}, tx={vol.get('tx_count')}, orders_open={orders.get('open')}, top_sellers={len(top)}",
        )

    status, body = safe_get("/admin/members", token=admin_token)
    ok = status == 200 and isinstance(body, list)
    record("GET /api/admin/members (admin)", ok, f"status={status}, members={len(body) if isinstance(body, list) else '-'}")
else:
    record("ADMIN endpoints", False, "sem admin_token — login falhou")


# =============================================================================
# 7. GOALS (Performance Central)
# =============================================================================
section("7. GOALS — dashboard")

status, body = safe_get(f"/goals/dashboard/{DIAMOND_MEMBER_ID}")
ok = status == 200 and isinstance(body, dict)
record(
    f"GET /api/goals/dashboard/{DIAMOND_MEMBER_ID}",
    ok,
    f"status={status}, keys={list(body.keys()) if isinstance(body, dict) else '-'}",
)


# =============================================================================
# 8. VALIDAÇÃO EXTRA — nenhum 500
# =============================================================================
section("8. VALIDAÇÃO EXTRA — scan por 500")

any_500 = False
for name, ok, detail in RESULTS:
    if "status=500" in detail:
        any_500 = True
        print(f"    !!! 500 em {name}: {detail}")
record("Nenhum endpoint retornou 500 Internal Server Error", not any_500, "OK" if not any_500 else "ver acima")


# =============================================================================
# RESUMO
# =============================================================================
print("\n" + "=" * 70)
print("RESUMO")
print("=" * 70)
passed = sum(1 for _, ok, _ in RESULTS if ok)
failed = sum(1 for _, ok, _ in RESULTS if not ok)
print(f"Total: {len(RESULTS)} | PASS: {passed} | FAIL: {failed}")
print()
if failed:
    print("FALHAS:")
    for name, ok, detail in RESULTS:
        if not ok:
            print(f"  - {name}: {detail}")

sys.exit(0 if failed == 0 else 1)
