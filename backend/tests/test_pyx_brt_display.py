"""
ETAPA BRT — Timezone oficial de Brasília nos comprovantes PYX.

Cobre:
  - brt_display_fields() aritmética: BRT = UTC - 3h (America/Sao_Paulo sem DST desde 2019).
  - GET /api/pyx/transactions/{member_id} — cada item com created_at >= cutoff
    tem os 5 campos BRT; itens antigos NÃO têm.
  - GET /api/pyx/receipt/{tx_id} — mesmo comportamento (novo vs antigo).
  - POST /api/pyx/transfer (Master Admin) → se created_at do tx >= cutoff, campos BRT presentes.
  - Regressão: campos antigos (tx_id, from_id, to_id, amount_centavos, created_at, from_info, to_info)
    permanecem intactos.

Cutoff: 2026-07-20 03:00:00 UTC (BRT_ENFORCEMENT_TS em server.py).
"""
import os
import re
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or "https://member-shop-2.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "farmaclube_database")

ADMIN_EMAIL = "guilherme925145000@gmail.com"
ADMIN_PASSWORD = "Shakira12@"
ADMIN_MEMBER_ID = "mem_7a9d652945e7"

# Cutoff replicado do server.py
CUTOFF_UTC = datetime(2026, 7, 20, 3, 0, 0, tzinfo=timezone.utc)

BRT_FIELDS = {
    "created_at_brt",
    "display_date_brt",
    "display_time_brt",
    "display_datetime_brt",
    "display_tz_brt",
}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def recipient_wallet(api):
    r = api.get(f"{BASE_URL}/api/pyx/lookup", params={"q": "demo"})
    assert r.status_code == 200
    for m in r.json():
        if m["member_id"] != ADMIN_MEMBER_ID:
            return m
    pytest.skip("Nenhum destinatário disponível")


@pytest.fixture(scope="module")
def synthetic_txs(mongo):
    """Insere 2 transações sintéticas para testar ambos os cenários:
       - NEW: created_at bem depois do cutoff (fixo, previsível)
       - OLD: created_at bem antes do cutoff
    Retorna dict com os tx_ids e limpa no teardown.
    """
    # NEW: 2026-07-20 06:00:00 UTC → BRT esperado: 2026-07-20 03:00:00 -03:00
    new_created = datetime(2026, 7, 20, 6, 0, 0, tzinfo=timezone.utc)
    old_created = datetime(2026, 5, 10, 12, 30, 45, tzinfo=timezone.utc)

    new_tx_id = f"tx_brtnew_{uuid.uuid4().hex[:8]}"
    old_tx_id = f"tx_brtold_{uuid.uuid4().hex[:8]}"

    base = {
        "type": "transfer",
        "from_id": ADMIN_MEMBER_ID,
        "to_id": "mem_e5bb9b5878dd",
        "from_wallet": "PYX-TESTBRT",
        "to_wallet": "PYX-TESTBRT2",
        "amount_centavos": 100,
        "amount": 1.0,
        "status": "settled",
        "note": "TEST_brt_synthetic",
    }
    mongo.wallet_txs.insert_one({**base, "tx_id": new_tx_id, "created_at": new_created,
                                 "settled_at": new_created})
    mongo.wallet_txs.insert_one({**base, "tx_id": old_tx_id, "created_at": old_created,
                                 "settled_at": old_created})

    yield {
        "new_tx_id": new_tx_id,
        "old_tx_id": old_tx_id,
        "new_created": new_created,
        "old_created": old_created,
    }

    mongo.wallet_txs.delete_many({"tx_id": {"$in": [new_tx_id, old_tx_id]}})


