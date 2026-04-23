"""
BLACKSCLUB — Rodada 2: testes dos endpoints NOVOS.

Foco:
  1) GET  /api/blx/orders/{member_id}?role=
  2) POST /api/blx/ratings  (e cenários negativos)
  3) GET  /api/blx/ratings/seller/{seller_id}
  4) POST /api/ai/transcribe  (apenas validações de entrada)
  5) GET  /api/notifications/{member_id}  (inclui transferências)
  6) GET  /api/notifications/{member_id}/count  (inclui topup/transfer)
  7) Regressão rápida dos endpoints aprovados anteriormente.

Credenciais e IDs (produção):
  Luiz:  mem_7a9d652945e7 (admin, BLX-JCM5T48X)
  Demo:  mem_e5bb9b5878dd (BLX-QPYUEZWY)
  Staff: admin@farmaclube.com / admin123

Backend público: EXPO_PUBLIC_BACKEND_URL
"""
import os
import json
import base64
import time
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://member-shop-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

MEMBER_LUIZ = "mem_7a9d652945e7"
MEMBER_DEMO = "mem_e5bb9b5878dd"
ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_PASSWORD = "admin123"

PASS, FAIL = [], []


def log_pass(name, detail=""):
    PASS.append(name)
    print(f"PASS  {name}  {detail}")


def log_fail(name, detail=""):
    FAIL.append((name, detail))
    print(f"FAIL  {name}  {detail}")


def jprint(obj):
    try:
        return json.dumps(obj, indent=2, default=str, ensure_ascii=False)
    except Exception:
        return str(obj)


def http(method, path, **kw):
    url = f"{API}{path}"
    return requests.request(method, url, timeout=30, **kw)


# ----------------------------------------------------------------------
# Pré-requisito: criar uma escrow tx settled para cobrir os testes de rating
# ----------------------------------------------------------------------

def setup_settled_tx():
    """Demo (mem_e5bb9b5878dd) compra o anúncio 'Grill' de Luiz (mem_7a9d652945e7) e confirma.
    Retorna tx_id para ratings tests; ou None se algo falhar.
    """
    # Find Luiz's ad
    r = http("GET", f"/ads/member/{MEMBER_LUIZ}")
    if r.status_code != 200:
        log_fail("setup_find_luiz_ad", f"{r.status_code} {r.text[:200]}")
        return None
    ads = r.json()
    if not ads:
        log_fail("setup_find_luiz_ad", "Luiz has no ads")
        return None
    ad = ads[0]
    ad_id = ad["ad_id"]

    # Check demo balance
    w = http("GET", f"/blx/wallet/{MEMBER_DEMO}").json()
    price = float(ad["price_full"])
    # Diamond discount 30%
    final = price * 0.7
    if w["balance_blx"] < final:
        log_fail("setup_balance", f"demo balance {w['balance_blx']} < needed {final}")
        return None

    # Purchase (creates escrow tx)
    r = http("POST", "/wallet/purchase", json={"ad_id": ad_id, "buyer_id": MEMBER_DEMO, "qty": 1})
    if r.status_code != 200:
        log_fail("setup_purchase", f"{r.status_code} {r.text[:300]}")
        return None
    tx = r.json()
    tx_id = tx.get("tx_id")
    if not tx_id or tx.get("status") != "escrow" or tx.get("type") != "escrow":
        log_fail("setup_purchase_shape", jprint(tx))
        return None

    # Confirm (buyer releases) -> settled
    r = http("POST", f"/wallet/confirm/{tx_id}", json={"buyer_id": MEMBER_DEMO})
    if r.status_code != 200:
        log_fail("setup_confirm", f"{r.status_code} {r.text[:300]}")
        return None
    log_pass("setup_settled_tx", f"tx_id={tx_id} ad={ad.get('title')} price_final={final:.2f}")
    return tx_id


# ----------------------------------------------------------------------
# 1) GET /api/blx/orders/{member_id}?role=
# ----------------------------------------------------------------------

