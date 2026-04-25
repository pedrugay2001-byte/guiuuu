"""
Tests for the 7 NEW PIX MANUAL ORDER endpoints in /app/backend/server.py.

Endpoints under test:
1) GET  /api/blx/pix-info                                  (no auth)
2) POST /api/blx/pix-orders                                (no auth)
3) GET  /api/blx/pix-orders/me/{member_id}                 (no auth)
4) GET  /api/blx/pix-orders                                (JWT staff)
5) GET  /api/blx/pix-orders/stats                          (JWT staff)
6) POST /api/blx/pix-orders/{order_id}/approve             (JWT staff)
7) POST /api/blx/pix-orders/{order_id}/reject              (JWT staff)
"""

import os
import sys
import json
import requests

BASE = os.environ.get("BACKEND_URL") or "https://member-shop-2.preview.emergentagent.com"
API = f"{BASE}/api"

PASS = 0
FAIL = 0
errors = []


def check(cond: bool, msg: str):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {msg}")
    else:
        FAIL += 1
        errors.append(msg)
        print(f"  ❌ {msg}")


def section(title: str):
    print(f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f" {title}")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")


# ──────────────────────────────────────────────────────────────────────────
# Setup: get member_id via /members/login (demo) and JWT via /auth/login (admin)
# ──────────────────────────────────────────────────────────────────────────
section("SETUP — login demo (member) + login admin (JWT)")

r = requests.post(f"{API}/members/login", json={
    "email": "demo@blacksclub.com",
    "password": "novasenha123",
}, timeout=15)
check(r.status_code == 200, f"members/login demo: status={r.status_code}")
demo_member_id = None
if r.status_code == 200:
    body = r.json()
    demo_member_id = body.get("member_id")
    check(bool(demo_member_id), f"demo.member_id retornado: {demo_member_id}")
else:
    print("  body:", r.text[:300])
    sys.exit(1)

r = requests.post(f"{API}/auth/login", json={
    "email": "admin@farmaclube.com",
    "password": "admin123",
}, timeout=15)
check(r.status_code == 200, f"auth/login admin: status={r.status_code}")
admin_token = None
if r.status_code == 200:
    admin_token = r.json().get("token")
    check(bool(admin_token) and len(admin_token) > 20, "admin JWT token recebido")
else:
    print("  body:", r.text[:300])
    sys.exit(1)

ADMIN_HDR = {"Authorization": f"Bearer {admin_token}"}

# Forge JWT for non-staff user (demo's user_id won't exist; we need a member-role user).
# Workaround: try to use the demo member_id as user_id -> get_current_user requires
# users collection lookup by user_id. We'll skip 403 test if no member-role user exists.
# But simpler: try logging in via /members/login with another member's password? we
# only need to check 401 sem token + 200 com admin. The 403 test we'll attempt with
# a fake forged JWT pointing to a non-staff user.

# Try to get a non-staff JWT: members/login returns staff_token only if there's a
# matching `users` row. demo doesn't, so its staff_token is None. Without a
# member-role JWT, we will only validate 401 (no token).


# ──────────────────────────────────────────────────────────────────────────
# 1) GET /api/blx/pix-info  (no auth)
# ──────────────────────────────────────────────────────────────────────────
section("1) GET /api/blx/pix-info")
r = requests.get(f"{API}/blx/pix-info", timeout=15)
check(r.status_code == 200, f"GET /blx/pix-info → 200 (got {r.status_code})")
if r.status_code == 200:
    info = r.json()
    check(info.get("beneficiario") == "BRLA Digital Ltda", "beneficiario=='BRLA Digital Ltda'")
    check(info.get("cnpj_masked") == "50.***.***/0001-7*", f"cnpj_masked correto (got {info.get('cnpj_masked')!r})")
    check(info.get("instituicao") == "STARK BANK S.A. - IP", "instituicao=='STARK BANK S.A. - IP'")
    pix_code = info.get("pix_code") or ""
    check(isinstance(pix_code, str) and pix_code.startswith("00020126870014br.gov.bcb.pix"),
          f"pix_code começa com '00020126870014br.gov.bcb.pix...' (len={len(pix_code)})")
    check(info.get("fee_pct") == 1.0, f"fee_pct==1.0 (got {info.get('fee_pct')})")
    check(info.get("rate_brl_to_blx") == 1.0, f"rate_brl_to_blx==1.0 (got {info.get('rate_brl_to_blx')})")
    check(int(info.get("min_brl") or 0) == 10, f"min_brl==10 (got {info.get('min_brl')})")
    check(info.get("estimated_minutes") == 10, f"estimated_minutes==10 (got {info.get('estimated_minutes')})")
    instr = info.get("instructions") or []
    check(isinstance(instr, list) and len(instr) >= 4, f"instructions é array com >=4 itens (got {len(instr)})")