# ==================== 1. Helper aritmética (via endpoint) ====================
class TestBRTArithmetic:
    """Valida que BRT = UTC - 3h no formato retornado pelo endpoint."""

    def test_new_tx_receipt_has_correct_brt_offset(self, api, synthetic_txs):
        tx_id = synthetic_txs["new_tx_id"]
        r = api.get(f"{BASE_URL}/api/pyx/receipt/{tx_id}",
                    params={"member_id": ADMIN_MEMBER_ID})
        assert r.status_code == 200, r.text
        d = r.json()
        # Todos os 5 campos BRT devem estar presentes
        missing = BRT_FIELDS - set(d.keys())
        assert not missing, f"Campos BRT ausentes na tx nova: {missing}. Payload: {d}"

        # UTC = 2026-07-20T06:00 → BRT = 2026-07-20T03:00 -03:00
        assert d["display_date_brt"] == "20/07/2026", d["display_date_brt"]
        assert d["display_time_brt"] == "03:00:00", d["display_time_brt"]
        assert d["display_datetime_brt"] == "20/07/2026 03:00:00", d["display_datetime_brt"]
        assert d["display_tz_brt"] == "America/Sao_Paulo"

        iso = d["created_at_brt"]
        # ISO deve conter offset -03:00
        assert iso.endswith("-03:00"), f"ISO BRT sem offset -03:00: {iso}"
        # E deve começar com 2026-07-20T03:00:00
        assert iso.startswith("2026-07-20T03:00:00"), iso


# ==================== 2. Tx antigas NÃO devem ter campos BRT ====================
class TestOldTxHasNoBRT:
    def test_old_tx_receipt_has_no_brt_fields(self, api, synthetic_txs):
        tx_id = synthetic_txs["old_tx_id"]
        r = api.get(f"{BASE_URL}/api/pyx/receipt/{tx_id}",
                    params={"member_id": ADMIN_MEMBER_ID})
        assert r.status_code == 200, r.text
        d = r.json()
        present = BRT_FIELDS & set(d.keys())
        assert not present, (
            f"Tx antiga (created_at={synthetic_txs['old_created']}) "
            f"NÃO deveria conter campos BRT, mas contém: {present}"
        )
        # Campos preexistentes ainda presentes
        for f in ("tx_id", "from_id", "to_id", "amount_centavos", "created_at",
                  "from_info", "to_info"):
            assert f in d, f"Campo preexistente ausente na tx antiga: {f}"


# ==================== 3. Extrato — cada item respeita cutoff ====================
class TestTransactionsListPerItemBRT:
    def test_transactions_list_flags_new_vs_old_per_item(self, api, synthetic_txs):
        # Puxa um limite grande p/ garantir que as duas sintéticas aparecem
        r = api.get(f"{BASE_URL}/api/pyx/transactions/{ADMIN_MEMBER_ID}",
                    params={"limit": 200})
        assert r.status_code == 200, r.text
        txs = r.json()
        assert isinstance(txs, list) and txs, "Extrato vazio"

        by_id = {t["tx_id"]: t for t in txs}
        new_item = by_id.get(synthetic_txs["new_tx_id"])
        old_item = by_id.get(synthetic_txs["old_tx_id"])
        assert new_item is not None, "Tx nova sintética não apareceu no extrato"
        assert old_item is not None, "Tx antiga sintética não apareceu no extrato"

        # NEW → tem os 5 campos
        missing = BRT_FIELDS - set(new_item.keys())
        assert not missing, f"Extrato: tx nova sem campos BRT: {missing}. Item: {new_item}"
        assert new_item["display_date_brt"] == "20/07/2026"
        assert new_item["display_time_brt"] == "03:00:00"

        # OLD → NÃO tem nenhum dos 5 campos
        present = BRT_FIELDS & set(old_item.keys())
        assert not present, f"Extrato: tx antiga NÃO deveria ter campos BRT: {present}"

    def test_all_items_consistent_with_cutoff(self, api):
        """Para toda tx do extrato: se created_at >= cutoff, tem BRT; senão, não tem."""
        r = api.get(f"{BASE_URL}/api/pyx/transactions/{ADMIN_MEMBER_ID}",
                    params={"limit": 200})
        assert r.status_code == 200
        for t in r.json():
            ca_raw = t.get("created_at")
            if not ca_raw:
                continue
            # created_at pode vir como ISO string
            if isinstance(ca_raw, str):
                # Normaliza: tira 'Z' se houver, força UTC se sem tz
                s = ca_raw.replace("Z", "+00:00")
                try:
                    ca = datetime.fromisoformat(s)
                except ValueError:
                    continue
            else:
                ca = ca_raw
            if ca.tzinfo is None:
                ca = ca.replace(tzinfo=timezone.utc)

            has_brt = bool(BRT_FIELDS & set(t.keys()))
            if ca >= CUTOFF_UTC:
                assert has_brt, (
                    f"tx {t.get('tx_id')} created_at={ca.isoformat()} >= cutoff "
                    f"mas SEM campos BRT"
                )
            else:
                assert not has_brt, (
                    f"tx {t.get('tx_id')} created_at={ca.isoformat()} < cutoff "
                    f"mas COM campos BRT: {BRT_FIELDS & set(t.keys())}"
                )