def test_orders_role_all(member_id, label):
    r = http("GET", f"/blx/orders/{member_id}?role=all")
    if r.status_code != 200:
        log_fail(f"orders_all_{label}", f"{r.status_code} {r.text[:200]}")
        return None
    arr = r.json()
    if not isinstance(arr, list):
        log_fail(f"orders_all_{label}_is_list", str(type(arr)))
        return None
    log_pass(f"orders_all_{label}", f"count={len(arr)}")
    return arr


def test_orders_empty_member():
    """Member_id inexistente → lista vazia."""
    fake = f"mem_empty_{int(time.time())}"
    r = http("GET", f"/blx/orders/{fake}?role=all")
    if r.status_code != 200:
        log_fail("orders_empty", f"{r.status_code} {r.text[:200]}")
        return
    arr = r.json()
    if not isinstance(arr, list) or len(arr) != 0:
        log_fail("orders_empty", f"expected [], got {len(arr) if isinstance(arr, list) else arr}")
        return
    log_pass("orders_empty", "empty list OK")


def test_orders_buyer_vs_seller(tx_id):
    """Demo deve aparecer como buyer. Luiz como seller."""
    # As buyer
    r = http("GET", f"/blx/orders/{MEMBER_DEMO}?role=buyer")
    if r.status_code != 200:
        log_fail("orders_buyer_demo_status", f"{r.status_code} {r.text[:200]}")
        return
    arr = r.json()
    found = [t for t in arr if t.get("tx_id") == tx_id]
    if not found:
        log_fail("orders_buyer_demo_has_tx", f"tx_id {tx_id} not in demo's buyer list (count={len(arr)})")
        return
    tx = found[0]
    required = {"tx_id", "type", "status", "amount_centavos", "ad_title",
                "counterpart", "i_am_buyer", "i_am_seller", "i_rated"}
    missing = required - set(tx.keys())
    if missing:
        log_fail("orders_buyer_demo_fields", f"missing={missing} body={jprint(tx)}")
        return
    if tx["type"] != "escrow":
        log_fail("orders_buyer_demo_type", tx["type"])
        return
    if not tx["i_am_buyer"] or tx["i_am_seller"]:
        log_fail("orders_buyer_demo_flags", f"i_am_buyer={tx['i_am_buyer']} i_am_seller={tx['i_am_seller']}")
        return
    cp = tx.get("counterpart") or {}
    if cp.get("member_id") != MEMBER_LUIZ:
        log_fail("orders_buyer_demo_counterpart", jprint(cp))
        return
    if not cp.get("name"):
        log_fail("orders_buyer_demo_counterpart_name", jprint(cp))
        return
    if not isinstance(tx["amount_centavos"], int):
        log_fail("orders_buyer_demo_amount_int", str(type(tx["amount_centavos"])))
        return
    log_pass("orders_buyer_demo",
             f"tx_id={tx_id} cp={cp.get('name')} tier={cp.get('tier')} amt_cents={tx['amount_centavos']} i_rated={tx['i_rated']}")

    # role=seller should NOT show demo as seller for this tx (demo was buyer)
    r2 = http("GET", f"/blx/orders/{MEMBER_DEMO}?role=seller")
    if r2.status_code != 200:
        log_fail("orders_seller_demo_status", f"{r2.status_code}")
        return
    arr_s = r2.json()
    if any(t.get("tx_id") == tx_id for t in arr_s):
        log_fail("orders_seller_demo_filter", f"tx_id {tx_id} should NOT appear in demo seller list")
        return
    log_pass("orders_seller_demo_filter", f"buyer-tx NOT in seller list (count={len(arr_s)})")

    # Luiz as seller should have the tx
    r3 = http("GET", f"/blx/orders/{MEMBER_LUIZ}?role=seller")
    if r3.status_code != 200:
        log_fail("orders_seller_luiz_status", f"{r3.status_code}")
        return
    arr_l = r3.json()
    hit = [t for t in arr_l if t.get("tx_id") == tx_id]
    if not hit:
        log_fail("orders_seller_luiz_has_tx", f"tx_id {tx_id} not in Luiz's seller list (count={len(arr_l)})")
        return
    t = hit[0]
    if not t.get("i_am_seller") or t.get("i_am_buyer"):
        log_fail("orders_seller_luiz_flags", f"i_am_seller={t.get('i_am_seller')} i_am_buyer={t.get('i_am_buyer')}")
        return
    cp_l = t.get("counterpart") or {}
    if cp_l.get("member_id") != MEMBER_DEMO:
        log_fail("orders_seller_luiz_counterpart", jprint(cp_l))
        return
    log_pass("orders_seller_luiz", f"tx_id={tx_id} cp={cp_l.get('name')}")


