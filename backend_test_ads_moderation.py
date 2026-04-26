"""
Smoke test focado: regressão dos endpoints POST/PUT/DELETE de /api/ads
após mudança para suportar moderação por staff e hard-delete por padrão.
"""
import os
import sys
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://member-shop-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_PASSWORD = "WE1U-DARN-OIKP-OH07!94"

PUBLISHER_ID = "mem_5c0fee9f50c1"      # RHIAN MIGUEL — Diamond, can_post_ads=true
NONPUB_ID    = "mem_e5bb9b5878dd"      # Guilherme Demo — Diamond, can_post_ads NOT set

results = []
def ok(msg):    results.append(("PASS", msg)); print(f"  ✅ {msg}")
def fail(msg):  results.append(("FAIL", msg)); print(f"  ❌ {msg}")

# ---------- Login admin ----------
print("\n=== LOGIN ADMIN ===")
r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
assert r.status_code == 200, f"login admin falhou: {r.status_code} {r.text[:200]}"
admin_token = r.json().get("token") or r.json().get("access_token")
assert admin_token, f"sem token na resposta: {r.json()}"
print(f"  admin token len={len(admin_token)}")
HDR_ADMIN = {"Authorization": f"Bearer {admin_token}"}

# Helper to create ad payload
def ad_payload(seller_id, title="Teste anúncio moderação"):
    return {
        "seller_id": seller_id,
        "title": title,
        "description": "Descrição teste smoke moderação",
        "price_full": 150.0,
        "category": "outros",
        "images": [],
        "stock": 3,
    }

ads_to_cleanup = []  # ad_ids that may need cleanup at end

# =====================================================================
# 1) POST /api/ads
# =====================================================================
print("\n=== 1) POST /api/ads ===")

# 1a) staff JWT (admin) cria anúncio em nome de qualquer membro publisher (RHIAN)
r = requests.post(f"{API}/ads", json=ad_payload(PUBLISHER_ID, "AD via JWT admin (smoke)"), headers=HDR_ADMIN, timeout=20)
if r.status_code == 200:
    ad_admin = r.json()
    ad_admin_id = ad_admin.get("ad_id")
    ads_to_cleanup.append(ad_admin_id)
    ok(f"1a) staff JWT cria anúncio → 200 (ad_id={ad_admin_id})")
    if ad_admin.get("posted_by_role") in ("admin","support","financeiro"):
        ok(f"1a) posted_by_role={ad_admin.get('posted_by_role')}")
    else:
        fail(f"1a) posted_by_role inesperado: {ad_admin.get('posted_by_role')}")
    if ad_admin.get("verified") is True:
        ok("1a) verified=True (anúncio oficial)")
    else:
        fail(f"1a) verified esperado True, got {ad_admin.get('verified')}")
else:
    fail(f"1a) staff JWT cria anúncio → status {r.status_code} body {r.text[:200]}")
    ad_admin_id = None

# 1b) sem JWT, com seller_id de membro publisher (RHIAN) → OK
r = requests.post(f"{API}/ads", json=ad_payload(PUBLISHER_ID, "AD via publisher member (smoke)"), timeout=20)
if r.status_code == 200:
    ad_pub = r.json()
    ad_pub_id = ad_pub.get("ad_id")
    ads_to_cleanup.append(ad_pub_id)
    ok(f"1b) publisher (sem JWT) cria → 200 (ad_id={ad_pub_id})")
    if ad_pub.get("posted_by_role") == "diamond_publisher":
        ok("1b) posted_by_role=diamond_publisher")
    else:
        fail(f"1b) posted_by_role esperado diamond_publisher, got {ad_pub.get('posted_by_role')}")
    if ad_pub.get("verified") is False:
        ok("1b) verified=False (publisher não-oficial)")
    else:
        fail(f"1b) verified esperado False, got {ad_pub.get('verified')}")
else:
    fail(f"1b) publisher cria → status {r.status_code} body {r.text[:200]}")
    ad_pub_id = None

