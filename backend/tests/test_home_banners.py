"""
Backend regression tests for BLACKSCLUB Home Banners admin endpoints.
Covers:
- Auth requirements (require_admin) on all /api/admin/home-banners routes
- CRUD flow (POST, PUT partial, DELETE) with persistence verification via GET
- Public GET /api/home-banners returns only active banners
- Regression: /api/pyx/rate still working
"""

import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback for CI
    BASE_URL = "https://member-shop-2.preview.emergentagent.com"

ADMIN_EMAIL = "guilherme925145000@gmail.com"
ADMIN_PASSWORD = "Shakira12@"
SUPPORT_EMAIL = "suporte@blacksclub.com"
SUPPORT_PASSWORD = "suporte123"

# a tiny PNG (1x1) encoded to keep payload small but real
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7"
    "wAAAABJRU5ErkJggg=="
)


def _login(email: str, password: str) -> str | None:
    """Returns bearer token or None if invalid."""
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    if r.status_code != 200:
        return None
    return r.json().get("token")


@pytest.fixture(scope="module")
def admin_token():
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        pytest.skip("Cannot login as master admin — skipping banner suite")
    return tok


@pytest.fixture(scope="module")
def support_token():
    """Optional: only used to verify 403 for non-admin. Skip if account doesn't exist."""
    return _login(SUPPORT_EMAIL, SUPPORT_PASSWORD)


@pytest.fixture(scope="module")
def created_banner_ids():
    """Collects banners created during tests so we can cleanup at end."""
    ids: list[str] = []
    yield ids
    # teardown — best-effort cleanup
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        return
    for bid in ids:
        try:
            requests.delete(
                f"{BASE_URL}/api/admin/home-banners/{bid}",
                headers={"Authorization": f"Bearer {tok}"},
                timeout=10,
            )
        except Exception:
            pass


# --------------- AUTH ENFORCEMENT ---------------

class TestAuthEnforcement:
    def test_get_admin_list_without_auth_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/home-banners", timeout=10)
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_post_admin_without_auth_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/home-banners",
            json={"title": "TEST_no_auth"},
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_put_admin_without_auth_returns_401(self):
        r = requests.put(
            f"{BASE_URL}/api/admin/home-banners/nonexistent_id",
            json={"title": "x"},
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_delete_admin_without_auth_returns_401(self):
        r = requests.delete(
            f"{BASE_URL}/api/admin/home-banners/nonexistent_id",
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_support_role_gets_403(self, support_token):
        if not support_token:
            pytest.skip("support account not available; skipping non-admin 403 check")
        r = requests.get(
            f"{BASE_URL}/api/admin/home-banners",
            headers={"Authorization": f"Bearer {support_token}"},
            timeout=10,
        )
        assert r.status_code == 403, (
            f"Expected 403 for support role, got {r.status_code}: {r.text[:200]}"
        )

    def test_admin_role_gets_200(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/home-banners",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), list)


# --------------- PUBLIC ENDPOINT ---------------

class TestPublicList:
    def test_public_home_banners_returns_list(self):
        r = requests.get(f"{BASE_URL}/api/home-banners", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # all returned banners must be active
        for b in data:
            assert b.get("active") is True, f"public endpoint returned inactive banner: {b}"
            # ensure no mongo _id leaks
            assert "_id" not in b


# --------------- CRUD FLOW ---------------

class TestBannerCRUD:
    def test_create_banner_persists(self, admin_token, created_banner_ids):
        # ~50KB payload — repeat tiny png base64 to reach roughly 50KB
        big_b64 = (TINY_PNG_B64 * 1000)[:50_000]

        payload = {
            "title": "TEST_E2E_regression",
            "subtitle": "Banner criado pelo teste automatizado",
            "image_base64": big_b64,
            "cta_label": "Ver mais",
            "cta_route": "/pyx/history",
            "accent_color": "#D4AF37",
            "category": "novidade",
            "active": True,
            "order": 999,
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/home-banners",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:400]
        b = r.json()
        assert b["title"] == "TEST_E2E_regression"
        assert b["category"] == "novidade"
        assert b["order"] == 999
        assert b["active"] is True
        assert b["cta_label"] == "Ver mais"
        assert "banner_id" in b
        assert "_id" not in b
        created_banner_ids.append(b["banner_id"])

        # GET verify persistence
        r2 = requests.get(
            f"{BASE_URL}/api/admin/home-banners",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r2.status_code == 200
        assert any(x["banner_id"] == b["banner_id"] for x in r2.json())

    def test_update_banner_partial(self, admin_token, created_banner_ids):
        assert created_banner_ids, "no banner created to update"
        bid = created_banner_ids[-1]

        r = requests.put(
            f"{BASE_URL}/api/admin/home-banners/{bid}",
            json={"title": "TEST_E2E_updated", "active": False},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text[:400]
        b = r.json()
        assert b["title"] == "TEST_E2E_updated"
        assert b["active"] is False
        # untouched fields preserved
        assert b["category"] == "novidade"
        assert b["cta_label"] == "Ver mais"

        # inactive banner should NOT appear in public endpoint
        pub = requests.get(f"{BASE_URL}/api/home-banners", timeout=10).json()
        assert not any(x["banner_id"] == bid for x in pub), (
            "inactive banner leaked to public endpoint"
        )

    def test_delete_banner(self, admin_token, created_banner_ids):
        assert created_banner_ids, "no banner created to delete"
        bid = created_banner_ids.pop()  # remove from cleanup list, we're deleting now
        r = requests.delete(
            f"{BASE_URL}/api/admin/home-banners/{bid}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text[:400]
        assert r.json().get("ok") is True

        # GET to confirm gone
        listing = requests.get(
            f"{BASE_URL}/api/admin/home-banners",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        ).json()
        assert not any(x["banner_id"] == bid for x in listing)

        # DELETE again → 404
        r2 = requests.delete(
            f"{BASE_URL}/api/admin/home-banners/{bid}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r2.status_code == 404

    def test_create_missing_title_returns_400(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/home-banners",
            json={"title": "  "},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r.status_code == 400, r.text[:200]


# --------------- REGRESSION: pyx rate ---------------

class TestPyxRateRegression:
    def test_public_pyx_rate_still_works(self):
        r = requests.get(f"{BASE_URL}/api/pyx/rate", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "pyx_per_usd_centavos" in data
        assert data["pyx_per_usd_centavos"] > 0
        assert "_id" not in data

    def test_pyx_rate_put_requires_admin(self):
        r = requests.put(
            f"{BASE_URL}/api/pyx/rate",
            json={"pyx_per_usd_centavos": 500},
            timeout=10,
        )
        assert r.status_code in (401, 403)