# ----------------------------------------------------------------------
# 2) POST /api/blx/ratings
# ----------------------------------------------------------------------

def test_ratings_success(tx_id):
    """Demo (comprador) avalia a tx settled."""
    body = {"tx_id": tx_id, "rater_id": MEMBER_DEMO, "rating": 5,
            "comment": "Produto ótimo, entrega rápida. Recomendo!"}
    r = http("POST", "/blx/ratings", json=body)
    if r.status_code != 200:
        log_fail("rating_success_status", f"{r.status_code} {r.text[:300]}")
        return None
    doc = r.json()
    required = {"rating_id", "tx_id", "rater_id", "seller_id", "rating", "created_at"}
    missing = required - set(doc.keys())
    if missing:
        log_fail("rating_success_fields", f"missing={missing} body={jprint(doc)}")
        return None
    if doc["rating"] != 5 or doc["rater_id"] != MEMBER_DEMO or doc["seller_id"] != MEMBER_LUIZ:
        log_fail("rating_success_values", jprint(doc))
        return None
    log_pass("rating_success", f"rating_id={doc['rating_id']} stars=5 seller={doc['seller_id']}")
    return doc


def test_rating_out_of_range(tx_id):
    for bad in [0, 6, -1, 100]:
        r = http("POST", "/blx/ratings",
                 json={"tx_id": tx_id, "rater_id": MEMBER_DEMO, "rating": bad})
        if r.status_code != 400:
            log_fail(f"rating_out_of_range_{bad}", f"{r.status_code} {r.text[:200]}")
            return
    log_pass("rating_out_of_range", "0, -1, 6, 100 → 400 ✓")


def test_rating_not_buyer(tx_id):
    """Luiz (seller) tenta avaliar a própria venda → 403."""
    r = http("POST", "/blx/ratings",
             json={"tx_id": tx_id, "rater_id": MEMBER_LUIZ, "rating": 5})
    if r.status_code != 403:
        log_fail("rating_not_buyer", f"{r.status_code} {r.text[:200]}")
        return
    log_pass("rating_not_buyer", "seller → 403 ✓")


def test_rating_not_settled():
    """Cria uma escrow NÃO settled (não confirma) → tentar avaliar → 400."""
    r = http("GET", f"/ads/member/{MEMBER_LUIZ}")
    if r.status_code != 200 or not r.json():
        log_fail("rating_not_settled_setup", "no Luiz ad")
        return
    ad = r.json()[0]
    r2 = http("POST", "/wallet/purchase", json={"ad_id": ad["ad_id"], "buyer_id": MEMBER_DEMO, "qty": 1})
    if r2.status_code != 200:
        log_fail("rating_not_settled_setup_purchase", f"{r2.status_code} {r2.text[:200]}")
        return
    tx = r2.json()
    tx_id = tx["tx_id"]
    # Now try rating WITHOUT confirming
    r3 = http("POST", "/blx/ratings",
              json={"tx_id": tx_id, "rater_id": MEMBER_DEMO, "rating": 5})
    if r3.status_code != 400:
        log_fail("rating_not_settled", f"{r3.status_code} {r3.text[:200]}")
        return
    log_pass("rating_not_settled", "escrow (não settled) → 400 ✓")
    # cleanup: refund is admin-gated; leave it alone or confirm now to avoid draining balance
    # We'll confirm it to settle and leave it
    http("POST", f"/wallet/confirm/{tx_id}", json={"buyer_id": MEMBER_DEMO})