# 1c) sem JWT, member sem can_post_ads (Demo) → 403
r = requests.post(f"{API}/ads", json=ad_payload(NONPUB_ID, "AD via non-publisher (deve falhar)"), timeout=20)
if r.status_code == 403:
    ok("1c) non-publisher (sem JWT) → 403 ✅")
else:
    fail(f"1c) non-publisher esperado 403, got {r.status_code} body {r.text[:200]}")

# =====================================================================
# 2) DELETE /api/ads/{ad_id}
# =====================================================================
print("\n=== 2) DELETE /api/ads/{ad_id} ===")

# Helper para criar ad de teste (publisher)
def create_pub_ad(title="Ad smoke delete"):
    r = requests.post(f"{API}/ads", json=ad_payload(PUBLISHER_ID, title), timeout=20)
    assert r.status_code == 200, f"create_pub_ad falhou: {r.status_code} {r.text[:200]}"
    return r.json()["ad_id"]

# 2a) Dono apaga próprio anúncio (hard delete default)
ad1 = create_pub_ad("Ad smoke 2a hard delete by owner")
r = requests.delete(f"{API}/ads/{ad1}", params={"seller_id": PUBLISHER_ID}, timeout=20)
if r.status_code == 200:
    body = r.json()
    if body.get("ok") and body.get("deleted") is True:
        ok(f"2a) dono hard-delete próprio ad → 200 ok=true deleted=true")
    else:
        fail(f"2a) body inesperado: {body}")
    # Confirmar que GET retorna 404
    r2 = requests.get(f"{API}/ads/{ad1}", timeout=20)
    if r2.status_code == 404:
        ok("2a) GET /ads/{id} pós hard-delete → 404")
    else:
        fail(f"2a) GET após delete esperado 404, got {r2.status_code}")
else:
    fail(f"2a) dono delete → status {r.status_code} body {r.text[:200]}")

# 2b) Outro membro (não dono) tenta apagar — usar NONPUB como atacante.
ad2 = create_pub_ad("Ad smoke 2b - other member tries delete")
r = requests.delete(f"{API}/ads/{ad2}", params={"seller_id": NONPUB_ID}, timeout=20)
if r.status_code == 403:
    ok("2b) outro membro tenta deletar → 403")
else:
    fail(f"2b) outro membro esperado 403, got {r.status_code} body {r.text[:200]}")
# Garante que ad2 ainda existe
r2 = requests.get(f"{API}/ads/{ad2}", timeout=20)
if r2.status_code == 200:
    ok("2b) ad ainda existe após tentativa não autorizada")
else:
    fail(f"2b) ad sumiu após 403 (status={r2.status_code})")

# 2c) Staff JWT apaga ad de outro membro (moderação)
r = requests.delete(f"{API}/ads/{ad2}", params={"seller_id": "qualquer_id_falso"}, headers=HDR_ADMIN, timeout=20)
if r.status_code == 200:
    body = r.json()
    if body.get("ok") and body.get("deleted") is True:
        ok("2c) staff JWT apaga ad de outro → 200 deleted=true (moderação)")
    else:
        fail(f"2c) staff JWT body inesperado: {body}")
    if body.get("moderated_by") == ADMIN_EMAIL:
        ok(f"2c) moderated_by={body.get('moderated_by')}")
    else:
        fail(f"2c) moderated_by esperado {ADMIN_EMAIL}, got {body.get('moderated_by')}")
    # Confirmar 404
    r2 = requests.get(f"{API}/ads/{ad2}", timeout=20)
    if r2.status_code == 404:
        ok("2c) GET após moderação → 404")
    else:
        fail(f"2c) GET após moderação esperado 404, got {r2.status_code}")
else:
    fail(f"2c) staff JWT delete → status {r.status_code} body {r.text[:200]}")

