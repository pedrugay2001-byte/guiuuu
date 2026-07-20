"""
PYX/USD Rate feature tests.

Cobre:
  - GET /api/pyx/rate (público) → 200 com campos esperados
  - PUT /api/pyx/rate sem auth → 401
  - PUT /api/pyx/rate com role=support → 403 "Admin access required"
  - PUT /api/pyx/rate com Master Admin + centavos → 200, persiste, updated_by_name
  - PUT /api/pyx/rate com centavos=0 → 400
  - PUT /api/pyx/rate com centavos=20_000_000 → 400 "Cotação muito alta"
  - PUT /api/pyx/rate com pyx_per_usd=6.25 → 200 (625 centavos)
  - GET /api/pyx/rate/history admin → 200 com prev/new/changed_by_name
  - GET /api/pyx/rate/history sem auth/support → 401/403

IMPORTANTE: A cotação é RESTAURADA para 500 centavos no teardown do módulo.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://member-shop-2.preview.emergentagent.com"
).rstrip("/")

ADMIN_EMAIL = "guilherme925145000@gmail.com"
ADMIN_PASSWORD = "Shakira12@"

SUPPORT_EMAIL = "suporte@blacksclub.com"
SUPPORT_PASSWORD = "suporte123"

DEFAULT_RATE_CENTAVOS = 500


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login admin falhou: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def support_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": SUPPORT_EMAIL, "password": SUPPORT_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Support login não disponível: {r.status_code}")
    return r.json()["token"]


@pytest.fixture(scope="module", autouse=True)
def _restore_rate(api, admin_token):
    """Restaura a cotação para o default (500) ao final do módulo."""
    yield
    try:
        api.put(
            f"{BASE_URL}/api/pyx/rate",
            json={"pyx_per_usd_centavos": DEFAULT_RATE_CENTAVOS},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    except Exception:
        pass


# ==================== GET /api/pyx/rate (público) ====================

class TestRateGet:
    def test_public_get_returns_200_all_fields(self, api):
        r = api.get(f"{BASE_URL}/api/pyx/rate")
        assert r.status_code == 200, r.text
        d = r.json()
        for f in ("pyx_per_usd_centavos", "pyx_per_usd", "pyx_per_usd_display",
                  "updated_at", "updated_by_name"):
            assert f in d, f"Campo ausente: {f}. Payload: {d}"
        assert isinstance(d["pyx_per_usd_centavos"], int)
        assert d["pyx_per_usd_centavos"] >= 1
        assert isinstance(d["pyx_per_usd"], (int, float))
        # display no formato brasileiro "X,YZ"
        assert "," in d["pyx_per_usd_display"]
        assert "_id" not in d


# ==================== PUT /api/pyx/rate (auth) ====================

class TestRateSetAuth:
    def test_put_without_auth_returns_401(self, api):
        r = api.put(f"{BASE_URL}/api/pyx/rate", json={"pyx_per_usd_centavos": 500})
        assert r.status_code == 401, f"Esperava 401 sem auth, veio {r.status_code}: {r.text}"

    def test_put_as_support_returns_403(self, api, support_token):
        r = api.put(
            f"{BASE_URL}/api/pyx/rate",
            json={"pyx_per_usd_centavos": 500},
            headers={"Authorization": f"Bearer {support_token}"},
        )
        assert r.status_code == 403, f"Esperava 403 para support, veio {r.status_code}: {r.text}"
        detail = r.json().get("detail", "").lower()
        assert "admin" in detail, f"detail esperado com 'admin', veio: {detail}"


# ==================== PUT /api/pyx/rate (validação) ====================

class TestRateSetValidation:
    def test_put_centavos_zero_returns_400(self, api, admin_token):
        r = api.put(
            f"{BASE_URL}/api/pyx/rate",
            json={"pyx_per_usd_centavos": 0},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 400, r.text
        assert "inválida" in r.json().get("detail", "").lower()

    def test_put_centavos_too_high_returns_400(self, api, admin_token):
        r = api.put(
            f"{BASE_URL}/api/pyx/rate",
            json={"pyx_per_usd_centavos": 20_000_000},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 400, r.text
        assert "alta" in r.json().get("detail", "").lower()

    def test_put_no_body_returns_400(self, api, admin_token):
        r = api.put(
            f"{BASE_URL}/api/pyx/rate",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 400, r.text


# ==================== PUT /api/pyx/rate (updates válidos) ====================

class TestRateSetSuccess:
    def test_put_centavos_updates_and_persists(self, api, admin_token):
        r = api.put(
            f"{BASE_URL}/api/pyx/rate",
            json={"pyx_per_usd_centavos": 750},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["pyx_per_usd_centavos"] == 750
        assert d["pyx_per_usd"] == 7.5
        assert d["pyx_per_usd_display"] == "7,50"
        assert d.get("updated_by_name"), "updated_by_name deve estar preenchido"

        # GET reflete o novo valor
        g = api.get(f"{BASE_URL}/api/pyx/rate")
        assert g.status_code == 200
        gd = g.json()
        assert gd["pyx_per_usd_centavos"] == 750
        assert gd["pyx_per_usd_display"] == "7,50"

    def test_put_pyx_per_usd_float_converts_to_centavos(self, api, admin_token):
        r = api.put(
            f"{BASE_URL}/api/pyx/rate",
            json={"pyx_per_usd": 6.25},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["pyx_per_usd_centavos"] == 625, f"Esperava 625 centavos, veio {d}"
        assert d["pyx_per_usd_display"] == "6,25"


# ==================== GET /api/pyx/rate/history ====================

class TestRateHistory:
    def test_history_requires_auth_401(self, api):
        r = api.get(f"{BASE_URL}/api/pyx/rate/history")
        assert r.status_code == 401, f"Esperava 401, veio {r.status_code}: {r.text}"

    def test_history_as_support_returns_403(self, api, support_token):
        r = api.get(
            f"{BASE_URL}/api/pyx/rate/history",
            headers={"Authorization": f"Bearer {support_token}"},
        )
        assert r.status_code == 403, f"Esperava 403 para support, veio {r.status_code}: {r.text}"

    def test_history_admin_returns_entries(self, api, admin_token):
        # Garante que existe pelo menos uma entrada — atualiza o rate
        api.put(
            f"{BASE_URL}/api/pyx/rate",
            json={"pyx_per_usd_centavos": 555},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        time.sleep(0.3)
        r = api.get(
            f"{BASE_URL}/api/pyx/rate/history",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        first = arr[0]
        for f in ("history_id", "prev_pyx_per_usd_centavos", "new_pyx_per_usd_centavos",
                  "changed_at", "changed_by_name"):
            assert f in first, f"Campo ausente no histórico: {f}. Item: {first}"
        # A entrada mais recente deve ter new=555
        assert first["new_pyx_per_usd_centavos"] == 555
        assert first["changed_by_name"], "changed_by_name deve estar preenchido"
        # sem _id
        for it in arr:
            assert "_id" not in it


# ==================== Regressão PYX (endpoints existentes) ====================

class TestPYXRegression:
    def test_transfer_missing_password_still_401(self, api):
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json={
            "from_member_id": "mem_7a9d652945e7",
            "to_wallet": "PYX-DUMMY0001",
            "amount_centavos": 100,
        })
        assert r.status_code == 401

    def test_receipt_nonexistent_404(self, api):
        r = api.get(f"{BASE_URL}/api/pyx/receipt/tx_inexistente_xyz")
        assert r.status_code == 404

    def test_transactions_list_ok(self, api):
        # transactions endpoint (regressão light)
        r = api.get(f"{BASE_URL}/api/pyx/transactions/mem_7a9d652945e7")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)