def test_rating_duplicate(tx_id):
    """Avaliar 2x a mesma tx → 400."""
    r = http("POST", "/blx/ratings",
             json={"tx_id": tx_id, "rater_id": MEMBER_DEMO, "rating": 4, "comment": "dup"})
    if r.status_code != 400:
        log_fail("rating_duplicate", f"{r.status_code} {r.text[:200]}")
        return
    log_pass("rating_duplicate", "2ª tentativa → 400 ✓")


# ----------------------------------------------------------------------
# 3) GET /api/blx/ratings/seller/{seller_id}
# ----------------------------------------------------------------------

def test_seller_ratings_list():
    r = http("GET", f"/blx/ratings/seller/{MEMBER_LUIZ}?limit=50")
    if r.status_code != 200:
        log_fail("seller_ratings_status", f"{r.status_code} {r.text[:300]}")
        return
    data = r.json()
    if not isinstance(data, dict) or not all(k in data for k in ("count", "average", "ratings")):
        log_fail("seller_ratings_shape", jprint(data)[:400])
        return
    if data["count"] < 1 or data["average"] <= 0:
        log_fail("seller_ratings_values", jprint(data)[:400])
        return
    if not isinstance(data["ratings"], list) or not data["ratings"]:
        log_fail("seller_ratings_nonempty", jprint(data)[:400])
        return
    r0 = data["ratings"][0]
    required = {"rating_id", "rating", "rater_id", "rater_name", "created_at"}
    missing = required - set(r0.keys())
    if missing:
        log_fail("seller_ratings_item_fields", f"missing={missing} {jprint(r0)[:400]}")
        return
    if not r0.get("rater_name"):
        log_fail("seller_ratings_rater_name_populated", jprint(r0)[:400])
        return
    # Sort desc by created_at
    if len(data["ratings"]) > 1:
        dates = [x.get("created_at") for x in data["ratings"]]
        if sorted(dates, reverse=True) != dates:
            log_fail("seller_ratings_sort", f"dates={dates[:3]}")
            return
    log_pass("seller_ratings",
             f"count={data['count']} avg={data['average']} first_rater={r0['rater_name']} has_avatar={bool(r0.get('rater_avatar'))}")


# ----------------------------------------------------------------------
# 4) POST /api/ai/transcribe
# ----------------------------------------------------------------------

def test_transcribe_empty():
    r = http("POST", "/ai/transcribe", json={"audio_base64": ""})
    if r.status_code != 400:
        log_fail("transcribe_empty", f"{r.status_code} {r.text[:200]}")
        return
    body = r.json()
    det = body.get("detail", "")
    if "vazio" not in det.lower():
        log_fail("transcribe_empty_msg", det)
        return
    log_pass("transcribe_empty", f"400 '{det}'")


def test_transcribe_invalid_base64():
    # Very short invalid b64 string, but long enough to pass the length check (>=100 chars)
    bad = "####" * 50  # 200 chars of invalid base64
    r = http("POST", "/ai/transcribe", json={"audio_base64": bad})
    if r.status_code != 400:
        log_fail("transcribe_invalid_b64", f"{r.status_code} {r.text[:200]}")
        return
    det = r.json().get("detail", "")
    if "base64" not in det.lower() and "inválido" not in det.lower() and "invalido" not in det.lower():
        log_fail("transcribe_invalid_b64_msg", det)
        return
    log_pass("transcribe_invalid_b64", f"400 '{det}'")


