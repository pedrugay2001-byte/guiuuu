"""
Finance Hero (Painel Financeiro Premium) — tests

Cobre:
- GET /api/pyx/rate agora retorna finance_hero_image_base64 e finance_hero_image_url
- PUT /api/admin/pyx/finance-hero sem auth → 401
- PUT /api/admin/pyx/finance-hero como support → 403
- PUT /api/admin/pyx/finance-hero como master admin → 200 (image_url)
- Após PUT, GET /api/pyx/rate reflete o novo estado
- PUT com image_base64 gigante > 2.5MB → 413
- Regressão: /api/pyx/rate/history, /api/home-banners, /api/pyx/transfer continuam
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://member-shop-2.preview.emergentagent.com"
).rstrip("/")

ADMIN_EMAIL = "guilherme925145000@gmail.com"
ADMIN_PASSWORD = "Shakira12@"
SUPPORT_EMAIL = "suporte@blacksclub.com"
SUPPORT_PASSWORD = "suporte123"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login falhou: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def support_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": SUPPORT_EMAIL, "password": SUPPORT_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Support login indisponível: {r.status_code}")
    return r.json()["token"]


@pytest.fixture(scope="module", autouse=True)
def _reset_hero(api, admin_token):
    """Ao final: limpa a imagem custom pra voltar ao SVG default."""
    yield
    try:
        api.put(
            f"{BASE_URL}/api/admin/pyx/finance-hero",
            json={"image_base64": "", "image_url": ""},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    except Exception:
        pass


# ==================== GET /api/pyx/rate: novos campos ====================

class TestRateHasFinanceHeroFields:
    def test_rate_returns_finance_hero_fields(self, api):
        r = api.get(f"{BASE_URL}/api/pyx/rate")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "finance_hero_image_base64" in d, d
        assert "finance_hero_image_url" in d, d
        # defaults strings
        assert isinstance(d["finance_hero_image_base64"], str)
        assert isinstance(d["finance_hero_image_url"], str)


# ==================== PUT /api/admin/pyx/finance-hero auth ====================

class TestFinanceHeroAuth:
    def test_put_without_auth_returns_401(self, api):
        r = api.put(
            f"{BASE_URL}/api/admin/pyx/finance-hero",
            json={"image_url": "https://picsum.photos/800/450"},
        )
        assert r.status_code in (401, 403), f"Esperava 401/403, veio {r.status_code}: {r.text}"

    def test_put_as_support_returns_403(self, api, support_token):
        r = api.put(
            f"{BASE_URL}/api/admin/pyx/finance-hero",
            json={"image_url": "https://picsum.photos/800/450"},
            headers={"Authorization": f"Bearer {support_token}"},
        )
        assert r.status_code == 403, f"Esperava 403 support, veio {r.status_code}: {r.text}"


# ==================== PUT /api/admin/pyx/finance-hero admin OK ====================

class TestFinanceHeroSetAdmin:
    def test_put_image_url_persists(self, api, admin_token):
        url = "https://picsum.photos/800/450"
        r = api.put(
            f"{BASE_URL}/api/admin/pyx/finance-hero",
            json={"image_url": url},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("finance_hero_image_url") == url, d

        # GET público reflete
        g = api.get(f"{BASE_URL}/api/pyx/rate")
        assert g.status_code == 200
        gd = g.json()
        assert gd["finance_hero_image_url"] == url

    def test_put_empty_resets(self, api, admin_token):
        r = api.put(
            f"{BASE_URL}/api/admin/pyx/finance-hero",
            json={"image_base64": "", "image_url": ""},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["finance_hero_image_base64"] == ""
        assert d["finance_hero_image_url"] == ""

    def test_put_image_base64_too_large_returns_413(self, api, admin_token):
        # gera string base64-like > 2.5MB
        big = "A" * (2_500_001)
        r = api.put(
            f"{BASE_URL}/api/admin/pyx/finance-hero",
            json={"image_base64": big},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 413, f"Esperava 413, veio {r.status_code}: {r.text[:200]}"


# ==================== Regressão ====================

class TestRegression:
    def test_rate_history_admin_still_works(self, api, admin_token):
        r = api.get(
            f"{BASE_URL}/api/pyx/rate/history",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_home_banners_public_still_works(self, api):
        r = api.get(f"{BASE_URL}/api/home-banners")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_admin_home_banners_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/admin/home-banners")
        assert r.status_code in (401, 403)

    def test_pyx_transfer_requires_auth(self, api):
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json={
            "from_member_id": "mem_7a9d652945e7",
            "to_wallet": "PYX-DUMMY0001",
            "amount_centavos": 100,
        })
        assert r.status_code == 401
