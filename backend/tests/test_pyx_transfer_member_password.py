"""
Etapa PYX Transfer Password FIX — validação para membros comuns.

BUG que este arquivo cobre:
    Antes do fix em /api/pyx/transfer (server.py:5115+), a validação da senha
    consultava SOMENTE db.users.password_hash. Membros comuns cadastrados via
    /api/members/enter só têm o hash em db.members.password_hash → o endpoint
    devolvia 401 "Usuário sem senha configurada" mesmo com a senha correta.

Cenários seedados diretamente no Mongo (respeitando helpers do server.py):
    S1: membro comum com senha SÓ em db.members → transfer OK (200)
    S2: mesmo membro, senha errada → 401 (Senha incorreta)
    S3: mesmo membro, sem password → 401 (Senha obrigatória)
    S4: admin master (senha em db.users) → 200 (fallback users.password_hash)
    S5: integridade — saldo debitou/creditou + wallet_tx persistido
    S6: membro com hashes DIFERENTES em members vs users → senha atual valida
        por QUALQUER um dos hashes.

Cleanup: fixture module-scoped que remove authorized/members/wallets/wallet_txs
dos test-doubles ao final.
"""
import os
import uuid
import re
from datetime import datetime, timezone

import bcrypt
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

# Carrega .env do backend para acessar MONGO_URL/DB_NAME
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://member-shop-2.preview.emergentagent.com",
).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "farmaclube_database")

ADMIN_EMAIL = "guilherme925145000@gmail.com"
ADMIN_PASSWORD = "Shakira12@"
ADMIN_MEMBER_ID = "mem_7a9d652945e7"

# ---------- helpers replicando server.py ----------
def normalize_phone(p: str) -> str:
    return re.sub(r"\D+", "", p or "")


def normalize_name(n: str) -> str:
    return re.sub(r"\s+", " ", (n or "").strip().lower())


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def seed_common_member(mongo, api):
    """
    S1/S2/S3 — cria um membro comum via /api/members/enter (fluxo real),
    inserindo antes a fixture correspondente em db.authorized. O membro
    NÃO existirá em db.users (é membro comum, sem staff).
    """
    tag = uuid.uuid4().hex[:6]
    name = f"TEST Comum {tag}"
    phone = f"+55 11 9{tag}0000"
    email = f"test_comum_{tag}@example.com"
    password = "SenhaMembro@123"
    code = "TST"

    nname = normalize_name(name)
    nphone = normalize_phone(phone)

    # 1) Insere authorized (necessário para /api/members/enter aceitar)
    mongo.authorized.insert_one({
        "code": code,
        "name_norm": nname,
        "phone_norm": nphone,
        "tier": "silver",  # silver tem limite mensal > 0 (2000 PYX)
        "parent_name": "TEST Parent",
        "created_at": datetime.now(timezone.utc),
        "_test": True,
    })

    # 2) Registra o membro via API real (cria db.members com password_hash bcrypt)
    r = api.post(f"{BASE_URL}/api/members/enter", json={
        "name": name,
        "phone": phone,
        "email": email,
        "password": password,
        "neighborhood": "TEST",
        "city": "TEST",
        "state": "SP",
        "code": code,
    })
    assert r.status_code == 200, f"Falha no /members/enter: {r.status_code} {r.text}"
    member = r.json()
    member_id = member["member_id"]

    # 3) Confirma que NÃO existe entrada em db.users (membro comum puro)
    #    Se existir por acaso, remove — este cenário exige isolamento total.
    mongo.users.delete_many({"email": email})

    # 4) Confirma que db.members tem password_hash bcrypt
    doc = mongo.members.find_one({"member_id": member_id})
    assert doc and doc.get("password_hash", "").startswith("$2b$"), \
        f"members.password_hash não é bcrypt válido: {doc.get('password_hash')[:10] if doc else None}"

    # 5) Credita saldo no wallet direto no Mongo (100 PYX = 10.000 centavos)
    mongo.wallets.update_one(
        {"member_id": member_id},
        {
            "$set": {"member_id": member_id},
            "$inc": {"balance_centavos": 10_000},
            "$setOnInsert": {
                "balance": 0.0,
                "reserved_centavos": 0,
                "escrow_in": 0.0,
                "escrow_out": 0.0,
                "created_at": datetime.now(timezone.utc),
                "_test": True,
            },
        },
        upsert=True,
    )
    # Garante que _wallet_get_or_create pegue este saldo — força GET
    api.get(f"{BASE_URL}/api/pyx/wallet/{member_id}")

    yield {
        "member_id": member_id,
        "email": email,
        "password": password,
        "name": name,
        "phone": phone,
    }

    # Cleanup — remove tudo criado por este teste
    mongo.authorized.delete_many({"code": code, "name_norm": nname})
    mongo.members.delete_many({"member_id": member_id})
    mongo.wallets.delete_many({"member_id": member_id})
    mongo.wallet_txs.delete_many({
        "$or": [{"from_id": member_id}, {"to_id": member_id}],
    })
    mongo.users.delete_many({"email": email})


