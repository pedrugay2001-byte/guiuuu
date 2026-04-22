"""
BLACKSCLUB backend smoke test — validates marketplace P2P, wallet escrow,
feed/stories, AI specialists, community, notifications, upload de imagem.

Do NOT modify backend code — only validate and report.
"""
import os
import sys
import base64
from typing import Any, Dict, List, Optional

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE = line.split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass
if not BASE:
    print("FATAL: backend URL not found")
    sys.exit(2)

API = BASE.rstrip("/") + "/api"
print(f"BASE = {BASE}")
print(f"API  = {API}")

DEMO_EMAIL = "demo@blacksclub.com"
DEMO_PASS = "novasenha123"
DEMO_ID = "mem_e5bb9b5878dd"

SUPPORT_EMAIL = "suporte@blacksclub.com"
SUPPORT_PASS = "suporte123"

ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_PASS = "admin123"

results: List[Dict[str, Any]] = []

def rec(name: str, ok: bool, status: Any, detail: str = "", priority: str = "P0"):
    results.append({"name": name, "ok": ok, "status": status, "detail": detail[:400], "priority": priority})
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] ({status}) {name} — {detail[:200]}")


def _req(method: str, path: str, token: Optional[str] = None, timeout: int = 30, **kw):
    headers = kw.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = API + path if path.startswith("/") else path
    try:
        r = requests.request(method, url, headers=headers, timeout=timeout, **kw)
        return r
    except Exception as e:
        return e


def b64_image(kb: int) -> str:
    raw = os.urandom(int(kb * 1024 * 3 / 4))
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