# ──────────────────────────────────────────────────────────────────────────
# 2) POST /api/blx/pix-orders  (no auth) — validações matemáticas e de erro
# ──────────────────────────────────────────────────────────────────────────
section("2) POST /api/blx/pix-orders — sucesso + validação matemática")

cases = [
    (100.00, 9900),     # R$ 100 → 99,00 BLX
    (50.00, 4950),      # R$ 50  → 49,50 BLX
    (1000.00, 99000),   # R$ 1000 → 990,00 BLX
    (99.99, 9899),      # R$ 99,99 → 98,99 BLX (round)
]

created_orders = []  # (order_id, blx_cents, brl_cents)
for amount, expected_blx in cases:
    body = {"member_id": demo_member_id, "amount_brl": amount, "note": f"teste R${amount}"}
    r = requests.post(f"{API}/blx/pix-orders", json=body, timeout=15)
    check(r.status_code == 200, f"POST pix-orders amount_brl={amount} → 200 (got {r.status_code})")
    if r.status_code == 200:
        o = r.json()
        check(o.get("status") == "pending", f"status=='pending' (got {o.get('status')})")
        check(o.get("blx_centavos") == expected_blx,
              f"blx_centavos == {expected_blx} para R${amount} (got {o.get('blx_centavos')})")
        expected_brl_cents = int(round(amount * 100))
        check(o.get("amount_brl_centavos") == expected_brl_cents,
              f"amount_brl_centavos == {expected_brl_cents} (got {o.get('amount_brl_centavos')})")
        check(o.get("member_id") == demo_member_id, "member_id ecoado")
        check(bool(o.get("order_id", "").startswith("pix_")), f"order_id começa com 'pix_' (got {o.get('order_id')})")
        check(o.get("fee_pct") == 1.0, "fee_pct==1.0 no order")
        created_orders.append((o.get("order_id"), o.get("blx_centavos"), o.get("amount_brl_centavos")))


section("2b) POST /api/blx/pix-orders — erros de validação")

# amount abaixo do mínimo
r = requests.post(f"{API}/blx/pix-orders", json={
    "member_id": demo_member_id, "amount_brl": 5.0,
}, timeout=15)
check(r.status_code == 400, f"amount_brl=5 (abaixo de 10) → 400 (got {r.status_code})")

# member_id inexistente
r = requests.post(f"{API}/blx/pix-orders", json={
    "member_id": "naoexiste", "amount_brl": 100.0,
}, timeout=15)
check(r.status_code == 404, f"member_id='naoexiste' → 404 (got {r.status_code})")

# Sem amount
r = requests.post(f"{API}/blx/pix-orders", json={
    "member_id": demo_member_id,
}, timeout=15)
check(r.status_code == 400, f"sem amount_brl/amount_brl_centavos → 400 (got {r.status_code})")