def test_transcribe_exists_not_404_or_500():
    """Endpoint deve existir — pequeno payload inválido NÃO pode dar 404 nem 500."""
    # Gera base64 de bytes aleatórios (não é um áudio válido) → OpenAI falha com 502 OU 400
    random_bytes = b"\x00" * 800
    payload = base64.b64encode(random_bytes).decode()
    r = http("POST", "/ai/transcribe", json={"audio_base64": payload, "mime": "audio/webm"})
    if r.status_code in (404, 500):
        log_fail("transcribe_exists", f"{r.status_code} {r.text[:300]}")
        return
    log_pass("transcribe_exists", f"status={r.status_code} (accepted: 200/400/502/503)")


# ----------------------------------------------------------------------
# 5) GET /api/notifications/{member_id}
# ----------------------------------------------------------------------

def test_notifications_list():
    r = http("GET", f"/notifications/{MEMBER_LUIZ}")
    if r.status_code != 200:
        log_fail("notifications_list_status", f"{r.status_code} {r.text[:200]}")
        return
    items = r.json()
    if not isinstance(items, list):
        log_fail("notifications_list_type", str(type(items)))
        return
    types_seen = set()
    transfer_ok = False
    escrow_states = []
    for it in items:
        types_seen.add(it.get("type"))
        if it.get("type") == "transfer":
            title = (it.get("title") or "")
            if "BLX enviado" in title or "BLX recebido" in title:
                # must also have "BLX" in body
                if "BLX" in (it.get("body") or ""):
                    transfer_ok = True
        if it.get("type") in ("order", "sale"):
            body = it.get("body") or ""
            title = it.get("title") or ""
            # Should mention BLX (not "R$")
            if "R$" in body or "R$" in title:
                log_fail("notifications_uses_blx_not_brl",
                         f"found R$ in item: title='{title[:60]}' body='{body[:80]}'")
                return
            escrow_states.append((it.get("type"), title[:50]))
    log_pass("notifications_list",
             f"count={len(items)} types={types_seen} transfer_ok={transfer_ok} escrow_samples={escrow_states[:3]}")


# ----------------------------------------------------------------------
# 6) GET /api/notifications/{member_id}/count
# ----------------------------------------------------------------------

def test_notifications_count():
    r = http("GET", f"/notifications/{MEMBER_LUIZ}/count")
    if r.status_code != 200:
        log_fail("notifications_count_status", f"{r.status_code} {r.text[:200]}")
        return
    data = r.json()
    required = {"count", "messages", "notifications"}
    missing = required - set(data.keys())
    if missing:
        log_fail("notifications_count_fields", f"missing={missing} body={jprint(data)}")
        return
    for k in required:
        if not isinstance(data[k], int):
            log_fail("notifications_count_types", f"{k} is {type(data[k])}")
            return
    if data["count"] != data["messages"] + data["notifications"]:
        log_fail("notifications_count_sum", jprint(data))
        return
    log_pass("notifications_count",
             f"count={data['count']} messages={data['messages']} notifications={data['notifications']}")


# ----------------------------------------------------------------------
# 7) Regressão quick sanity
# ----------------------------------------------------------------------

def test_regression_wallet_and_lookup():
    r = http("GET", f"/blx/wallet/{MEMBER_LUIZ}")
    if r.status_code != 200 or r.json().get("currency") != "BLX":
        log_fail("regr_wallet_luiz", f"{r.status_code} {r.text[:200]}")
        return
    log_pass("regr_wallet_luiz", f"balance_centavos={r.json()['balance_centavos']}")

    r = http("GET", "/blx/lookup?q=BLX-JCM5T48X")
    arr = r.json() if r.status_code == 200 else []
    if len(arr) != 1 or arr[0].get("wallet_number") != "BLX-JCM5T48X":
        log_fail("regr_lookup_exact", f"{r.status_code} {jprint(arr)[:200]}")
        return
    log_pass("regr_lookup_exact", "BLX-JCM5T48X → 1 hit")


