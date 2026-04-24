"""
Backend test — MARKETPLACE HIERÁRQUICO POR TIER
================================================
Validação dos 3 concerns do review:

1) GET /api/products?tier=<silver|gold|diamond>&member_id=<id>
   - RBAC hierárquico (silver<gold<diamond)
   - Filtro estrito por tier + HEALTH_CATEGORIES

2) GET /api/ads?tier=<silver|gold|diamond>
   - Filtro estrito por ad_tier; diamond inclui legacy (ad_tier ausente/None)

3) POST /api/ads com novo campo ad_tier
   - Diamond pode publicar em silver/gold/diamond
   - Não-Diamond bloqueado por _can_sell → 403
   - Omissão ou inválido → fallback p/ seller tier

Estratégia de seeding:
   - demo (mem_e5bb9b5878dd) é diamond.
   - Piu Luis (mem_0bfdc078112d) é gold → usado como gold user.
   - Mateus (mem_4f1c23b894d2) é diamond → demotamos para silver (restauramos no fim).
   - No final, TODAS as mudanças de tier são revertidas + ads criados são deletados.
"""
from __future__ import annotations
import os, sys, json, uuid
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://member-shop-2.preview.emergentagent.com"
if not BASE.endswith("/api"):
    BASE = BASE.rstrip("/") + "/api"

# ---- credentials -----------------------------------------------------------
ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_PASS  = "admin123"
DEMO_EMAIL  = "demo@blacksclub.com"
DEMO_PASS   = "novasenha123"

# members já existentes (do ambiente)
MEM_DEMO   = "mem_e5bb9b5878dd"   # diamond
MEM_GOLD   = "mem_0bfdc078112d"   # Piu Luis — gold
MEM_SILVER = "mem_4f1c23b894d2"   # Mateus — diamond originalmente; será demotado p/ silver
MEM_SILVER_ORIGINAL_TIER = "diamond"
# ----------------------------------------------------------------------------

passes, fails = [], []
created_ads: list[tuple[str, str]] = []   # (ad_id, seller_id)

def ok(label):   passes.append(label); print(f"  ✅ {label}")
def bad(label, detail=""):
    fails.append(f"{label} :: {detail}"); print(f"  ❌ {label} — {detail}")

def step(title): print(f"\n=== {title} ===")

