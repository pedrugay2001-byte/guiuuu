"""
Etapa 3 — Validação de senha para transferências PYX.
Tests /api/pyx/transfer com foco nas novas validações de senha (bcrypt).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://member-shop-2.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "guilherme925145000@gmail.com"
ADMIN_PASSWORD = "Shakira12@"
ADMIN_MEMBER_ID = "mem_7a9d652945e7"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def another_member(api):
    """Encontra outro membro (não o admin master) para transferir."""
    # tenta admin@farmaclube.com
    r = api.get(f"{BASE_URL}/api/pyx/lookup", params={"q": "admin@farmaclube"})
    assert r.status_code == 200, r.text
    data = r.json()
    if data:
        for m in data:
            if m["member_id"] != ADMIN_MEMBER_ID:
                return m
    # fallback: busca por "suporte" ou qualquer nome comum
    for q in ["suporte", "financeiro", "demo", "carlos", "maria", "joao"]:
        r = api.get(f"{BASE_URL}/api/pyx/lookup", params={"q": q})
        if r.status_code == 200:
            for m in r.json():
                if m["member_id"] != ADMIN_MEMBER_ID:
                    return m
    pytest.skip("Nenhum outro membro encontrado para teste de transferência.")


class TestPyxTransferPasswordValidation:
    """/api/pyx/transfer — validações de senha (Etapa 3)"""

    def test_missing_password_returns_401(self, api):
        payload = {
            "from_member_id": ADMIN_MEMBER_ID,
            "to_wallet": "PYX-DUMMY0001",
            "amount_centavos": 100,
        }
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json=payload)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "senha obrigat" in detail.lower(), f"Detail should contain 'Senha obrigatória': {detail}"

    def test_wrong_password_returns_401(self, api):
        payload = {
            "from_member_id": ADMIN_MEMBER_ID,
            "to_wallet": "PYX-DUMMY0001",
            "amount_centavos": 100,
            "password": "wrong",
        }
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json=payload)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "senha incorreta" in detail.lower(), f"Detail should contain 'Senha incorreta': {detail}"

    def test_correct_password_but_invalid_recipient_returns_404(self, api):
        """Senha PASSA na validação — falha só no lookup do destinatário → 404."""
        payload = {
            "from_member_id": ADMIN_MEMBER_ID,
            "to_wallet": "PYX-INEXISTENTE",
            "amount_centavos": 100,
            "password": ADMIN_PASSWORD,
        }
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json=payload)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "carteira destinat" in detail.lower(), f"Detail should mention carteira destinatária: {detail}"

    def test_full_valid_transfer_returns_200(self, api, another_member):
        """Fluxo completo — admin master → outro membro, 100 centavos."""
        payload = {
            "from_member_id": ADMIN_MEMBER_ID,
            "to_wallet": another_member["wallet_number"],
            "amount_centavos": 100,
            "password": ADMIN_PASSWORD,
            "note": "TEST_etapa3_pwd",
        }
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "tx_id" in data, f"Response missing tx_id: {data}"
        assert data["tx_id"].startswith("tx_") or data["tx_id"].startswith("wtx_") or len(data["tx_id"]) >= 6, \
            f"tx_id looks malformed: {data.get('tx_id')}"


class TestPyxTransferRegression:
    """Regressão — endpoints auxiliares continuam funcionando."""

    def test_pyx_lookup_admin(self, api):
        r = api.get(f"{BASE_URL}/api/pyx/lookup", params={"q": "guilherme"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_pyx_wallet_admin(self, api):
        r = api.get(f"{BASE_URL}/api/pyx/wallet/{ADMIN_MEMBER_ID}")
        assert r.status_code == 200
        data = r.json()
        assert data["member_id"] == ADMIN_MEMBER_ID
        assert "balance_centavos" in data
        assert "wallet_number" in data
