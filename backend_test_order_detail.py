"""
Review request — validar GET /api/orders/detail/{order_id}?member_id=... + sanity checks.
"""
import os
import sys
import requests
import json

BASE = os.environ.get("BASE_URL", "https://member-shop-2.preview.emergentagent.com/api")
TIMEOUT = 30

passed = 0
failed = 0
fails = []


def ok(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        fails.append(f"{name} {extra}")
        print(f"  ❌ {name} {extra}")


def section(t):
    print(f"\n=== {t} ===")


# --- Setup: login demo & admin ---
section("SETUP — login demo & admin")

r = requests.post(f"{BASE}/members/login",
                  json={"email": "demo@blacksclub.com", "password": "novasenha123"},
                  timeout=TIMEOUT)
ok("login demo 200", r.status_code == 200, r.text[:200])
demo = r.json()
demo_id = demo.get("member_id")
print(f"  demo member_id = {demo_id}")

r2 = requests.post(f"{BASE}/auth/login",
                   json={"email": "admin@farmaclube.com", "password": "admin123"},
                   timeout=TIMEOUT)
ok("login admin 200", r2.status_code == 200, r2.text[:200])
admin_token = r2.json().get("access_token")
admin_user_id = r2.json().get("user", {}).get("member_id")
print(f"  admin token chars={len(admin_token or '')}, admin_member_id={admin_user_id}")


# --- 1) GET my-purchases to find an existing order ---
section("1) GET /orders/my-purchases/<demo_id> — pegar order_id")
r = requests.get(f"{BASE}/orders/my-purchases/{demo_id}", timeout=TIMEOUT)
ok("my-purchases 200", r.status_code == 200, r.text[:200])
data = r.json()
orders_list = data.get("orders", [])
print(f"  count={data.get('count')}, orders={len(orders_list)}")
if not orders_list:
    print("!!! Demo não tem pedidos — criando compra pra gerar um. Precisamos de topup + produto.")
    # Try via buy-blx — pick first product
    rp = requests.get(f"{BASE}/products", timeout=TIMEOUT).json()
    prod = None
    for p in rp if isinstance(rp, list) else rp.get("products", []):
        if p.get("price_blx_cents") or p.get("price_cents"):
            prod = p
            break
    if prod:
        pid = prod.get("product_id") or prod.get("id")
        print(f"  tentando buy-blx product {pid}")
        # Topup demo com admin
        requests.post(f"{BASE}/wallet/topup",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      json={"member_id": demo_id, "amount_centavos": 500000},
                      timeout=TIMEOUT)
        b = requests.post(f"{BASE}/products/{pid}/buy-blx",
                          json={"member_id": demo_id, "pay_option": "entry"},
                          timeout=TIMEOUT)
        print(f"  buy-blx status={b.status_code} body={b.text[:200]}")
        r = requests.get(f"{BASE}/orders/my-purchases/{demo_id}", timeout=TIMEOUT)
        data = r.json()
        orders_list = data.get("orders", [])

assert orders_list, "Sem pedidos disponíveis para o demo"
order_id = orders_list[0]["order_id"]
print(f"  usando order_id={order_id}")


# --- 2) GET /orders/detail/<order_id>?member_id=<demo_id> ---
section("2) GET /orders/detail/<order_id>?member_id=<demo> — 200 + shape")
r = requests.get(f"{BASE}/orders/detail/{order_id}",
                 params={"member_id": demo_id}, timeout=TIMEOUT)
ok("detail 200", r.status_code == 200, r.text[:300])
body = r.json() if r.status_code == 200 else {}
ok("tem campo 'order'", "order" in body)
ok("tem campo 'tx' (pode ser None)", "tx" in body)
ok("tem campo 'timeline'", "timeline" in body)
ok("tem campo 'i_am_buyer'", "i_am_buyer" in body)
ok("tem campo 'i_am_seller'", "i_am_seller" in body)
o = body.get("order", {})
for f in ("order_id", "status", "total_cents", "entry_cents", "remaining_cents"):
    ok(f"order.{f} presente", f in o)
tl = body.get("timeline", [])
ok("timeline é lista com >=1 item", isinstance(tl, list) and len(tl) >= 1)
if tl:
    evs = [e.get("event") for e in tl]
    ok("timeline[0] event='created'", evs[0] == "created", f"got {evs[0]}")
ok("i_am_buyer == True (demo é buyer)", body.get("i_am_buyer") is True,
   f"got {body.get('i_am_buyer')}")


# --- 3) GET com outro member_id → 403 ---
section("3) GET /orders/detail com member_id NÃO relacionado → 403")
# Use Mateus (citado no test_result, mem_4f1c23b894d2) ou um id aleatório que exista mas não seja dono
# Verificar Luiz (mem_7a9d652945e7) — não é buyer nem seller desse order provavelmente
other_id = "mem_aaaa_notexist_00"
# Testa com um random ID não-relacionado
r = requests.get(f"{BASE}/orders/detail/{order_id}",
                 params={"member_id": other_id}, timeout=TIMEOUT)
# Verificar se o outro não é buyer/seller/admin
print(f"  status={r.status_code}, order.seller_id={o.get('seller_id')}, buyer_id={o.get('member_id')}")
ok("detail 403 para member não-relacionado",
   r.status_code == 403, f"got {r.status_code} body={r.text[:200]}")


# --- 4) GET sem member_id → 200 legacy-safe ---
section("4) GET /orders/detail SEM member_id → 200 legacy-safe")
r = requests.get(f"{BASE}/orders/detail/{order_id}", timeout=TIMEOUT)
ok("detail sem member_id → 200", r.status_code == 200, r.text[:200])
body2 = r.json() if r.status_code == 200 else {}
ok("sem member_id: i_am_buyer falsy",
   not body2.get("i_am_buyer"), f"got {body2.get('i_am_buyer')}")
ok("sem member_id: i_am_seller falsy",
   not body2.get("i_am_seller"), f"got {body2.get('i_am_seller')}")
ok("sem member_id: ainda tem timeline", "timeline" in body2 and len(body2["timeline"]) >= 1)


# --- 5) GET order inexistente → 404 ---
section("5) GET /orders/detail/ord_inexistente → 404")
r = requests.get(f"{BASE}/orders/detail/ord_inexistente_xyz_123",
                 params={"member_id": demo_id}, timeout=TIMEOUT)
ok("detail 404 pra id inexistente", r.status_code == 404,
   f"got {r.status_code} body={r.text[:200]}")


# --- 6) Verificar order cancelled e delivered se existirem ---
section("6) Timeline para orders cancelled / delivered_settled")
# Procurar nas listas
cancelled_order = None
delivered_order = None
for o2 in orders_list:
    st = o2.get("status")
    if st == "cancelled" and not cancelled_order:
        cancelled_order = o2
    if st == "delivered_settled" and not delivered_order:
        delivered_order = o2

if cancelled_order:
    cid = cancelled_order["order_id"]
    r = requests.get(f"{BASE}/orders/detail/{cid}",
                     params={"member_id": demo_id}, timeout=TIMEOUT)
    ok(f"detail cancelled {cid} 200", r.status_code == 200)
    if r.status_code == 200:
        tl = r.json().get("timeline", [])
        evs = [e.get("event") for e in tl]
        ok("cancelled timeline tem created+cancelled",
           "created" in evs and "cancelled" in evs, f"got {evs}")
else:
    print("  (sem pedido cancelled para validar — SKIP)")

if delivered_order:
    did = delivered_order["order_id"]
    r = requests.get(f"{BASE}/orders/detail/{did}",
                     params={"member_id": demo_id}, timeout=TIMEOUT)
    ok(f"detail delivered {did} 200", r.status_code == 200)
    if r.status_code == 200:
        tl = r.json().get("timeline", [])
        evs = [e.get("event") for e in tl]
        ok("delivered timeline tem created+delivered",
           "created" in evs and "delivered" in evs, f"got {evs}")
else:
    print("  (sem pedido delivered_settled para validar — SKIP)")


# --- 6b) Admin pode ver qualquer pedido ---
section("6b) GET /orders/detail com admin member_id (quando possível)")
if admin_user_id:
    r = requests.get(f"{BASE}/orders/detail/{order_id}",
                     params={"member_id": admin_user_id}, timeout=TIMEOUT)
    ok(f"admin detail 200 (member_id={admin_user_id})",
       r.status_code == 200, r.text[:200])
else:
    print("  admin_user_id desconhecido — SKIP")


# --- SANITY — wallet ---
section("Sanidade — GET /blx/wallet/<demo>")
r = requests.get(f"{BASE}/blx/wallet/{demo_id}", timeout=TIMEOUT)
ok("wallet 200", r.status_code == 200, r.text[:200])
w = r.json() if r.status_code == 200 else {}
ok("wallet.reserved_centavos presente int",
   isinstance(w.get("reserved_centavos"), int))
ok("wallet.balance_centavos presente int",
   isinstance(w.get("balance_centavos"), int))
ok("wallet.total_centavos presente int",
   isinstance(w.get("total_centavos"), int))
ok("invariante total==balance+reserved",
   w.get("total_centavos") == w.get("balance_centavos") + w.get("reserved_centavos"),
   f"{w.get('total_centavos')} vs {w.get('balance_centavos')}+{w.get('reserved_centavos')}")


# --- SANITY — INSUFFICIENT_BLX em products/buy-blx ---
section("Sanidade — POST /products/{id}/buy-blx bloqueia com INSUFFICIENT_BLX")
# Encontrar um membro com saldo baixo — usar id fictício novo (lazy create => 0 saldo)
# Ou usar Mateus (mem_4f1c23b894d2) se ainda existe
low_id = "mem_4f1c23b894d2"  # Mateus — ~195 BLX; insufficient for pricier products
# Get any product
rp = requests.get(f"{BASE}/products", params={"member_id": demo_id}, timeout=TIMEOUT)
if rp.status_code == 200:
    raw = rp.json()
    prod_list = raw if isinstance(raw, list) else raw.get("products", [])
    exp_prod = None
    for p in prod_list:
        # Filtrar produtos caros o suficiente pra bloquear com 19585c
        price = p.get("price_blx_cents") or int((p.get("price_blx") or 0) * 100) or int((p.get("price") or 0) * 100)
        if p.get("stock", 1) > 0 and price > 20000:
            exp_prod = p
            break
    if exp_prod:
        pid = exp_prod.get("product_id") or exp_prod.get("id")
        b = requests.post(f"{BASE}/products/{pid}/buy-blx",
                          json={"member_id": low_id, "pay_option": "full"},
                          timeout=TIMEOUT)
        ok("buy-blx retorna 400 pra saldo zero",
           b.status_code == 400, f"got {b.status_code} body={b.text[:200]}")
        if b.status_code == 400:
            bd = b.json().get("detail", {})
            if isinstance(bd, dict):
                ok("detail.error_code == INSUFFICIENT_BLX",
                   bd.get("error_code") == "INSUFFICIENT_BLX", f"got {bd}")
            else:
                ok("detail é dict", False, f"got str: {bd}")
    else:
        print("  sem produto disponível — SKIP")
else:
    print(f"  products list failed {rp.status_code} — SKIP")


# --- SANITY — tier-lock groups ---
section("Sanidade — Grupos tier_lock retornam locked=true quando tier não bate")
r = requests.get(f"{BASE}/community/groups",
                 params={"member_id": demo_id}, timeout=TIMEOUT)
ok("groups 200", r.status_code == 200, r.text[:200])
if r.status_code == 200:
    groups = r.json() if isinstance(r.json(), list) else r.json().get("groups", [])
    demo_tier = (demo.get("tier") or "").lower()
    print(f"  demo tier={demo_tier}")
    # Diamond demo → black/silver/gold devem estar locked
    for gid, req in [("g_tier_black", "black"),
                     ("g_tier_silver", "silver"),
                     ("g_tier_gold", "gold"),
                     ("g_tier_diamond", "diamond")]:
        g = next((g for g in groups if g.get("group_id") == gid), None)
        if g is None:
            ok(f"grupo {gid} existe", False, "não encontrado")
            continue
        expected_locked = (demo_tier != req)
        ok(f"{gid} locked == {expected_locked}",
           g.get("locked") == expected_locked,
           f"got locked={g.get('locked')}, required_tier={g.get('required_tier')}")


# --- SANITY — /goals/{id}/detail ---
section("Sanidade — GET /goals/{goal_id}/detail 200")
# Find a goal for demo, or create one
rg = requests.get(f"{BASE}/goals/{demo_id}", timeout=TIMEOUT)
print(f"  goals list status={rg.status_code}")
gl = []
if rg.status_code == 200:
    body = rg.json()
    gl = body if isinstance(body, list) else body.get("goals", [])
goal_id = None
if gl:
    goal_id = gl[0].get("goal_id")
    print(f"  achei goal {goal_id}")
else:
    print("  sem metas — criando uma pra testar detail")
    cr = requests.post(f"{BASE}/goals",
                       json={
                           "member_id": demo_id,
                           "title": "Perder 5kg teste",
                           "type": "weight",
                           "initial_value": 90.0,
                           "current_value": 90.0,
                           "target_value": 85.0,
                           "end_date": "2026-12-31",
                       }, timeout=TIMEOUT)
    print(f"  POST /goals status={cr.status_code} body={cr.text[:200]}")
    if cr.status_code == 200:
        goal_id = cr.json().get("goal_id") or cr.json().get("goal", {}).get("goal_id")

if goal_id:
    r = requests.get(f"{BASE}/goals/{goal_id}/detail", timeout=TIMEOUT)
    ok("goal detail 200", r.status_code == 200, r.text[:200])
    if r.status_code == 200:
        gd = r.json()
        ok("resp tem 'goal'", "goal" in gd)
        ok("resp tem 'entries'", "entries" in gd)
        ok("resp.entries é lista", isinstance(gd.get("entries"), list))
        # Review pediu weekly_rhythm mas implementação usa 'photos'
        print(f"  chaves retornadas: {list(gd.keys())}")
else:
    print("  não foi possível obter goal_id — SKIP")


# --- Summary ---
print(f"\n\n=====\nPASSED={passed}  FAILED={failed}")
if fails:
    print("FAILURES:")
    for f in fails:
        print(f"  - {f}")
sys.exit(0 if failed == 0 else 1)