# ==================== 4. Real POST /api/pyx/transfer ====================
class TestRealTransferBRT:
    """Cria uma tx REAL via /api/pyx/transfer e valida o comprovante.
    Se created_at do backend for < cutoff (relógio atual antes de 03:00 UTC),
    valida ausência dos campos BRT. Caso contrário, valida presença + aritmética."""

    def test_real_transfer_receipt_matches_cutoff_policy(
        self, api, recipient_wallet
    ):
        payload = {
            "from_member_id": ADMIN_MEMBER_ID,
            "to_wallet": recipient_wallet["wallet_number"],
            "amount_centavos": 100,
            "password": ADMIN_PASSWORD,
            "note": "TEST_brt_real_transfer",
        }
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json=payload)
        assert r.status_code == 200, r.text
        tx_id = r.json().get("tx_id")
        assert tx_id

        r2 = api.get(f"{BASE_URL}/api/pyx/receipt/{tx_id}",
                     params={"member_id": ADMIN_MEMBER_ID})
        assert r2.status_code == 200, r2.text
        d = r2.json()

        # Parse created_at do backend
        ca_raw = d["created_at"]
        if isinstance(ca_raw, str):
            ca = datetime.fromisoformat(ca_raw.replace("Z", "+00:00"))
        else:
            ca = ca_raw
        if ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)

        has_brt = bool(BRT_FIELDS & set(d.keys()))

        if ca >= CUTOFF_UTC:
            assert has_brt, (
                f"tx real created_at={ca.isoformat()} >= cutoff mas SEM campos BRT: {d}"
            )
            missing = BRT_FIELDS - set(d.keys())
            assert not missing, f"Faltam campos BRT: {missing}"
            # Aritmética: BRT = UTC - 3h
            expected_local = ca.astimezone(timezone(timedelta(hours=-3)))
            assert d["display_date_brt"] == expected_local.strftime("%d/%m/%Y")
            assert d["display_time_brt"] == expected_local.strftime("%H:%M:%S")
            assert d["display_datetime_brt"] == expected_local.strftime("%d/%m/%Y %H:%M:%S")
            assert d["display_tz_brt"] == "America/Sao_Paulo"
            assert d["created_at_brt"].endswith("-03:00")
        else:
            assert not has_brt, (
                f"tx real created_at={ca.isoformat()} < cutoff "
                f"mas contém campos BRT: {BRT_FIELDS & set(d.keys())}. "
                f"Cutoff={CUTOFF_UTC.isoformat()}"
            )


# ==================== 5. Regressão de campos ====================
class TestRegression:
    def test_transactions_endpoint_returns_200_with_core_fields(self, api):
        r = api.get(f"{BASE_URL}/api/pyx/transactions/{ADMIN_MEMBER_ID}",
                    params={"limit": 5})
        assert r.status_code == 200
        txs = r.json()
        assert isinstance(txs, list) and txs
        for t in txs:
            for f in ("tx_id", "from_id", "to_id", "amount_centavos", "created_at"):
                assert f in t, f"campo essencial ausente: {f}"
            assert "_id" not in t

    def test_receipt_endpoint_returns_200_with_from_info_to_info(
        self, api, synthetic_txs
    ):
        # Uso a tx antiga p/ garantir que from_info/to_info continuam sendo enriquecidos
        r = api.get(f"{BASE_URL}/api/pyx/receipt/{synthetic_txs['old_tx_id']}",
                    params={"member_id": ADMIN_MEMBER_ID})
        assert r.status_code == 200
        d = r.json()
        for f in ("tx_id", "from_id", "to_id", "amount_centavos", "created_at",
                  "from_info", "to_info"):
            assert f in d
        assert "_id" not in d