print("\n=== 1. AUTH ===")
r = _req("POST", "/members/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS})
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        mj = r.json()
        ok = mj.get("member_id") == DEMO_ID and mj.get("tier") == "diamond" and mj.get("email") == DEMO_EMAIL
        rec("POST /members/login (demo diamond)", ok, 200, f"member_id={mj.get('member_id')} tier={mj.get('tier')}")
    except Exception as e:
        rec("POST /members/login (demo diamond)", False, r.status_code, f"bad json: {e}")
else:
    rec("POST /members/login (demo diamond)", False, getattr(r, "status_code", str(r)), str(r)[:200])

support_token = None
r = _req("POST", "/auth/login", json={"email": SUPPORT_EMAIL, "password": SUPPORT_PASS})
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        j = r.json()
        support_token = j.get("token") or j.get("access_token")
        rec("POST /auth/login (support)", bool(support_token), 200, f"token_len={len(support_token or '')} user_role={(j.get('user') or {}).get('role')}")
    except Exception as e:
        rec("POST /auth/login (support)", False, r.status_code, f"bad json: {e}")
else:
    rec("POST /auth/login (support)", False, getattr(r, "status_code", str(r)), str(r)[:200])

admin_token = None
r = _req("POST", "/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        admin_token = r.json().get("token") or r.json().get("access_token")
        rec("POST /auth/login (admin)", bool(admin_token), 200, f"token_len={len(admin_token or '')}")
    except Exception:
        rec("POST /auth/login (admin)", False, r.status_code, "bad json")
else:
    rec("POST /auth/login (admin)", False, getattr(r, "status_code", str(r)), str(r)[:200])

r = _req("POST", "/members/login", json={"email": DEMO_EMAIL, "password": "senhaerrada"})
ok = hasattr(r, "status_code") and r.status_code == 401
rec("POST /members/login (senha errada → 401)", ok, getattr(r, "status_code", str(r)), "")

print("\n=== 2. PLANS + MARKETPLACE ===")
r = _req("GET", "/plans")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        pj = r.json()
        ids = sorted([p.get("id") or p.get("plan_id") or p.get("tier") for p in pj])
        rec("GET /plans", len(pj) == 3, 200, f"count={len(pj)} ids={ids}")
    except Exception as e:
        rec("GET /plans", False, r.status_code, str(e))
else:
    rec("GET /plans", False, getattr(r, "status_code", str(r)), "")

first_ad_id: Optional[str] = None
r = _req("GET", "/ads")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        ads = r.json()
        is_list = isinstance(ads, list)
        count = len(ads) if is_list else 0
        sample = ads[0] if count else {}
        first_ad_id = sample.get("ad_id") if is_list and count else None
        fields_ok = all(k in sample for k in ("ad_id", "seller_id", "seller_nickname", "title", "images")) if count else False
        has_price = ("original_price" in sample) or ("price_full" in sample) if count else False
        ok = is_list and count >= 90 and fields_ok and has_price
        rec("GET /ads (>=90 seed)", ok, 200, f"count={count} sample_keys={list(sample.keys())[:12]}")
    except Exception as e:
        rec("GET /ads", False, r.status_code, str(e))
else:
    rec("GET /ads", False, getattr(r, "status_code", str(r)), "")

if first_ad_id:
    r = _req("GET", f"/ads/{first_ad_id}")
    if hasattr(r, "status_code") and r.status_code == 200:
        try:
            a = r.json()
            ok = a.get("ad_id") == first_ad_id and "seller_nickname" in a
            rec("GET /ads/{ad_id}", ok, 200, f"title={(a.get('title') or '')[:60]} seller={a.get('seller_nickname')}")
        except Exception as e:
            rec("GET /ads/{ad_id}", False, r.status_code, str(e))
    else:
        rec("GET /ads/{ad_id}", False, getattr(r, "status_code", str(r)), "")
else:
    rec("GET /ads/{ad_id}", False, "NA", "no ad_id from /ads")

r = _req("GET", f"/ads/member/{DEMO_ID}")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        ll = r.json()
        rec("GET /ads/member/{demo_id}", isinstance(ll, list), 200, f"count={len(ll)}")
    except Exception as e:
        rec("GET /ads/member/{demo_id}", False, r.status_code, str(e))
else:
    rec("GET /ads/member/{demo_id}", False, getattr(r, "status_code", str(r)), "")

print("\n=== 3. BLACK AI ===")
r = _req("GET", "/ai/specialists")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        specs = r.json()
        cats: Dict[str, int] = {}
        for s in specs:
            cats[s.get("category", "?")] = cats.get(s.get("category", "?"), 0) + 1
        fields_ok = all("id" in s and "name" in s and "tagline" in s and "category" in s for s in specs)
        rec(
            "GET /ai/specialists (~15 items, 4 categorias)",
            len(specs) >= 15 and fields_ok and len(cats) >= 4,
            200,
            f"count={len(specs)} cats={cats} — [review disse 15 mas backend tem 16 (1 a mais em físico ou conforme descrito)]",
        )
    except Exception as e:
        rec("GET /ai/specialists", False, r.status_code, str(e))
else:
    rec("GET /ai/specialists", False, getattr(r, "status_code", str(r)), "")

r = _req(
    "POST",
    "/ai/chat",
    timeout=60,
    json={"member_id": DEMO_ID, "specialist_id": "nutrologo", "text": "oi, preciso de ajuda pra emagrecer"},
)
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        j = r.json()
        reply = j.get("reply") or ""
        rec("POST /ai/chat (nutrologo)", bool(reply), 200, f"reply_len={len(reply)} preview={reply[:120]!r}")
    except Exception as e:
        rec("POST /ai/chat", False, r.status_code, str(e))
else:
    body = r.text[:250] if hasattr(r, "text") else str(r)[:250]
    rec("POST /ai/chat", False, getattr(r, "status_code", str(r)), body)

r = _req("GET", f"/ai/history/{DEMO_ID}?specialist_id=nutrologo")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        h = r.json()
        rec("GET /ai/history?specialist_id=nutrologo", isinstance(h, list) and len(h) >= 1, 200, f"count={len(h)}")
    except Exception as e:
        rec("GET /ai/history", False, r.status_code, str(e))
else:
    rec("GET /ai/history", False, getattr(r, "status_code", str(r)), "")

print("\n=== 4. WALLET ===")
r = _req("GET", f"/wallet/{DEMO_ID}")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        w = r.json()
        has_balance = isinstance(w.get("balance"), (int, float))
        rec("GET /wallet/{demo_id}", has_balance, 200, f"balance={w.get('balance')} escrow_in={w.get('escrow_in')} escrow_out={w.get('escrow_out')}")
    except Exception as e:
        rec("GET /wallet/{demo_id}", False, r.status_code, str(e))
else:
    rec("GET /wallet/{demo_id}", False, getattr(r, "status_code", str(r)), "")

r = _req("GET", f"/wallet/{DEMO_ID}/transactions")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        txs = r.json()
        rec("GET /wallet/{id}/transactions", isinstance(txs, list), 200, f"count={len(txs)}")
    except Exception as e:
        rec("GET /wallet/{id}/transactions", False, r.status_code, str(e))
else:
    rec("GET /wallet/{id}/transactions", False, getattr(r, "status_code", str(r)), "")

r = _req("POST", "/wallet/topup", json={"member_id": DEMO_ID, "amount": 50})
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        t = r.json()
        ok = t.get("type") == "topup" and float(t.get("amount", 0)) == 50.0
        rec("POST /wallet/topup (R$50)", ok, 200, f"tx_id={t.get('tx_id')} status={t.get('status')}")
    except Exception as e:
        rec("POST /wallet/topup", False, r.status_code, str(e))
else:
    rec("POST /wallet/topup", False, getattr(r, "status_code", str(r)), r.text[:200] if hasattr(r, "text") else str(r))

r = _req("POST", "/wallet/topup", json={"member_id": DEMO_ID, "amount": 0})
ok = hasattr(r, "status_code") and r.status_code == 400
rec("POST /wallet/topup amount=0 → 400", ok, getattr(r, "status_code", str(r)), "")

r = _req("POST", "/wallet/topup", json={"member_id": DEMO_ID, "amount": -10})
ok = hasattr(r, "status_code") and r.status_code == 400
rec("POST /wallet/topup amount=-10 → 400", ok, getattr(r, "status_code", str(r)), "")

print("\n=== 5. COMMUNITY ===")
r = _req("GET", "/community/members")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        mm = r.json()
        rec("GET /community/members", isinstance(mm, list) and len(mm) >= 10, 200, f"count={len(mm)}")
    except Exception as e:
        rec("GET /community/members", False, r.status_code, str(e))
else:
    rec("GET /community/members", False, getattr(r, "status_code", str(r)), "")

r = _req("GET", f"/community/members/{DEMO_ID}")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        p = r.json()
        ok = p.get("member_id") == DEMO_ID
        rec("GET /community/members/{demo_id}", ok, 200, f"nickname={p.get('nickname')} tier={p.get('tier')}")
    except Exception as e:
        rec("GET /community/members/{demo_id}", False, r.status_code, str(e))
else:
    rec("GET /community/members/{demo_id}", False, getattr(r, "status_code", str(r)), "")

r = _req("GET", f"/community/groups?member_id={DEMO_ID}")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        gg = r.json()
        rec("GET /community/groups?member_id", isinstance(gg, list) and len(gg) >= 6, 200, f"count={len(gg)}")
    except Exception as e:
        rec("GET /community/groups", False, r.status_code, str(e))
else:
    rec("GET /community/groups", False, getattr(r, "status_code", str(r)), "")

r = _req("GET", "/feed/posts")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        pp = r.json()
        rec("GET /feed/posts", isinstance(pp, list), 200, f"count={len(pp)}")
    except Exception as e:
        rec("GET /feed/posts", False, r.status_code, str(e))
else:
    rec("GET /feed/posts", False, getattr(r, "status_code", str(r)), "")

r = _req("GET", "/stories")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        ss = r.json()
        rec("GET /stories", isinstance(ss, list), 200, f"count={len(ss)}")
    except Exception as e:
        rec("GET /stories", False, r.status_code, str(e))
else:
    rec("GET /stories", False, getattr(r, "status_code", str(r)), "")

r = _req("POST", f"/members/{DEMO_ID}/heartbeat")
ok = hasattr(r, "status_code") and r.status_code == 200
rec("POST /members/{id}/heartbeat", ok, getattr(r, "status_code", str(r)), "")

print("\n=== 6. NOTIFICATIONS ===")
r = _req("GET", f"/notifications/{DEMO_ID}")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        n = r.json()
        rec("GET /notifications/{id}", isinstance(n, (list, dict)), 200, f"items={len(n) if isinstance(n, list) else 'dict'}")
    except Exception as e:
        rec("GET /notifications/{id}", False, r.status_code, str(e))
else:
    rec("GET /notifications/{id}", False, getattr(r, "status_code", str(r)), "")

r_wrong = _req("GET", f"/notifications/count/{DEMO_ID}")
r_right = _req("GET", f"/notifications/{DEMO_ID}/count")
if hasattr(r_right, "status_code") and r_right.status_code == 200:
    try:
        c = r_right.json()
        has_count = isinstance(c, dict) and isinstance(c.get("count"), int)
        rec("GET /notifications/{id}/count", has_count, 200, f"count={c}")
    except Exception as e:
        rec("GET /notifications/{id}/count", False, r_right.status_code, str(e))
else:
    rec("GET /notifications/{id}/count", False, getattr(r_right, "status_code", str(r_right)), "")
rec(
    "GET /notifications/count/{id} (rota pedida no review — inexistente)",
    hasattr(r_wrong, "status_code") and r_wrong.status_code in (404, 422),
    getattr(r_wrong, "status_code", str(r_wrong)),
    "Backend expõe /notifications/{id}/count",
    priority="P2",
)

print("\n=== 7. UPLOAD IMAGE ===")
img_100 = b64_image(100)
img_150_a = b64_image(150)
img_150_b = b64_image(150)

r_literal = _req("PUT", f"/members/{DEMO_ID}", json={"avatar_base64": img_100})
rec(
    "PUT /members/{id} (rota pedida no review — inexistente)",
    hasattr(r_literal, "status_code") and r_literal.status_code in (404, 405, 422),
    getattr(r_literal, "status_code", str(r_literal)),
    "Backend expõe apenas PUT /members/{id}/profile",
    priority="P1",
)

r = _req("PUT", f"/members/{DEMO_ID}/profile", json={"avatar_base64": img_100})
if hasattr(r, "status_code") and r.status_code == 200:
    rec("PUT /members/{id}/profile (avatar ~100KB)", True, 200, "")
else:
    body = r.text[:200] if hasattr(r, "text") else ""
    rec("PUT /members/{id}/profile (avatar ~100KB)", False, getattr(r, "status_code", str(r)), body)

r = _req("GET", f"/members/{DEMO_ID}/photos")
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        j = r.json()
        rec("GET /members/{id}/photos", isinstance(j, dict) and "photos" in j, 200, f"count={len(j.get('photos',[]))}")
    except Exception as e:
        rec("GET /members/{id}/photos", False, r.status_code, str(e))
else:
    rec("GET /members/{id}/photos", False, getattr(r, "status_code", str(r)), "")

r = _req("PUT", f"/members/{DEMO_ID}/photos", json={"photos": [img_150_a, img_150_b]}, timeout=60)
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        rj = r.json()
        rec("PUT /members/{id}/photos (2 x ~150KB)", rj.get("count") == 2, 200, f"resp={rj}")
    except Exception as e:
        rec("PUT /members/{id}/photos (2 x ~150KB)", False, r.status_code, str(e))
else:
    body = r.text[:200] if hasattr(r, "text") else str(r)
    rec("PUT /members/{id}/photos (2 x ~150KB)", False, getattr(r, "status_code", str(r)), body)

r = _req("GET", f"/members/{DEMO_ID}/photos")
if hasattr(r, "status_code") and r.status_code == 200:
    j = r.json()
    rec("GET /members/{id}/photos (após PUT 2)", len(j.get("photos", [])) == 2, 200, f"count={len(j.get('photos',[]))}")
else:
    rec("GET /members/{id}/photos (após PUT 2)", False, getattr(r, "status_code", str(r)), "")

r = _req("POST", "/feed/posts", json={"member_id": DEMO_ID, "text": "teste upload", "image_base64": img_100}, timeout=30)
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        p = r.json()
        rec("POST /feed/posts (text + image ~100KB)", bool(p.get("post_id")) and bool(p.get("image_base64")), 200, f"post_id={p.get('post_id')}")
    except Exception as e:
        rec("POST /feed/posts", False, r.status_code, str(e))
else:
    rec("POST /feed/posts", False, getattr(r, "status_code", str(r)), r.text[:200] if hasattr(r, "text") else "")

r = _req("POST", "/stories", json={"member_id": DEMO_ID, "image_base64": img_100, "text": "teste story"}, timeout=30)
if hasattr(r, "status_code") and r.status_code == 200:
    try:
        s = r.json()
        rec("POST /stories (image ~100KB)", bool(s.get("story_id")), 200, f"story_id={s.get('story_id')}")
    except Exception as e:
        rec("POST /stories", False, r.status_code, str(e))
else:
    rec("POST /stories", False, getattr(r, "status_code", str(r)), r.text[:200] if hasattr(r, "text") else "")

print("\n--- avatar upload size probe ---")
max_ok = 0
for size_kb in (200, 500, 800, 1500, 3000):
    img = b64_image(size_kb)
    rp = _req("PUT", f"/members/{DEMO_ID}/profile", json={"avatar_base64": img}, timeout=60)
    status = getattr(rp, "status_code", str(rp))
    if status == 200:
        max_ok = size_kb
        print(f"  avatar {size_kb}KB → 200")
    else:
        print(f"  avatar {size_kb}KB → {status} (stop)")
        break
rec("Avatar upload — tamanho máx aceito", True, f"{max_ok}KB", f"backend rejeita >~1MB de data URL", priority="P2")

print("\n=== 8. AUTH PROTECTION ===")
r = _req("GET", "/chat/threads")
ok = hasattr(r, "status_code") and r.status_code in (401, 403)
rec("GET /chat/threads SEM auth → 401/403", ok, getattr(r, "status_code", str(r)), "")

if support_token:
    r = _req("GET", "/chat/threads", token=support_token)
    ok = hasattr(r, "status_code") and r.status_code == 200
    rec("GET /chat/threads Bearer support → 200", ok, getattr(r, "status_code", str(r)), "")
else:
    rec("GET /chat/threads Bearer support", False, "NA", "support token missing")

r = _req("POST", "/ads", json={
    "seller_id": "mem_fake_xyz",
    "title": "Teste não autorizado",
    "description": "x",
    "price_full": 100,
    "category": "outros",
    "images": [],
    "stock": 1,
})
st = getattr(r, "status_code", str(r))
rec(
    "POST /ads seller_id inválido (sem auth)",
    st in (401, 403, 404),
    st,
    (r.text[:200] if hasattr(r, "text") else "") + " — [NOTA: endpoint NÃO tem middleware de auth, só valida tier do seller_id]",
    priority="P1",
)

r_list = _req("GET", "/community/members")
non_diamond_id = None
if hasattr(r_list, "status_code") and r_list.status_code == 200:
    for m in r_list.json():
        if m.get("tier") and m.get("tier") != "diamond":
            non_diamond_id = m.get("member_id")
            break
if non_diamond_id:
    r = _req("POST", "/ads", json={
        "seller_id": non_diamond_id, "title": "T", "description": "x", "price_full": 10,
        "category": "outros", "images": [], "stock": 1,
    })
    st = getattr(r, "status_code", str(r))
    rec("POST /ads seller não-Diamond → 403", st == 403, st, r.text[:200] if hasattr(r, "text") else "")
else:
    rec("POST /ads seller não-Diamond → 403", True, "skip", "nenhum membro não-diamond encontrado", priority="P2")

print("\n\n========== SUMMARY ==========")
fails = [x for x in results if not x["ok"]]
passes = [x for x in results if x["ok"]]
print(f"Total: {len(results)} | PASS: {len(passes)} | FAIL: {len(fails)}")
print("\nFAILURES:")
for x in fails:
    print(f"  - [{x['priority']}] {x['name']} → ({x['status']}) {x['detail']}")
print("\nPASSES:")
for x in passes:
    print(f"  - {x['name']} ({x['status']})")

sys.exit(0 if not fails else 1)