# ──────────────────────────────────────────────────────────────────────────
# 3) GET /api/blx/pix-orders/me/{member_id}  (no auth)
# ──────────────────────────────────────────────────────────────────────────
section("3) GET /api/blx/pix-orders/me/{member_id}")
r = requests.get(f"{API}/blx/pix-orders/me/{demo_member_id}", timeout=15)
check(r.status_code == 200, f"GET me/{{id}} → 200 (got {r.status_code})")
if r.status_code == 200:
    body = r.json()
    orders = body.get("orders")
    check(isinstance(orders, list), "body.orders é list")
    check(len(orders) >= len(created_orders),
          f"len(orders) >= {len(created_orders)} criados nesta sessão (got {len(orders)})")
    # Não deve incluir receipt_base64
    has_receipt = any("receipt_base64" in o for o in orders)
    check(not has_receipt, "Nenhum order traz receipt_base64 (excluído por projeção)")
    # Ordenação desc por created_at
    if len(orders) >= 2:
        ts = [o.get("created_at") for o in orders if o.get("created_at")]
        check(ts == sorted(ts, reverse=True), "Orders ordenados por created_at desc")


# ──────────────────────────────────────────────────────────────────────────
# 4) GET /api/blx/pix-orders  (JWT staff)
# ──────────────────────────────────────────────────────────────────────────
section("4) GET /api/blx/pix-orders (staff)")

# Sem token → 401/403
r = requests.get(f"{API}/blx/pix-orders", timeout=15)
check(r.status_code in (401, 403), f"sem token → 401/403 (got {r.status_code})")

# Com admin token → 200
r = requests.get(f"{API}/blx/pix-orders", headers=ADMIN_HDR, timeout=15)
check(r.status_code == 200, f"com admin token → 200 (got {r.status_code})")
if r.status_code == 200:
    body = r.json()
    check(isinstance(body.get("orders"), list), "body.orders é list")
    n_total = len(body["orders"])
    check(n_total >= 4, f"pelo menos 4 orders (criados nesta rodada). got {n_total}")

# ?status=pending
r = requests.get(f"{API}/blx/pix-orders?status=pending", headers=ADMIN_HDR, timeout=15)
check(r.status_code == 200, f"?status=pending → 200 (got {r.status_code})")
if r.status_code == 200:
    body = r.json()
    items = body.get("orders") or []
    all_pending = all(o.get("status") == "pending" for o in items)
    check(all_pending, f"todos os items têm status=='pending' (got {len(items)} items)")


# ──────────────────────────────────────────────────────────────────────────
# 5) GET /api/blx/pix-orders/stats  (JWT staff)
# ──────────────────────────────────────────────────────────────────────────
section("5) GET /api/blx/pix-orders/stats")

r = requests.get(f"{API}/blx/pix-orders/stats", timeout=15)
check(r.status_code in (401, 403), f"sem token → 401/403 (got {r.status_code})")

r = requests.get(f"{API}/blx/pix-orders/stats", headers=ADMIN_HDR, timeout=15)
check(r.status_code == 200, f"com admin token → 200 (got {r.status_code})")
if r.status_code == 200:
    s = r.json()
    check(isinstance(s.get("pending"), int), f"pending é int (got {type(s.get('pending')).__name__})")
    check(isinstance(s.get("approved"), int), f"approved é int (got {type(s.get('approved')).__name__})")
    check(isinstance(s.get("rejected"), int), f"rejected é int (got {type(s.get('rejected')).__name__})")
    check(s.get("pending") >= len(created_orders),
          f"pending ({s.get('pending')}) >= {len(created_orders)} criados nesta rodada")


# ──────────────────────────────────────────────────────────────────────────
# 6) POST /api/blx/pix-orders/{order_id}/approve  (JWT staff)
# ──────────────────────────────────────────────────────────────────────────
section("6) POST /api/blx/pix-orders/{order_id}/approve")

# Cria pedido fresh
r = requests.post(f"{API}/blx/pix-orders", json={
    "member_id": demo_member_id, "amount_brl": 200.00, "note": "para aprovar",
}, timeout=15)
check(r.status_code == 200, "Cria pedido fresh para aprovação → 200")
fresh = r.json() if r.status_code == 200 else {}
fresh_id = fresh.get("order_id")
fresh_blx = int(fresh.get("blx_centavos") or 0)  # esperado 19800
check(fresh_blx == 19800, f"blx_centavos do pedido fresh == 19800 (got {fresh_blx})")