@pytest.fixture(scope="module")
def recipient_wallet(api):
    """Um membro qualquer que NÃO seja o comum nem o admin — para receber."""
    # Preferimos admin@farmaclube (staff) mas basta qualquer wallet_number válida
    r = api.get(f"{BASE_URL}/api/pyx/lookup", params={"q": "admin@farmaclube"})
    assert r.status_code == 200
    for m in r.json():
        if m["member_id"] != ADMIN_MEMBER_ID:
            return m
    # Fallback — pega qualquer membro que não seja admin master
    for q in ["demo", "suporte", "financeiro", "TEST"]:
        r = api.get(f"{BASE_URL}/api/pyx/lookup", params={"q": q})
        if r.status_code == 200:
            for m in r.json():
                if m["member_id"] != ADMIN_MEMBER_ID:
                    return m
    pytest.skip("Nenhum destinatário disponível")


# ==================== S1/S2/S3: MEMBRO COMUM ====================
class TestPyxTransferCommonMember:
    """Bug principal — membro comum consegue transferir com sua própria senha."""

    def test_S1_correct_password_returns_200_and_tx_id(
        self, api, seed_common_member, recipient_wallet
    ):
        payload = {
            "from_member_id": seed_common_member["member_id"],
            "to_wallet": recipient_wallet["wallet_number"],
            "amount_centavos": 100,  # 1 PYX
            "password": seed_common_member["password"],
            "note": "TEST_S1_membro_comum",
        }
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json=payload)
        assert r.status_code == 200, (
            f"S1 FALHOU — esperava 200, recebi {r.status_code}: {r.text}"
        )
        data = r.json()
        assert "tx_id" in data and data["tx_id"], f"tx_id ausente: {data}"
        # guarda o tx_id para o teste S5
        pytest.S1_tx_id = data["tx_id"]
        pytest.S1_sender = seed_common_member["member_id"]
        pytest.S1_recipient = recipient_wallet["member_id"]

    def test_S2_wrong_password_returns_401(
        self, api, seed_common_member, recipient_wallet
    ):
        payload = {
            "from_member_id": seed_common_member["member_id"],
            "to_wallet": recipient_wallet["wallet_number"],
            "amount_centavos": 100,
            "password": "senha_errada_qualquer",
        }
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json=payload)
        assert r.status_code == 401, f"esperava 401, recebi {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "senha incorreta" in detail, f"detail inesperado: {detail}"

    def test_S3_missing_password_returns_401(
        self, api, seed_common_member, recipient_wallet
    ):
        payload = {
            "from_member_id": seed_common_member["member_id"],
            "to_wallet": recipient_wallet["wallet_number"],
            "amount_centavos": 100,
            # sem password
        }
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json=payload)
        assert r.status_code == 401, f"esperava 401, recebi {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "senha obrigat" in detail, f"detail inesperado: {detail}"


# ==================== S4: ADMIN MASTER (fallback users) ====================
class TestPyxTransferAdminFallback:
    """Regressão — admin master valida via db.users.password_hash."""

    def test_S4_admin_master_password_returns_200(self, api, recipient_wallet):
        payload = {
            "from_member_id": ADMIN_MEMBER_ID,
            "to_wallet": recipient_wallet["wallet_number"],
            "amount_centavos": 100,
            "password": ADMIN_PASSWORD,
            "note": "TEST_S4_admin_master",
        }
        r = api.post(f"{BASE_URL}/api/pyx/transfer", json=payload)
        assert r.status_code == 200, (
            f"S4 FALHOU — esperava 200, recebi {r.status_code}: {r.text}"
        )
        assert r.json().get("tx_id")


# ==================== S5: INTEGRIDADE (saldo + tx persistido) ====================
class TestPyxTransferIntegrity:
    """Após S1, verifica saldo debitado/creditado e wallet_tx presente."""

    def test_S5_balance_debited_and_tx_persisted(self, api):
        tx_id = getattr(pytest, "S1_tx_id", None)
        sender = getattr(pytest, "S1_sender", None)
        recipient = getattr(pytest, "S1_recipient", None)
        if not (tx_id and sender and recipient):
            pytest.skip("S1 não executou com sucesso — S5 depende dele")

        # Wallet do remetente — saldo é 10.000 - 100 = 9.900
        rw = api.get(f"{BASE_URL}/api/pyx/wallet/{sender}")
        assert rw.status_code == 200, rw.text
        wallet_sender = rw.json()
        assert wallet_sender["balance_centavos"] == 9_900, (
            f"Saldo remetente incorreto: {wallet_sender['balance_centavos']} (esperava 9900)"
        )

        # Extrato do remetente — precisa conter o tx_id emitido
        rt = api.get(f"{BASE_URL}/api/pyx/transactions/{sender}")
        assert rt.status_code == 200, rt.text
        txs = rt.json()
        assert isinstance(txs, list) and len(txs) > 0, "Nenhuma transação no extrato"
        found = [t for t in txs if t.get("tx_id") == tx_id or t.get("wtx_id") == tx_id]
        # Alguns backends usam apenas amount_centavos + from_id/to_id como âncora
        if not found:
            found = [
                t for t in txs
                if t.get("from_id") == sender and t.get("to_id") == recipient
                and int(t.get("amount_centavos") or 0) == 100
            ]
        assert found, f"Transação S1 não encontrada no extrato (tx_id={tx_id}). Amostra: {txs[:2]}"


