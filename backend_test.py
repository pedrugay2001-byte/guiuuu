"""
Backend tests for GET /api/admin/metrics and regression smoke tests.
Targets public URL from frontend/.env.
"""
import os
import sys
import json
import time
from datetime import datetime, timezone, timedelta

import requests
import jwt as pyjwt

# Public base URL
BASE = "https://member-shop-2.preview.emergentagent.com/api"

# Fixed test references
MEM_LUIZ = "mem_7a9d652945e7"
STORY_ID = "st_bd34019616c5"

ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_PASSWORD = "admin123"

# JWT secret (from backend/.env, used only to forge a non-staff token for the 403 test)
JWT_SECRET = "d9f3a8c2e1b74f65a0c83b59e2d7f14a6c9b8e0f3d5a2b7e1c4d9f8a6b3c5e7d"
JWT_ALGORITHM = "HS256"

fails = []
passes = []


def assert_true(name, cond, detail=""):
    if cond:
        passes.append(name)
        print(f"PASS  {name}")
    else:
        fails.append(f"{name}: {detail}")
        print(f"FAIL  {name}  {detail}")


def login_admin():
    r = requests.post(
        f"{BASE}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    return data["token"], data["user"]


def forge_member_token():
    """Forge a JWT token for an existing role=member user in DB to test RBAC 403 path."""
    from pymongo import MongoClient

    client = MongoClient("mongodb://localhost:27017")
    db = client["farmaclube_database"]
    u = db.users.find_one({"role": "member"}, {"_id": 0, "user_id": 1, "email": 1})
    assert u, "no role=member user available to forge a non-staff token"
    payload = {
        "sub": u["user_id"],
        "email": u["email"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "type": "access",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM), u


# -----------------------------------------------------------------------------
# 1) /api/admin/metrics tests
# -----------------------------------------------------------------------------
def test_admin_metrics_unauth():
    r = requests.get(f"{BASE}/admin/metrics", timeout=30)
    assert_true(
        "admin/metrics sem token -> 401",
        r.status_code == 401,
        f"got {r.status_code}: {r.text[:200]}",
    )


def test_admin_metrics_forbidden_member():
    token, u = forge_member_token()
    r = requests.get(
        f"{BASE}/admin/metrics",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert_true(
        "admin/metrics com token membro (role=member) -> 403",
        r.status_code == 403,
        f"got {r.status_code}: {r.text[:200]} (user={u.get('email')})",
    )


def test_admin_metrics_ok():
    token, user = login_admin()
    r = requests.get(
        f"{BASE}/admin/metrics",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert_true(
        "admin/metrics com token admin -> 200",
        r.status_code == 200,
        f"{r.status_code}: {r.text[:300]}",
    )
    if r.status_code != 200:
        return
    data = r.json()

    for k in ("supply", "volume_30d", "orders", "top_sellers"):
        assert_true(f"resposta contem '{k}'", k in data)

    # ------ supply ------
    supply = data.get("supply", {})
    sup_expected = [
        ("total_cents", int),
        ("available_cents", int),
        ("escrow_out_cents", int),
        ("escrow_in_cents", int),
        ("wallets_count", int),
        ("wallets_with_balance", int),
    ]
    for key, typ in sup_expected:
        v = supply.get(key)
        assert_true(
            f"supply.{key} presente e do tipo {typ.__name__}",
            isinstance(v, typ) and not isinstance(v, bool),
            f"got {v!r} ({type(v).__name__})",
        )
    assert_true(
        "supply.total_cents == available_cents + escrow_out_cents",
        supply.get("total_cents")
        == (supply.get("available_cents", 0) + supply.get("escrow_out_cents", 0)),
        f"total={supply.get('total_cents')} avail={supply.get('available_cents')} out={supply.get('escrow_out_cents')}",
    )
    assert_true(
        "supply.wallets_with_balance <= wallets_count",
        supply.get("wallets_with_balance", 0) <= supply.get("wallets_count", 0),
    )

    # ------ volume_30d ------
    vol = data.get("volume_30d", {})
    assert_true(
        "volume_30d.total_cents eh int >= 0",
        isinstance(vol.get("total_cents"), int)
        and not isinstance(vol.get("total_cents"), bool)
        and vol.get("total_cents", -1) >= 0,
        f"got {vol.get('total_cents')!r}",
    )
    assert_true(
        "volume_30d.tx_count eh int >= 0",
        isinstance(vol.get("tx_count"), int)
        and not isinstance(vol.get("tx_count"), bool)
        and vol.get("tx_count", -1) >= 0,
        f"got {vol.get('tx_count')!r}",
    )

    # ------ orders ------
    orders = data.get("orders", {})
    assert_true(
        "orders.open eh int",
        isinstance(orders.get("open"), int) and not isinstance(orders.get("open"), bool),
        f"got {orders.get('open')!r}",
    )
    assert_true(
        "orders.completed eh int",
        isinstance(orders.get("completed"), int) and not isinstance(orders.get("completed"), bool),
        f"got {orders.get('completed')!r}",
    )

    # ------ top_sellers ------
    top = data.get("top_sellers")
    assert_true("top_sellers eh lista", isinstance(top, list))
    if isinstance(top, list):
        for i, s in enumerate(top):
            prefix = f"top_sellers[{i}]"
            for k in ("member_id", "name", "tier"):
                v = s.get(k)
                assert_true(
                    f"{prefix}.{k} eh str",
                    isinstance(v, str),
                    f"got {v!r} ({type(v).__name__})",
                )
            for k in ("total_cents", "sales_count", "rating_count"):
                v = s.get(k)
                assert_true(
                    f"{prefix}.{k} eh int",
                    isinstance(v, int) and not isinstance(v, bool),
                    f"got {v!r} ({type(v).__name__})",
                )
            # rating_avg é float (ou 0.0)
            v = s.get("rating_avg")
            assert_true(
                f"{prefix}.rating_avg eh float",
                isinstance(v, float),
                f"got {v!r} ({type(v).__name__})",
            )
            # avatar pode ser None ou str
            assert_true(
                f"{prefix} tem campo avatar_base64 (str|None)",
                "avatar_base64" in s
                and (s["avatar_base64"] is None or isinstance(s["avatar_base64"], str)),
                f"got {type(s.get('avatar_base64')).__name__}",
            )

    print(
        "[metrics summary]",
        json.dumps(
            {
                "supply": supply,
                "volume_30d": vol,
                "orders": orders,
                "top_sellers_count": len(top) if isinstance(top, list) else None,
            },
            default=str,
        )[:500],
    )


# -----------------------------------------------------------------------------
# 2) Regression smoke
# -----------------------------------------------------------------------------
def test_blx_wallet_regression():
    r = requests.get(f"{BASE}/blx/wallet/{MEM_LUIZ}", timeout=30)
    assert_true(
        "GET /blx/wallet/{luiz} -> 200",
        r.status_code == 200,
        f"{r.status_code}: {r.text[:200]}",
    )
    if r.status_code == 200:
        w = r.json()
        assert_true(
            "wallet.currency == BLX",
            w.get("currency") == "BLX",
            f"got {w.get('currency')}",
        )
        assert_true(
            "wallet.balance_centavos eh int",
            isinstance(w.get("balance_centavos"), int)
            and not isinstance(w.get("balance_centavos"), bool),
            f"got {type(w.get('balance_centavos')).__name__}",
        )
        assert_true(
            "wallet.wallet_number comeca com BLX-",
            isinstance(w.get("wallet_number"), str)
            and w["wallet_number"].startswith("BLX-"),
            f"got {w.get('wallet_number')!r}",
        )


def test_stories_regression():
    r = requests.get(f"{BASE}/stories", timeout=30)
    assert_true(
        "GET /stories -> 200", r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    )
    if r.status_code == 200:
        data = r.json()
        groups = data if isinstance(data, list) else data.get("groups") or data.get("data") or []
        assert_true("/stories retorna lista de grupos", isinstance(groups, list))
        # Ausência de image_base64 nos items para manter payload leve
        if isinstance(groups, list) and groups:
            any_with_img = False
            for g in groups:
                stories = g.get("stories") if isinstance(g, dict) else None
                if isinstance(stories, list):
                    for s in stories:
                        if isinstance(s, dict) and s.get("image_base64"):
                            any_with_img = True
            assert_true(
                "stories nao trazem image_base64 (lista leve)",
                not any_with_img,
            )


def test_story_image_regression():
    r = requests.get(f"{BASE}/stories/{STORY_ID}/image", timeout=30)
    assert_true(
        f"GET /stories/{STORY_ID}/image -> 200",
        r.status_code == 200,
        f"{r.status_code}: {r.text[:200]}",
    )
    if r.status_code == 200:
        d = r.json()
        img = d.get("image_base64")
        assert_true(
            "image_base64 presente e nao-vazio",
            isinstance(img, str) and len(img) > 100,
            f"img_len={len(img) if isinstance(img, str) else None}",
        )
        assert_true(
            "story_id eco correto",
            d.get("story_id") == STORY_ID,
            f"got {d.get('story_id')!r}",
        )


def main():
    print(f"=== Testing against {BASE} ===\n")
    t0 = time.time()
    try:
        test_admin_metrics_unauth()
        test_admin_metrics_forbidden_member()
        test_admin_metrics_ok()
        test_blx_wallet_regression()
        test_stories_regression()
        test_story_image_regression()
    except Exception as e:
        fails.append(f"Unhandled exception: {e!r}")
        print(f"EXCEPTION: {e!r}")

    print(f"\n=== {len(passes)} passed, {len(fails)} failed in {time.time()-t0:.1f}s ===")
    if fails:
        print("\nFAILURES:")
        for f in fails:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