# Saldo antes
r = requests.get(f"{API}/wallet/{demo_member_id}", timeout=15)
balance_before = int((r.json() or {}).get("balance_centavos") or 0) if r.status_code == 200 else None
check(balance_before is not None, f"balance_before lido (got {balance_before})")

# Sem token → 401/403
r = requests.post(f"{API}/blx/pix-orders/{fresh_id}/approve", json={"note": "x"}, timeout=15)
check(r.status_code in (401, 403), f"approve sem token → 401/403 (got {r.status_code})")

# Aprovar com admin
r = requests.post(f"{API}/blx/pix-orders/{fresh_id}/approve",
                  headers=ADMIN_HDR, json={"note": "aprovado pós-conferência"}, timeout=15)
check(r.status_code == 200, f"approve com admin → 200 (got {r.status_code}) body={r.text[:200]}")
approved_tx_id = None
if r.status_code == 200:
    body = r.json()
    check(body.get("ok") is True, "ok==true")
    o = body.get("order") or {}
    check(o.get("status") == "approved", f"order.status=='approved' (got {o.get('status')})")
    check(bool(o.get("approved_at")), f"approved_at presente (got {o.get('approved_at')!r})")
    check(o.get("approved_by_email") == "admin@farmaclube.com",
          f"approved_by_email=='admin@farmaclube.com' (got {o.get('approved_by_email')!r})")
    approved_tx_id = o.get("tx_id")
    check(bool(approved_tx_id), f"tx_id presente no order (got {approved_tx_id!r})")

# Saldo depois — deve ter aumentado em fresh_blx (19800)
r = requests.get(f"{API}/wallet/{demo_member_id}", timeout=15)
balance_after = int((r.json() or {}).get("balance_centavos") or 0) if r.status_code == 200 else None
check(balance_after is not None, f"balance_after lido (got {balance_after})")
if balance_before is not None and balance_after is not None:
    check(balance_after - balance_before == fresh_blx,
          f"balance_centavos aumentou em {fresh_blx} (before={balance_before} after={balance_after} delta={balance_after - balance_before})")

# Verifica wallet_tx tipo topup com ref_pix_order_id
r = requests.get(f"{API}/wallet/{demo_member_id}/transactions", timeout=15)
check(r.status_code == 200, f"GET wallet/{{id}}/transactions → 200 (got {r.status_code})")
if r.status_code == 200:
    txs = r.json() or []
    matches = [t for t in txs if t.get("ref_pix_order_id") == fresh_id]
    check(len(matches) == 1, f"exatamente 1 wallet_tx com ref_pix_order_id=={fresh_id} (got {len(matches)})")
    if matches:
        tx = matches[0]
        check(tx.get("type") == "topup", f"tx.type=='topup' (got {tx.get('type')})")
        check(tx.get("amount_centavos") == fresh_blx,
              f"tx.amount_centavos == {fresh_blx} (got {tx.get('amount_centavos')})")
        check(tx.get("status") == "settled", f"tx.status=='settled' (got {tx.get('status')})")
        if approved_tx_id:
            check(tx.get("tx_id") == approved_tx_id,
                  f"tx.tx_id casa com order.tx_id (got {tx.get('tx_id')!r} expected {approved_tx_id!r})")

# Idempotência — chamar approve novamente
r = requests.post(f"{API}/blx/pix-orders/{fresh_id}/approve",
                  headers=ADMIN_HDR, json={"note": "second call"}, timeout=15)
check(r.status_code == 200, f"approve 2x → 200 (got {r.status_code})")
if r.status_code == 200:
    body = r.json()
    check(body.get("ok") is True, "2x: ok==true")
    check(body.get("already") == "approved", f"2x: already=='approved' (got {body.get('already')!r})")

# Garante que não creditou de novo
r = requests.get(f"{API}/wallet/{demo_member_id}", timeout=15)
balance_after2 = int((r.json() or {}).get("balance_centavos") or 0) if r.status_code == 200 else None
if balance_after is not None and balance_after2 is not None:
    check(balance_after2 == balance_after,
          f"saldo não mudou após 2ª chamada (after={balance_after} after2={balance_after2})")