# ==================== S6: EDGE CASE (2 hashes diferentes) ====================
class TestPyxTransferBothHashes:
    """Edge case — se o membro tem hash em members E users, aceita a senha
    que bater com QUALQUER um deles."""

    def test_S6_matches_users_hash_when_members_hash_is_stale(
        self, mongo, api, recipient_wallet
    ):
        tag = uuid.uuid4().hex[:6]
        name = f"TEST Duplo {tag}"
        phone = f"+55 11 9{tag}1111"
        email = f"test_duplo_{tag}@example.com"
        password_atual = "SenhaAtual@2026"
        password_antiga = "SenhaAntiga@2020"
        code = "TDX"

        nname = normalize_name(name)
        nphone = normalize_phone(phone)

        # authorized fixture
        mongo.authorized.insert_one({
            "code": code, "name_norm": nname, "phone_norm": nphone,
            "tier": "silver", "parent_name": "TEST", "_test": True,
            "created_at": datetime.now(timezone.utc),
        })
        # cria membro com senha ANTIGA em members.password_hash via API
        r = api.post(f"{BASE_URL}/api/members/enter", json={
            "name": name, "phone": phone, "email": email,
            "password": password_antiga,
            "neighborhood": "T", "city": "T", "state": "SP", "code": code,
        })
        assert r.status_code == 200, r.text
        member_id = r.json()["member_id"]

        # cria db.users com senha ATUAL (representando "senha mais recente")
        user_id = f"usr_test_{tag}"
        mongo.users.insert_one({
            "user_id": user_id,
            "email": email,
            "password_hash": hash_password(password_atual),
            "role": "member",
            "_test": True,
            "created_at": datetime.now(timezone.utc),
        })
        # linka member.user_id → users.user_id
        mongo.members.update_one(
            {"member_id": member_id},
            {"$set": {"user_id": user_id}},
        )
        # credita saldo
        mongo.wallets.update_one(
            {"member_id": member_id},
            {"$set": {"member_id": member_id},
             "$inc": {"balance_centavos": 10_000},
             "$setOnInsert": {"created_at": datetime.now(timezone.utc), "_test": True}},
            upsert=True,
        )
        api.get(f"{BASE_URL}/api/pyx/wallet/{member_id}")  # backfill

        try:
            # A) senha ATUAL (bate com users.password_hash) → 200
            r_ok_atual = api.post(f"{BASE_URL}/api/pyx/transfer", json={
                "from_member_id": member_id,
                "to_wallet": recipient_wallet["wallet_number"],
                "amount_centavos": 100,
                "password": password_atual,
                "note": "TEST_S6_atual",
            })
            assert r_ok_atual.status_code == 200, (
                f"S6a FALHOU — senha atual devia funcionar via users.password_hash: "
                f"{r_ok_atual.status_code} {r_ok_atual.text}"
            )

            # B) senha ANTIGA (bate com members.password_hash) → 200
            #    Este é o comportamento tolerante que o fix implementa.
            r_ok_antiga = api.post(f"{BASE_URL}/api/pyx/transfer", json={
                "from_member_id": member_id,
                "to_wallet": recipient_wallet["wallet_number"],
                "amount_centavos": 100,
                "password": password_antiga,
                "note": "TEST_S6_antiga",
            })
            assert r_ok_antiga.status_code == 200, (
                f"S6b FALHOU — senha antiga devia funcionar via members.password_hash: "
                f"{r_ok_antiga.status_code} {r_ok_antiga.text}"
            )

            # C) senha aleatória → 401
            r_bad = api.post(f"{BASE_URL}/api/pyx/transfer", json={
                "from_member_id": member_id,
                "to_wallet": recipient_wallet["wallet_number"],
                "amount_centavos": 100,
                "password": "algo_totalmente_errado",
            })
            assert r_bad.status_code == 401, (
                f"S6c FALHOU — esperava 401, recebi {r_bad.status_code}: {r_bad.text}"
            )
        finally:
            # Cleanup deste sub-teste
            mongo.authorized.delete_many({"code": code, "name_norm": nname})
            mongo.members.delete_many({"member_id": member_id})
            mongo.users.delete_many({"user_id": user_id})
            mongo.wallets.delete_many({"member_id": member_id})
            mongo.wallet_txs.delete_many({
                "$or": [{"from_id": member_id}, {"to_id": member_id}],
            })
