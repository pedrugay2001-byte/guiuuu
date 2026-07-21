"""
Iteration 16 — Auth cleanup migration + PYX smoke + full transfer round-trip.

Scope (from review_request):
  1. Master admin login via /api/auth/login (JWT role=admin)
  2. Legacy admin admin@farmaclube.com must return 401 (removed by seed_admin)
  3. Unified login: /api/members/login accepts master admin creds
  4. Suporte staff login still works
  5. Financeiro staff login still works
  6. DB state: exactly ONE admin in db.users
  7. PYX smoke: /pyx/rate, /pyx/wallet/{luis}, /pyx/transfer/limits/{luis}
  8. Full PYX transfer round-trip 1 PYX (100 centavos) Luis -> Piu Luis
     with password Shakira12@, verifying tx persisted + balances updated.
"""
import os
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") \
    if os.environ.get("EXPO_PUBLIC_BACKEND_URL") \
    else "https://member-shop-2.preview.emergentagent.com"

MASTER_EMAIL = "guilherme925145000@gmail.com"
MASTER_PASSWORD = "Shakira12@"
LEGACY_EMAIL = "admin@farmaclube.com"
SUPPORT_EMAIL = "suporte@blacksclub.com"
SUPPORT_PASSWORD = "suporte123"
FIN_EMAIL = "financeiro@blacksclub.com"
FIN_PASSWORD = "financeiro123"

