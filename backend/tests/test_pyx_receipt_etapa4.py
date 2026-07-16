"""
Etapa 4 — Comprovantes de Transferência PYX.

Cobre:
  - GET /api/pyx/receipt/{tx_id}?member_id=... (200 com from_info/to_info)
  - GET /api/pyx/receipt/{tx_id_inexistente} → 404
  - GET com stranger não-staff → 403
  - GET com staff (admin) alheio → 200 (staff bypass)
  - POST /api/community/dms/{me}/{other} com kind='receipt' + tx_id → 200, persistido
  - POST DM receipt SEM tx_id → 400
  - POST DM receipt com tx_id inválido → 404
  - POST DM receipt onde 'me' não é parte da tx → 403
  - Regressão: POST DM texto simples → 200 kind='text'
  - Regressão: POST /api/pyx/transfer sem senha → 401
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://member-shop-2.preview.emergentagent.com"
).rstrip("/")

ADMIN_EMAIL = "guilherme925145000@gmail.com"
ADMIN_PASSWORD = "Shakira12@"
ADMIN_MEMBER_ID = "mem_7a9d652945e7"  # role=admin, será usado como STAFF para bypass

# Demo será o SENDER da tx do teste (para que ADMIN_MEMBER_ID fique livre p/ staff-bypass)
DEMO_EMAIL = "demo@blacksclub.com"
DEMO_PASSWORD = "novasenha123"
DEMO_MEMBER_ID = "mem_e5bb9b5878dd"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _role_of(api, member_id):
    lim = api.get(f"{BASE_URL}/api/pyx/limits/{member_id}")
    if lim.status_code == 200:
        return lim.json().get("role")
    return None


@pytest.fixture(scope="module")
def recipient_member(api):
    """Recipient da tx do teste. Precisa ser != DEMO_MEMBER_ID e != ADMIN_MEMBER_ID e não-staff."""
    for q in ["Mateus", "Andrea", "RHIAN", "Piu", "Teste", "Joao", "Andre", "Crist", "ROMEU", "Dr Junior", "Thierry"]:
        r = api.get(f"{BASE_URL}/api/pyx/lookup", params={"q": q})
        if r.status_code != 200:
            continue
        for m in r.json():
            mid = m["member_id"]
            if mid in (DEMO_MEMBER_ID, ADMIN_MEMBER_ID):
                continue
            if _role_of(api, mid) in ("admin", "support", "financeiro"):
                continue
            return m
    pytest.skip("Nenhum recipient elegível encontrado.")


@pytest.fixture(scope="module")
def stranger_member(api, recipient_member):
    """Não participante e não staff."""
    for q in ["Mateus", "Andrea", "RHIAN", "Piu", "Teste", "Joao", "Andre", "Crist", "ROMEU", "Dr Junior", "Thierry"]:
        r = api.get(f"{BASE_URL}/api/pyx/lookup", params={"q": q})
        if r.status_code != 200:
            continue
        for m in r.json():
            mid = m["member_id"]
            if mid in (DEMO_MEMBER_ID, ADMIN_MEMBER_ID, recipient_member["member_id"]):
                continue
            if _role_of(api, mid) in ("admin", "support", "financeiro"):
                continue
            return m
    pytest.skip("Nenhum stranger elegível encontrado.")


@pytest.fixture(scope="module")
def tx(api, recipient_member):
    """Transferência real 100 centavos: ADMIN_MASTER -> recipient (não-staff).
    Usamos ADMIN_MASTER como sender (única conta com senha configurada + role admin).
    Para staff-bypass usaríamos outro admin, mas no DB atual apenas ADMIN_MASTER tem role=admin
    linkado a um member — então o teste de staff bypass ficará como skip documentado."""
    r = api.post(f"{BASE_URL}/api/pyx/transfer", json={
        "from_member_id": ADMIN_MEMBER_ID,
        "to_wallet": recipient_member["wallet_number"],
        "amount_centavos": 100,
        "password": ADMIN_PASSWORD,
        "note": "TEST_etapa4_receipt",
    })
    assert r.status_code == 200, f"Setup falhou ao criar tx: {r.status_code} {r.text}"
    data = r.json()
    assert "tx_id" in data
    return {
        "tx_id": data["tx_id"],
        "from_id": ADMIN_MEMBER_ID,
        "to_id": recipient_member["member_id"],
    }


# ==================== GET /api/pyx/receipt/{tx_id} ====================

class TestReceiptGet:

    def test_receipt_by_sender_returns_200_with_all_fields(self, api, tx):
        r = api.get(f"{BASE_URL}/api/pyx/receipt/{tx['tx_id']}", params={"member_id": tx["from_id"]})
        assert r.status_code == 200, r.text
        d = r.json()
        # Campos essenciais
        for f in ("tx_id", "type", "from_id", "to_id", "amount_centavos", "status", "created_at",
                  "from_info", "to_info"):
            assert f in d, f"Campo ausente: {f}. Payload: {d}"
        assert d["tx_id"] == tx["tx_id"]
        assert d["type"] == "transfer", f"type esperado 'transfer', veio '{d.get('type')}'"
        assert d["from_id"] == tx["from_id"]
        assert d["to_id"] == tx["to_id"]
        assert d["amount_centavos"] == 100
        assert d["status"] == "settled", f"status esperado 'settled', veio '{d.get('status')}'"
        # from_info / to_info
        assert d["from_info"].get("member_id") == tx["from_id"]
        assert d["to_info"].get("member_id") == tx["to_id"]
        assert "tier" in d["from_info"]
        assert "tier" in d["to_info"]
        # wallet numbers presentes na tx (podem estar diretamente em d.from_wallet/to_wallet)
        assert d.get("from_wallet"), f"from_wallet ausente: {d}"
        assert d.get("to_wallet"), f"to_wallet ausente: {d}"
        # não deve conter '_id'
        assert "_id" not in d

    def test_receipt_by_recipient_returns_200(self, api, tx):
        r = api.get(f"{BASE_URL}/api/pyx/receipt/{tx['tx_id']}", params={"member_id": tx["to_id"]})
        assert r.status_code == 200, r.text
        assert r.json()["tx_id"] == tx["tx_id"]

    def test_receipt_nonexistent_returns_404(self, api):
        r = api.get(f"{BASE_URL}/api/pyx/receipt/tx_inexistente_xyz")
        assert r.status_code == 404
        assert "não encontrada" in r.json().get("detail", "").lower()

    def test_receipt_by_stranger_returns_403(self, api, tx, stranger_member):
        r = api.get(f"{BASE_URL}/api/pyx/receipt/{tx['tx_id']}",
                    params={"member_id": stranger_member["member_id"]})
        assert r.status_code == 403, f"Esperava 403 para stranger, veio {r.status_code}: {r.text}"

    def test_receipt_by_staff_admin_returns_200_bypass(self, api, recipient_member):
        """Cria uma tx sintética entre 2 membros NÃO-admin, e valida que ADMIN_MEMBER_ID
        (role=admin) consegue ver via bypass."""
        import pymongo, os as _os, uuid as _uuid
        from datetime import datetime, timezone
        mc = pymongo.MongoClient(_os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        sync_db = mc[_os.environ.get("DB_NAME", "farmaclube_database")]
        # Pega dois membros não-admin diferentes
        others = list(sync_db.members.find(
            {"member_id": {"$nin": [ADMIN_MEMBER_ID]}},
            {"_id": 0, "member_id": 1},
        ).limit(3))
        if len(others) < 2:
            pytest.skip("Não há 2 membros não-admin para criar tx sintética.")
        a, b = others[0]["member_id"], others[1]["member_id"]
        wa = sync_db.wallets.find_one({"member_id": a}, {"_id": 0, "wallet_number": 1}) or {}
        wb = sync_db.wallets.find_one({"member_id": b}, {"_id": 0, "wallet_number": 1}) or {}
        fake_tx_id = f"tx_bypass_{_uuid.uuid4().hex[:8]}"
        try:
            sync_db.wallet_txs.insert_one({
                "tx_id": fake_tx_id, "type": "transfer",
                "from_id": a, "to_id": b,
                "from_wallet": wa.get("wallet_number", ""),
                "to_wallet": wb.get("wallet_number", ""),
                "amount_centavos": 100, "amount": 1.0,
                "status": "settled",
                "created_at": datetime.now(timezone.utc),
                "note": "TEST_etapa4_bypass_synthetic",
            })
            # Admin master (role=admin, não-participante) deve ver
            r = api.get(f"{BASE_URL}/api/pyx/receipt/{fake_tx_id}",
                        params={"member_id": ADMIN_MEMBER_ID})
            assert r.status_code == 200, f"Staff bypass falhou: {r.status_code} {r.text}"
            assert r.json()["tx_id"] == fake_tx_id
        finally:
            sync_db.wallet_txs.delete_one({"tx_id": fake_tx_id})

    def test_receipt_without_member_id_returns_200(self, api, tx):
        """Sem member_id (query param opcional). Endpoint hoje permite (sem validação)."""
        r = api.get(f"{BASE_URL}/api/pyx/receipt/{tx['tx_id']}")
        assert r.status_code == 200, r.text


# ==================== POST DM receipt ====================

class TestDMReceipt:

    def test_dm_send_receipt_persists(self, api, tx):
        me, other = tx["from_id"], tx["to_id"]
        r = api.post(f"{BASE_URL}/api/community/dms/{me}/{other}", json={
            "text": "Comprovante", "kind": "receipt", "tx_id": tx["tx_id"],
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "receipt"
        assert d["tx_id"] == tx["tx_id"]
        assert d["from_id"] == me and d["to_id"] == other
        # Confirma persistência via GET
        r2 = api.get(f"{BASE_URL}/api/community/dms/{me}/{other}")
        assert r2.status_code == 200
        found = [m for m in r2.json() if m.get("dm_id") == d["dm_id"]]
        assert found, "DM comprovante não persistido no thread"
        assert found[0]["kind"] == "receipt"
        assert found[0]["tx_id"] == tx["tx_id"]

    def test_dm_send_receipt_missing_tx_id_returns_400(self, api, tx):
        me, other = tx["from_id"], tx["to_id"]
        r = api.post(f"{BASE_URL}/api/community/dms/{me}/{other}", json={
            "text": "Sem tx_id", "kind": "receipt",
        })
        assert r.status_code == 400, f"Esperava 400, veio {r.status_code}: {r.text}"
        assert "tx_id" in r.json().get("detail", "").lower()

    def test_dm_send_receipt_invalid_tx_id_returns_404(self, api, tx):
        me, other = tx["from_id"], tx["to_id"]
        r = api.post(f"{BASE_URL}/api/community/dms/{me}/{other}", json={
            "text": "x", "kind": "receipt", "tx_id": "tx_inexistente_xyz",
        })
        assert r.status_code == 404, f"Esperava 404, veio {r.status_code}: {r.text}"

    def test_dm_send_receipt_not_participant_returns_403(self, api, tx, stranger_member):
        me = stranger_member["member_id"]
        other = tx["to_id"]
        r = api.post(f"{BASE_URL}/api/community/dms/{me}/{other}", json={
            "text": "x", "kind": "receipt", "tx_id": tx["tx_id"],
        })
        assert r.status_code == 403, f"Esperava 403 (stranger), veio {r.status_code}: {r.text}"

    # ---- Regressão ----
    def test_dm_send_text_regression(self, api, tx):
        me, other = tx["from_id"], tx["to_id"]
        r = api.post(f"{BASE_URL}/api/community/dms/{me}/{other}", json={"text": "oi TEST_etapa4"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "text"
        assert d["text"] == "oi TEST_etapa4"
        assert "tx_id" not in d or d.get("tx_id") in (None, "")


# ==================== Regressão PYX transfer ====================

class TestTransferRegression:

    def test_transfer_missing_password_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json={
            "from_member_id": ADMIN_MEMBER_ID,
            "to_wallet": "PYX-DUMMY0001",
            "amount_centavos": 100,
        })
        assert r.status_code == 401
        assert "senha" in r.json().get("detail", "").lower()

    def test_transfer_wrong_password_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json={
            "from_member_id": ADMIN_MEMBER_ID,
            "to_wallet": "PYX-DUMMY0001",
            "amount_centavos": 100,
            "password": "wrong",
        })
        assert r.status_code == 401
        assert "incorreta" in r.json().get("detail", "").lower()