def test_regression_transfer_and_tx():
    # transfer 5 centavos demo → luiz (instant, won't drain balance)
    r = http("POST", "/blx/transfer", json={
        "from_member_id": MEMBER_DEMO,
        "to_wallet": "BLX-JCM5T48X",
        "amount_centavos": 5,
        "note": "regression sanity",
    })
    if r.status_code != 200:
        log_fail("regr_transfer", f"{r.status_code} {r.text[:200]}")
        return
    tx = r.json()
    if tx.get("type") != "transfer" or tx.get("status") != "settled" or tx.get("amount_centavos") != 5:
        log_fail("regr_transfer_shape", jprint(tx)[:300])
        return
    log_pass("regr_transfer", f"tx_id={tx.get('tx_id')} 5c OK")

    r2 = http("GET", f"/blx/transactions/{MEMBER_LUIZ}?limit=5&skip=0")
    if r2.status_code != 200 or not isinstance(r2.json(), list):
        log_fail("regr_transactions", f"{r2.status_code}")
        return
    log_pass("regr_transactions", f"got {len(r2.json())} txs")


def test_regression_topup_centavos(token):
    if not token:
        log_fail("regr_topup_centavos", "no admin token")
        return
    hdr = {"Authorization": f"Bearer {token}"}
    r = http("POST", "/wallet/topup",
             headers=hdr,
             json={"member_id": MEMBER_DEMO, "amount_centavos": 100, "note": "regr"})
    if r.status_code != 200:
        log_fail("regr_topup_centavos", f"{r.status_code} {r.text[:200]}")
        return
    tx = r.json()
    if tx.get("amount_centavos") != 100 or tx.get("type") != "topup" or tx.get("status") != "settled":
        log_fail("regr_topup_centavos_shape", jprint(tx)[:300])
        return
    log_pass("regr_topup_centavos", f"amount_centavos=100 currency={tx.get('currency')}")


def login_admin():
    r = http("POST", "/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code == 200:
        tok = r.json().get("token")
        log_pass("admin_login", f"token_len={len(tok or '')}")
        return tok
    log_fail("admin_login", f"{r.status_code} {r.text[:200]}")
    return None


# ----------------------------------------------------------------------
def main():
    print(f"API base: {API}\n")

    # Regression first (fast)
    test_regression_wallet_and_lookup()
    test_regression_transfer_and_tx()
    tok = login_admin()
    test_regression_topup_centavos(tok)

    print("\n--- Setup: create settled escrow tx (demo buys from Luiz) ---")
    tx_id = setup_settled_tx()

    print("\n--- 1) GET /api/blx/orders ---")
    test_orders_empty_member()
    if tx_id:
        test_orders_buyer_vs_seller(tx_id)
    test_orders_role_all(MEMBER_DEMO, "demo")
    test_orders_role_all(MEMBER_LUIZ, "luiz")

    print("\n--- 2) POST /api/blx/ratings ---")
    if tx_id:
        test_rating_out_of_range(tx_id)   # before successful (no doc yet)
        test_rating_not_buyer(tx_id)
        test_rating_not_settled()
        test_ratings_success(tx_id)        # creates the rating doc
        test_rating_duplicate(tx_id)       # after success

    print("\n--- 3) GET /api/blx/ratings/seller/{id} ---")
    test_seller_ratings_list()

    print("\n--- 4) POST /api/ai/transcribe ---")
    test_transcribe_empty()
    test_transcribe_invalid_base64()
    test_transcribe_exists_not_404_or_500()

    print("\n--- 5) GET /api/notifications/{id} ---")
    test_notifications_list()

    print("\n--- 6) GET /api/notifications/{id}/count ---")
    test_notifications_count()

    print("\n" + "=" * 60)
    print(f"PASS: {len(PASS)}")
    print(f"FAIL: {len(FAIL)}")
    for n, d in FAIL:
        print(f"  - {n}: {d}")
    print("=" * 60)
    return 0 if not FAIL else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