# ---- Auth helpers ----------------------------------------------------------
def admin_token() -> str:
    r = requests.post(f"{BASE}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]

def admin_set_tier(token: str, member_id: str, plan: str):
    r = requests.put(
        f"{BASE}/admin/members/{member_id}/plan",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan": plan}, timeout=30,
    )
    r.raise_for_status()
    return r.json()

# ============================================================================
def main():
    TOKEN = admin_token()
    print(f"Admin token OK (len={len(TOKEN)})")

    # setup: Mateus → silver
    try:
        admin_set_tier(TOKEN, MEM_SILVER, "silver")
        print(f"Seeded {MEM_SILVER} → silver")
    except Exception as e:
        print(f"FATAL: could not seed silver member: {e}")
        sys.exit(1)

    try:
        _run_tests()
    finally:
        # teardown
        try:
            admin_set_tier(TOKEN, MEM_SILVER, MEM_SILVER_ORIGINAL_TIER)
            print(f"\nRestored {MEM_SILVER} → {MEM_SILVER_ORIGINAL_TIER}")
        except Exception as e:
            print(f"WARN: restore tier failed: {e}")
        for ad_id, seller in created_ads:
            try:
                requests.delete(f"{BASE}/ads/{ad_id}", params={"seller_id": seller}, timeout=15)
            except Exception:
                pass
        print(f"Cleaned {len(created_ads)} test ads")

    print("\n" + "=" * 60)
    print(f"RESULT  passed={len(passes)}  failed={len(fails)}")
    if fails:
        print("\nFAILURES:")
        for f in fails: print("  -", f)
    print("=" * 60)
    sys.exit(0 if not fails else 1)


def _run_tests():
    # =========================================================
    step("1) GET /api/products — RBAC hierárquico")
    # =========================================================

    # 1a Silver user asking tier=gold → 403
    r = requests.get(f"{BASE}/products", params={"tier": "gold", "member_id": MEM_SILVER}, timeout=30)
    if r.status_code == 403: ok("silver user asking tier=gold → 403")
    else: bad("silver user asking tier=gold → should be 403", f"got {r.status_code} body={r.text[:200]}")

    # 1b Silver user asking tier=diamond → 403
    r = requests.get(f"{BASE}/products", params={"tier": "diamond", "member_id": MEM_SILVER}, timeout=30)
    if r.status_code == 403: ok("silver user asking tier=diamond → 403")
    else: bad("silver user asking tier=diamond → should be 403", f"got {r.status_code}")

    # 1c Silver user asking tier=silver → 200
    r = requests.get(f"{BASE}/products", params={"tier": "silver", "member_id": MEM_SILVER}, timeout=30)
    if r.status_code == 200: ok("silver user asking tier=silver → 200")
    else: bad("silver user asking tier=silver", f"got {r.status_code} body={r.text[:200]}")

    # 1d Gold user asking tier=silver → 200
    r = requests.get(f"{BASE}/products", params={"tier": "silver", "member_id": MEM_GOLD}, timeout=30)
    if r.status_code == 200: ok("gold user asking tier=silver → 200")
    else: bad("gold user asking tier=silver", f"got {r.status_code} body={r.text[:200]}")

    # 1e Gold user asking tier=gold → 200
    r = requests.get(f"{BASE}/products", params={"tier": "gold", "member_id": MEM_GOLD}, timeout=30)
    if r.status_code == 200: ok("gold user asking tier=gold → 200")
    else: bad("gold user asking tier=gold", f"got {r.status_code}")

    # 1f Gold user asking tier=diamond → 403
    r = requests.get(f"{BASE}/products", params={"tier": "diamond", "member_id": MEM_GOLD}, timeout=30)
    if r.status_code == 403: ok("gold user asking tier=diamond → 403")
    else: bad("gold user asking tier=diamond → should be 403", f"got {r.status_code}")

    # 1g Diamond user asking any tier → 200
    for t in ("silver", "gold", "diamond"):
        r = requests.get(f"{BASE}/products", params={"tier": t, "member_id": MEM_DEMO}, timeout=30)
        if r.status_code == 200: ok(f"diamond user asking tier={t} → 200")
        else: bad(f"diamond user tier={t}", f"got {r.status_code}")

    # =========================================================
    step("1x) GET /api/products — Filtro ESTRITO por tier+category")
    # =========================================================
    HEALTH = {"emagrecedores", "peptideos", "landerlan", "hormonios"}

    # tier=diamond → tier=="diamond" OR category in HEALTH
    r = requests.get(f"{BASE}/products", params={"tier": "diamond", "member_id": MEM_DEMO}, timeout=30)
    items = r.json()
    bad_items = [p for p in items if (p.get("tier") != "diamond") and (p.get("category") not in HEALTH)]
    if not bad_items:
        ok(f"tier=diamond: todos os {len(items)} produtos batem (tier=='diamond' OR category∈HEALTH)")
    else:
        bad("tier=diamond filter leaked products",
            f"bad count={len(bad_items)} first={bad_items[0].get('name')} cat={bad_items[0].get('category')} tier={bad_items[0].get('tier')}")

    # tier=gold → SOMENTE tier=="gold" e category NOT in HEALTH
    r = requests.get(f"{BASE}/products", params={"tier": "gold", "member_id": MEM_DEMO}, timeout=30)
    items = r.json()
    bad_items = [p for p in items if p.get("tier") != "gold" or p.get("category") in HEALTH]
    if not bad_items:
        ok(f"tier=gold: {len(items)} produtos; todos tier=='gold' e category∉HEALTH")
    else:
        bad("tier=gold filter leaked products",
            f"bad count={len(bad_items)} first={bad_items[0].get('name')} cat={bad_items[0].get('category')} tier={bad_items[0].get('tier')}")

    # tier=silver → (tier=="silver" OR no tier field) AND category NOT in HEALTH
    r = requests.get(f"{BASE}/products", params={"tier": "silver", "member_id": MEM_DEMO}, timeout=30)
    items = r.json()
    bad_items = []
    for p in items:
        t = p.get("tier")
        cat = p.get("category")
        tier_ok = (t in (None, "silver"))
        cat_ok = cat not in HEALTH
        if not (tier_ok and cat_ok):
            bad_items.append(p)
    if not bad_items:
        ok(f"tier=silver: {len(items)} produtos; todos (tier in [None,'silver']) AND category∉HEALTH")
    else:
        bad("tier=silver filter leaked products",
            f"bad count={len(bad_items)} first={bad_items[0].get('name')} cat={bad_items[0].get('category')} tier={bad_items[0].get('tier')}")

    # Regressão: sem tier ainda funciona
    r = requests.get(f"{BASE}/products", params={"member_id": MEM_DEMO}, timeout=30)
    if r.status_code == 200 and isinstance(r.json(), list) and len(r.json()) > 0:
        ok(f"sem tier — regressão OK, {len(r.json())} produtos devolvidos")
    else:
        bad("regressão sem tier", f"status={r.status_code} len={len(r.json()) if r.status_code==200 else 'n/a'}")

    # =========================================================
    step("2) GET /api/ads — Filtro por ad_tier")
    # =========================================================
    # estado inicial: todos legacy (ad_tier=None)
    r = requests.get(f"{BASE}/ads", timeout=30)
    all_ads = r.json()
    total_initial = len(all_ads)
    print(f"    (total de ads ativos atualmente: {total_initial})")

    # sem tier → todos
    r = requests.get(f"{BASE}/ads", timeout=30)
    if r.status_code == 200 and len(r.json()) == total_initial:
        ok(f"sem tier → {total_initial} ads (todos)")
    else:
        bad("GET /ads sem tier", f"status={r.status_code} count={len(r.json())}")

    # tier=diamond → deve incluir TODOS os legacy (ad_tier ausente/None) + qualquer ad_tier=='diamond'
    r = requests.get(f"{BASE}/ads", params={"tier": "diamond"}, timeout=30)
    dia = r.json() if r.status_code == 200 else []
    dia_bad = [a for a in dia if not (a.get("ad_tier") in (None, "diamond"))]
    if r.status_code == 200 and not dia_bad:
        ok(f"tier=diamond: {len(dia)} ads, todos com ad_tier∈(None,'diamond')")
    else:
        bad("tier=diamond ads filter", f"status={r.status_code} bad_count={len(dia_bad)}")

    # tier=gold → ONLY ad_tier=='gold' (0 até criarmos um)
    r = requests.get(f"{BASE}/ads", params={"tier": "gold"}, timeout=30)
    gold_ads_before = r.json() if r.status_code == 200 else []
    non_gold = [a for a in gold_ads_before if a.get("ad_tier") != "gold"]
    if r.status_code == 200 and not non_gold:
        ok(f"tier=gold (antes de seed): {len(gold_ads_before)} ads, todos ad_tier=='gold'")
    else:
        bad("tier=gold filter", f"status={r.status_code} non_gold={len(non_gold)}")

    # tier=silver → ONLY ad_tier=='silver'
    r = requests.get(f"{BASE}/ads", params={"tier": "silver"}, timeout=30)
    silver_ads_before = r.json() if r.status_code == 200 else []
    non_silver = [a for a in silver_ads_before if a.get("ad_tier") != "silver"]
    if r.status_code == 200 and not non_silver:
        ok(f"tier=silver (antes de seed): {len(silver_ads_before)} ads, todos ad_tier=='silver'")
    else:
        bad("tier=silver filter", f"status={r.status_code} non_silver={len(non_silver)}")

    # =========================================================
    step("3) POST /api/ads — campo ad_tier")
    # =========================================================

    def create_ad(seller_id: str, ad_tier: str | None, suffix: str) -> tuple[int, dict]:
        body = {
            "seller_id": seller_id,
            "title": f"[TEST-TIER] {suffix} {uuid.uuid4().hex[:6]}",
            "description": "Produto de teste (apagar)",
            "price_full": 100.0,
            "category": "suplementos",
            "images": [],
            "stock": 1,
        }
        if ad_tier is not None:
            body["ad_tier"] = ad_tier
        r = requests.post(f"{BASE}/ads", json=body, timeout=30)
        try:
            data = r.json()
        except Exception:
            data = {"raw": r.text}
        return r.status_code, data

    # 3a Diamond member → ad_tier="silver"
    code, data = create_ad(MEM_DEMO, "silver", "silver_by_diamond")
    if code == 200 and data.get("ad_tier") == "silver":
        ok("diamond cria ad com ad_tier='silver' → salvo como silver")
        created_ads.append((data["ad_id"], MEM_DEMO))
        ad_silver_id = data["ad_id"]
    else:
        bad("diamond cria silver ad", f"status={code} ad_tier={data.get('ad_tier')} body={str(data)[:200]}")
        ad_silver_id = None

    # 3b Diamond member → ad_tier="gold"
    code, data = create_ad(MEM_DEMO, "gold", "gold_by_diamond")
    if code == 200 and data.get("ad_tier") == "gold":
        ok("diamond cria ad com ad_tier='gold' → salvo como gold")
        created_ads.append((data["ad_id"], MEM_DEMO))
        ad_gold_id = data["ad_id"]
    else:
        bad("diamond cria gold ad", f"status={code} ad_tier={data.get('ad_tier')}")
        ad_gold_id = None

    # 3c Diamond member → ad_tier="diamond"
    code, data = create_ad(MEM_DEMO, "diamond", "diamond_by_diamond")
    if code == 200 and data.get("ad_tier") == "diamond":
        ok("diamond cria ad com ad_tier='diamond' → salvo como diamond")
        created_ads.append((data["ad_id"], MEM_DEMO))
    else:
        bad("diamond cria diamond ad", f"status={code} ad_tier={data.get('ad_tier')}")

    # 3d Diamond member → ad_tier omitido → fallback p/ seller tier (diamond)
    code, data = create_ad(MEM_DEMO, None, "omitted_by_diamond")
    if code == 200 and data.get("ad_tier") == "diamond":
        ok("diamond sem ad_tier → salvo como 'diamond' (seller tier)")
        created_ads.append((data["ad_id"], MEM_DEMO))
    else:
        bad("diamond omit ad_tier", f"status={code} ad_tier={data.get('ad_tier')}")

    # 3e Diamond member → ad_tier inválido ('bronze') → fallback p/ seller tier (diamond)
    code, data = create_ad(MEM_DEMO, "bronze", "bronze_invalid_by_diamond")
    if code == 200 and data.get("ad_tier") == "diamond":
        ok("diamond com ad_tier='bronze' inválido → salvo como 'diamond' (fallback)")
        created_ads.append((data["ad_id"], MEM_DEMO))
    else:
        bad("diamond invalid ad_tier=bronze", f"status={code} ad_tier={data.get('ad_tier')}")

    # 3f Non-Diamond (gold member Piu Luis) → 403 pelo _can_sell
    code, data = create_ad(MEM_GOLD, "gold", "ad_by_gold_blocked")
    if code == 403:
        ok("gold member (can_sell=False) → POST /ads → 403")
    else:
        bad("gold member should be blocked", f"status={code} body={str(data)[:200]}")
        if code == 200 and isinstance(data, dict) and data.get("ad_id"):
            created_ads.append((data["ad_id"], MEM_GOLD))

    # 3g Non-Diamond (silver member Mateus) → 403
    code, data = create_ad(MEM_SILVER, "silver", "ad_by_silver_blocked")
    if code == 403:
        ok("silver member (can_sell=False) → POST /ads → 403")
    else:
        bad("silver member should be blocked", f"status={code} body={str(data)[:200]}")
        if code == 200 and isinstance(data, dict) and data.get("ad_id"):
            created_ads.append((data["ad_id"], MEM_SILVER))

    # =========================================================
    step("2x) Re-check GET /api/ads?tier=... agora que existem ads gold/silver")
    # =========================================================
    r = requests.get(f"{BASE}/ads", params={"tier": "gold"}, timeout=30)
    gold_ads = r.json() if r.status_code == 200 else []
    non_gold = [a for a in gold_ads if a.get("ad_tier") != "gold"]
    has_my_gold = (ad_gold_id is not None) and any(a.get("ad_id") == ad_gold_id for a in gold_ads)
    if r.status_code == 200 and not non_gold and (has_my_gold or ad_gold_id is None):
        ok(f"tier=gold (após seed): {len(gold_ads)} ads; novo gold ad presente={has_my_gold}")
    else:
        bad("tier=gold post-seed", f"non_gold={len(non_gold)} has_my_gold={has_my_gold}")

    r = requests.get(f"{BASE}/ads", params={"tier": "silver"}, timeout=30)
    silver_ads = r.json() if r.status_code == 200 else []
    non_silver = [a for a in silver_ads if a.get("ad_tier") != "silver"]
    has_my_silver = (ad_silver_id is not None) and any(a.get("ad_id") == ad_silver_id for a in silver_ads)
    if r.status_code == 200 and not non_silver and (has_my_silver or ad_silver_id is None):
        ok(f"tier=silver (após seed): {len(silver_ads)} ads; novo silver ad presente={has_my_silver}")
    else:
        bad("tier=silver post-seed", f"non_silver={len(non_silver)} has_my_silver={has_my_silver}")

    # tier=diamond ainda inclui legacy ads (ad_tier=None) e não os gold/silver recém criados
    r = requests.get(f"{BASE}/ads", params={"tier": "diamond"}, timeout=30)
    dia_ads = r.json() if r.status_code == 200 else []
    leaked = [a for a in dia_ads if a.get("ad_tier") in ("gold", "silver")]
    if r.status_code == 200 and not leaked:
        ok(f"tier=diamond não vaza ad_tier gold/silver ({len(dia_ads)} ads ok)")
    else:
        bad("tier=diamond leak", f"leaked={len(leaked)} first={leaked[0] if leaked else None}")


if __name__ == "__main__":
    main()