# Garante que tx wallet com ref_pix_order_id continua sendo apenas 1
r = requests.get(f"{API}/wallet/{demo_member_id}/transactions", timeout=15)
if r.status_code == 200:
    txs = r.json() or []
    matches = [t for t in txs if t.get("ref_pix_order_id") == fresh_id]
    check(len(matches) == 1, f"ainda apenas 1 wallet_tx para esse pedido (got {len(matches)})")


# ──────────────────────────────────────────────────────────────────────────
# 7) POST /api/blx/pix-orders/{order_id}/reject  (JWT staff)
# ──────────────────────────────────────────────────────────────────────────
section("7) POST /api/blx/pix-orders/{order_id}/reject")

# Cria pedido fresh
r = requests.post(f"{API}/blx/pix-orders", json={
    "member_id": demo_member_id, "amount_brl": 150.00, "note": "para rejeitar",
}, timeout=15)
check(r.status_code == 200, "Cria pedido fresh para rejeição → 200")
reject_order = r.json() if r.status_code == 200 else {}
reject_id = reject_order.get("order_id")
reject_blx = int(reject_order.get("blx_centavos") or 0)

# Saldo antes
r = requests.get(f"{API}/wallet/{demo_member_id}", timeout=15)
bal_before_rej = int((r.json() or {}).get("balance_centavos") or 0) if r.status_code == 200 else None

# Sem token → 401/403
r = requests.post(f"{API}/blx/pix-orders/{reject_id}/reject", json={"note": "x"}, timeout=15)
check(r.status_code in (401, 403), f"reject sem token → 401/403 (got {r.status_code})")

# Rejeitar com admin
r = requests.post(f"{API}/blx/pix-orders/{reject_id}/reject",
                  headers=ADMIN_HDR, json={"note": "PIX não identificado"}, timeout=15)
check(r.status_code == 200, f"reject com admin → 200 (got {r.status_code}) body={r.text[:200]}")
if r.status_code == 200:
    body = r.json()
    check(body.get("ok") is True, "reject ok==true")
    o = body.get("order") or {}
    check(o.get("status") == "rejected", f"order.status=='rejected' (got {o.get('status')})")
    check(o.get("rejection_reason") == "PIX não identificado",
          f"rejection_reason=='PIX não identificado' (got {o.get('rejection_reason')!r})")
    check(o.get("rejected_by_email") == "admin@farmaclube.com",
          f"rejected_by_email=='admin@farmaclube.com' (got {o.get('rejected_by_email')!r})")

# Não cria wallet_tx
r = requests.get(f"{API}/wallet/{demo_member_id}/transactions", timeout=15)
if r.status_code == 200:
    txs = r.json() or []
    matches = [t for t in txs if t.get("ref_pix_order_id") == reject_id]
    check(len(matches) == 0, f"NENHUM wallet_tx criado para reject (got {len(matches)})")

# Saldo não mudou
r = requests.get(f"{API}/wallet/{demo_member_id}", timeout=15)
bal_after_rej = int((r.json() or {}).get("balance_centavos") or 0) if r.status_code == 200 else None
if bal_before_rej is not None and bal_after_rej is not None:
    check(bal_after_rej == bal_before_rej,
          f"saldo não mudou pós-reject (before={bal_before_rej} after={bal_after_rej})")

# Idempotência
r = requests.post(f"{API}/blx/pix-orders/{reject_id}/reject",
                  headers=ADMIN_HDR, json={"note": "second reject"}, timeout=15)
check(r.status_code == 200, f"reject 2x → 200 (got {r.status_code})")
if r.status_code == 200:
    body = r.json()
    check(body.get("already") == "rejected", f"2x: already=='rejected' (got {body.get('already')!r})")


# ──────────────────────────────────────────────────────────────────────────
# RESULT
# ──────────────────────────────────────────────────────────────────────────
print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print(f"RESULT  passed={PASS}  failed={FAIL}")
if errors:
    print("\nFailures:")
    for e in errors:
        print(f"  - {e}")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

sys.exit(0 if FAIL == 0 else 1)