# 2d) ?hard=false → soft delete (mantém doc com active=false)
ad3 = create_pub_ad("Ad smoke 2d soft delete")
r = requests.delete(f"{API}/ads/{ad3}", params={"seller_id": PUBLISHER_ID, "hard": "false"}, timeout=20)
if r.status_code == 200:
    body = r.json()
    if body.get("ok") and body.get("deactivated") is True and body.get("deleted") is None:
        ok("2d) soft delete → ok=true deactivated=true (sem deleted)")
    else:
        fail(f"2d) body inesperado para soft delete: {body}")
    # Doc deve continuar existindo com active=false
    r2 = requests.get(f"{API}/ads/{ad3}", timeout=20)
    if r2.status_code == 200:
        adfresh = r2.json()
        if adfresh.get("active") is False:
            ok("2d) GET retorna doc com active=False")
        else:
            fail(f"2d) doc esperado active=False, got active={adfresh.get('active')}")
        ads_to_cleanup.append(ad3)  # cleanup ao final
    else:
        # Possível: list_ads filtra active=True; mas GET singleton deveria ainda existir.
        fail(f"2d) GET após soft delete deveria 200, got {r2.status_code}")
else:
    fail(f"2d) soft delete → status {r.status_code} body {r.text[:200]}")

# =====================================================================
# 3) PUT /api/ads/{ad_id}
# =====================================================================
print("\n=== 3) PUT /api/ads/{ad_id} ===")

ad4 = create_pub_ad("Ad smoke 3 - inicial")

# 3a) Dono edita
upd = {"seller_id": PUBLISHER_ID, "title": "Novo titulo dono", "price_full": 200.0}
r = requests.put(f"{API}/ads/{ad4}", json=upd, timeout=20)
if r.status_code == 200:
    body = r.json()
    if body.get("title") == "Novo titulo dono" and float(body.get("price_full", 0)) == 200.0:
        ok("3a) dono edita → title/price_full atualizados")
    else:
        fail(f"3a) atualização não aplicada: title={body.get('title')} price={body.get('price_full')}")
else:
    fail(f"3a) dono edita → status {r.status_code} body {r.text[:200]}")

# 3b) Outro membro (não dono) edita → 403
r = requests.put(f"{API}/ads/{ad4}", json={"seller_id": NONPUB_ID, "title": "hack title"}, timeout=20)
if r.status_code == 403:
    ok("3b) outro membro edita → 403")
else:
    fail(f"3b) outro membro esperado 403, got {r.status_code} body {r.text[:200]}")
# Confirmar que título não mudou
r2 = requests.get(f"{API}/ads/{ad4}", timeout=20)
if r2.status_code == 200 and r2.json().get("title") == "Novo titulo dono":
    ok("3b) título preservado após tentativa não autorizada")
else:
    fail(f"3b) título alterado indevidamente: {r2.json().get('title') if r2.status_code==200 else r2.status_code}")

# 3c) Staff JWT edita (com seller_id falso) → 200
upd2 = {"seller_id": "id_qualquer_falso", "title": "Titulo via moderador admin", "price_full": 333.33}
r = requests.put(f"{API}/ads/{ad4}", json=upd2, headers=HDR_ADMIN, timeout=20)
if r.status_code == 200:
    body = r.json()
    if body.get("title") == "Titulo via moderador admin" and float(body.get("price_full", 0)) == 333.33:
        ok("3c) staff JWT edita ad de outro membro → 200 title/price aplicados (moderação)")
    else:
        fail(f"3c) staff edição não refletida: {body}")
else:
    fail(f"3c) staff edita → status {r.status_code} body {r.text[:200]}")

# Cleanup
print("\n=== CLEANUP ===")
ads_to_cleanup.extend([ad4])
for ad_id in set(ads_to_cleanup):
    if not ad_id:
        continue
    try:
        r = requests.delete(f"{API}/ads/{ad_id}", params={"seller_id": PUBLISHER_ID}, headers=HDR_ADMIN, timeout=10)
        print(f"  cleanup {ad_id} → {r.status_code}")
    except Exception as e:
        print(f"  cleanup {ad_id} erro: {e}")

# Summary
passed = sum(1 for s, _ in results if s == "PASS")
failed = sum(1 for s, _ in results if s == "FAIL")
print(f"\n=== RESULT passed={passed} failed={failed} ===")
if failed:
    print("\nFAILED:")
    for s, m in results:
        if s == "FAIL":
            print(f"  - {m}")
sys.exit(0 if failed == 0 else 1)