LUIS_MEMBER_ID = "mem_7a9d652945e7"       # Luis Guilherme (master admin as member)
PIU_MEMBER_ID = "mem_0bfdc078112d"        # Piu Luis (destinatário para transfer)


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- 1. Master admin login ----------
class TestMasterAdminLogin:
    def test_master_admin_login_returns_admin_jwt(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": MASTER_EMAIL, "password": MASTER_PASSWORD})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 20
        assert body["user"]["email"] == MASTER_EMAIL
        assert body["user"]["role"] == "admin"

    def test_master_admin_login_wrong_password(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": MASTER_EMAIL, "password": "wrong-pass"})
        assert r.status_code == 401


# ---------- 2. Legacy admin removed ----------
class TestLegacyAdminRemoved:
    def test_legacy_admin_login_denied(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": LEGACY_EMAIL, "password": "anything"})
        assert r.status_code == 401
        # Extra check: some very common historical password
        r2 = s.post(f"{BASE_URL}/api/auth/login",
                    json={"email": LEGACY_EMAIL, "password": "admin123"})
        assert r2.status_code == 401


# ---------- 3. Unified members/login ----------
class TestUnifiedMemberLogin:
    def test_master_admin_can_login_as_member(self, s):
        r = s.post(f"{BASE_URL}/api/members/login",
                   json={"email": MASTER_EMAIL, "password": MASTER_PASSWORD})
        assert r.status_code == 200, r.text
        body = r.json()
        # Member data must be present
        assert body.get("email") == MASTER_EMAIL
        assert body.get("member_id") == LUIS_MEMBER_ID
        # staff_token should be present because master is also in db.users as admin
        assert body.get("staff_token"), "staff_token missing on unified login"
        assert body.get("staff_user"), "staff_user missing on unified login"
        assert body["staff_user"].get("role") == "admin"


# ---------- 4 & 5. Staff logins untouched ----------
class TestStaffLogins:
    def test_support_login(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": SUPPORT_EMAIL, "password": SUPPORT_PASSWORD})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "support"

    def test_financeiro_login(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": FIN_EMAIL, "password": FIN_PASSWORD})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "financeiro"


# ---------- 6. DB state: exactly one admin ----------
class TestAdminSingletonInDB:
    def test_only_one_admin_in_users_collection(self):
        async def _check():
            c = AsyncIOMotorClient("mongodb://localhost:27017")
            db = c["farmaclube_database"]
            admins = await db.users.find(
                {"role": "admin"},
                {"_id": 0, "email": 1, "user_id": 1, "role": 1, "active": 1},
            ).to_list(50)
            return admins
        admins = asyncio.get_event_loop().run_until_complete(_check())
        assert len(admins) == 1, f"Expected exactly 1 admin, found {len(admins)}: {admins}"
        assert admins[0]["email"] == MASTER_EMAIL
        assert admins[0]["role"] == "admin"
        # Ensure legacy is absent
        emails = [a["email"] for a in admins]
        assert LEGACY_EMAIL not in emails


# ---------- 7. PYX smoke ----------
class TestPyxSmoke:
    def test_pyx_rate(self, s):
        r = s.get(f"{BASE_URL}/api/pyx/rate")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "pyx_per_usd_centavos" in body
        assert isinstance(body["pyx_per_usd_centavos"], int)
        assert body["pyx_per_usd_centavos"] > 0

    def test_pyx_wallet_luis(self, s):
        r = s.get(f"{BASE_URL}/api/pyx/wallet/{LUIS_MEMBER_ID}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("member_id") == LUIS_MEMBER_ID
        assert "balance_centavos" in body
        assert isinstance(body["balance_centavos"], int)
        assert "wallet_number" in body

    def test_pyx_transfer_limits_luis(self, s):
        r = s.get(f"{BASE_URL}/api/pyx/transfer/limits/{LUIS_MEMBER_ID}")
        assert r.status_code == 200, r.text
        body = r.json()
        # Luis is admin (staff) → unlimited per implementation (-1) OR high value
        assert "monthly_limit_centavos" in body or "limit_centavos" in body or "monthly_limit" in body


# ---------- 8. Full PYX transfer round-trip ----------
class TestPyxTransferRoundTrip:
    def _get_balance(self, s, mid):
        r = s.get(f"{BASE_URL}/api/pyx/wallet/{mid}")
        assert r.status_code == 200
        return int(r.json().get("balance_centavos") or 0)

    def test_transfer_1_pyx_luis_to_piu_and_verify(self, s):
        AMOUNT = 100  # centavos = 1.00 PYX

        # Snapshot balances
        bal_luis_before = self._get_balance(s, LUIS_MEMBER_ID)
        bal_piu_before = self._get_balance(s, PIU_MEMBER_ID)

        # Ensure Luis has enough balance
        assert bal_luis_before >= AMOUNT, f"Luis balance too low: {bal_luis_before}"

        # Execute transfer
        r = s.post(
            f"{BASE_URL}/api/pyx/transfer",
            json={
                "from_member_id": LUIS_MEMBER_ID,
                "to_member_id": PIU_MEMBER_ID,
                "amount_centavos": AMOUNT,
                "password": MASTER_PASSWORD,
                "note": "TEST_iteration16_auth_cleanup",
            },
        )
        assert r.status_code == 200, f"Transfer failed: {r.status_code} {r.text}"
        tx = r.json()
        assert tx.get("type") == "transfer"
        assert tx.get("status") == "settled"
        assert tx.get("amount_centavos") == AMOUNT
        assert tx.get("from_id") == LUIS_MEMBER_ID
        assert tx.get("to_id") == PIU_MEMBER_ID
        tx_id = tx.get("tx_id")
        assert tx_id and tx_id.startswith("tx_")

        # Verify DB persistence: tx exists in wallet_txs
        async def _fetch_tx_and_balances():
            c = AsyncIOMotorClient("mongodb://localhost:27017")
            db = c["farmaclube_database"]
            doc = await db.wallet_txs.find_one({"tx_id": tx_id}, {"_id": 0})
            wf = await db.wallets.find_one({"member_id": LUIS_MEMBER_ID}, {"_id": 0})
            wt = await db.wallets.find_one({"member_id": PIU_MEMBER_ID}, {"_id": 0})
            return doc, wf, wt
        doc, wf, wt = asyncio.get_event_loop().run_until_complete(_fetch_tx_and_balances())
        assert doc is not None, "tx not persisted in db.wallet_txs"
        assert doc["amount_centavos"] == AMOUNT
        assert doc["status"] == "settled"
        assert doc["from_id"] == LUIS_MEMBER_ID
        assert doc["to_id"] == PIU_MEMBER_ID

        # Verify balances updated in db.wallets (source of truth)
        bal_luis_after = int(wf.get("balance_centavos") or 0)
        bal_piu_after = int(wt.get("balance_centavos") or 0)
        assert bal_luis_after == bal_luis_before - AMOUNT, \
            f"Luis wallet not decremented correctly: before={bal_luis_before} after={bal_luis_after}"
        assert bal_piu_after == bal_piu_before + AMOUNT, \
            f"Piu wallet not incremented correctly: before={bal_piu_before} after={bal_piu_after}"

        # Verify API also returns the new balance
        bal_luis_api = self._get_balance(s, LUIS_MEMBER_ID)
        bal_piu_api = self._get_balance(s, PIU_MEMBER_ID)
        assert bal_luis_api == bal_luis_after
        assert bal_piu_api == bal_piu_after

    def test_transfer_wrong_password_denied(self, s):
        r = s.post(
            f"{BASE_URL}/api/pyx/transfer",
            json={
                "from_member_id": LUIS_MEMBER_ID,
                "to_member_id": PIU_MEMBER_ID,
                "amount_centavos": 100,
                "password": "wrong-pass-XYZ",
                "note": "TEST_wrong_pw",
            },
        )
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
