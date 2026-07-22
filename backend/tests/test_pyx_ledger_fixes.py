"""
Backend tests for PYX ledger fixes (iteration 17).

Covers:
- FIX 1: POST /api/wallet/withdraw — atomic conditional debit on balance_centavos
- FIX 2: POST /api/pyx/transfer — atomic conditional debit + concurrency safety
- FIX 3: POST /api/pyx/pix-orders/{order_id}/approve — idempotent claim (no double credit)
- FIX 4: POST /api/staff/team/{user_id}/password — master admin blocked, support works
- Regressions: staff login, member login, /api/ads enrichment (seller_nickname/seller_tier)
"""
import os
import uuid
import asyncio
import bcrypt
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or "https://member-shop-2.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "farmaclube_database")

ADMIN_EMAIL = "guilherme925145000@gmail.com"
ADMIN_PASSWORD = "Shakira12@"


# ------------ Fixtures ------------

@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Master admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


@pytest.fixture()
def test_member(mongo):
    """Creates a TEST member (tier=diamond) with wallet balance_centavos=100000 (1000 PYX).
    Password: TestPass123!. Cleaned up on teardown."""
    mid = f"mbr_test_{uuid.uuid4().hex[:10]}"
    email = f"test_{uuid.uuid4().hex[:8]}@blacksclub.com"
    wallet_num = f"PYX-{uuid.uuid4().hex[:8].upper()}"
    pw_hash = _hash_pw("TestPass123!")
    mongo.members.insert_one({
        "member_id": mid,
        "email": email,
        "name": "TEST Member",
        "nickname": "TESTUSR",
        "tier": "diamond",
        "password_hash": pw_hash,
        "invite_code": f"TESTINV_{uuid.uuid4().hex[:10]}",
        "created_at": datetime.now(timezone.utc),
    })
    mongo.wallets.insert_one({
        "member_id": mid,
        "wallet_number": wallet_num,
        "balance": 1000.0,
        "balance_centavos": 100000,
        "reserved_centavos": 0,
        "escrow_in": 0.0,
        "escrow_out": 0.0,
        "created_at": datetime.now(timezone.utc),
    })
    yield {"member_id": mid, "email": email, "password": "TestPass123!", "wallet_number": wallet_num}
    # teardown
    mongo.members.delete_one({"member_id": mid})
    mongo.wallets.delete_one({"member_id": mid})
    mongo.wallet_txs.delete_many({"$or": [{"from_id": mid}, {"to_id": mid}]})


@pytest.fixture()
def test_recipient(mongo):
    mid = f"mbr_test_{uuid.uuid4().hex[:10]}"
    wallet_num = f"PYX-{uuid.uuid4().hex[:8].upper()}"
    mongo.members.insert_one({
        "member_id": mid,
        "email": f"rcpt_{uuid.uuid4().hex[:6]}@blacksclub.com",
        "name": "TEST Recipient",
        "nickname": "RCPT",
        "tier": "diamond",
        "invite_code": f"TESTINV_{uuid.uuid4().hex[:10]}",
        "created_at": datetime.now(timezone.utc),
    })
    mongo.wallets.insert_one({
        "member_id": mid,
        "wallet_number": wallet_num,
        "balance": 0.0,
        "balance_centavos": 0,
        "reserved_centavos": 0,
        "escrow_in": 0.0,
        "escrow_out": 0.0,
        "created_at": datetime.now(timezone.utc),
    })
    yield {"member_id": mid, "wallet_number": wallet_num}
    mongo.members.delete_one({"member_id": mid})
    mongo.wallets.delete_one({"member_id": mid})
    mongo.wallet_txs.delete_many({"$or": [{"from_id": mid}, {"to_id": mid}]})


# =============================================================================
# FIX 1 — POST /api/wallet/withdraw (atomic conditional debit)
# =============================================================================

class TestWithdrawFix:
    def test_withdraw_valid_debits_exactly_balance_centavos(self, mongo, admin_headers, test_member):
        mid = test_member["member_id"]
        # initial: 100000 centavos (1000 PYX)
        r = requests.post(f"{API}/wallet/withdraw",
                          json={"member_id": mid, "amount": 150.5},  # 15050 centavos
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, f"withdraw failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["type"] == "withdraw"
        assert data["amount_centavos"] == 15050
        assert data["amount"] == 150.5
        assert data["from_id"] == mid
        assert data["status"] == "settled"

        w = mongo.wallets.find_one({"member_id": mid})
        assert w["balance_centavos"] == 100000 - 15050 == 84950
        # legacy balance field is mirrored
        assert abs(w["balance"] - (1000.0 - 150.5)) < 0.001

        # wallet_tx recorded
        tx = mongo.wallet_txs.find_one({"from_id": mid, "type": "withdraw"})
        assert tx is not None
        assert tx["amount_centavos"] == 15050

    def test_withdraw_insufficient_returns_400_no_balance_change(self, mongo, admin_headers, test_member):
        mid = test_member["member_id"]
        before = mongo.wallets.find_one({"member_id": mid})
        r = requests.post(f"{API}/wallet/withdraw",
                          json={"member_id": mid, "amount": 999999.99},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "insuficiente" in r.text.lower() or "insufficient" in r.text.lower()
        after = mongo.wallets.find_one({"member_id": mid})
        assert after["balance_centavos"] == before["balance_centavos"], "balance must NOT change on insufficient"
        assert after["balance"] == before["balance"]

    def test_withdraw_invalid_amount_returns_400(self, admin_headers, test_member):
        r = requests.post(f"{API}/wallet/withdraw",
                          json={"member_id": test_member["member_id"], "amount": 0},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 400


# =============================================================================
# FIX 2 — POST /api/pyx/transfer (atomic conditional debit + concurrency)
# =============================================================================

class TestTransferFix:
    def test_transfer_roundtrip_normal(self, mongo, test_member, test_recipient):
        payload = {
            "from_member_id": test_member["member_id"],
            "to_wallet": test_recipient["wallet_number"],
            "amount_centavos": 25000,  # 250 PYX
            "password": test_member["password"],
            "note": "TEST transfer",
        }
        r = requests.post(f"{API}/pyx/transfer", json=payload, timeout=15)
        assert r.status_code == 200, f"transfer failed: {r.status_code} {r.text}"
        tx = r.json()
        assert tx["type"] == "transfer"
        assert tx["amount_centavos"] == 25000
        assert tx["status"] == "settled"

        wf = mongo.wallets.find_one({"member_id": test_member["member_id"]})
        wt = mongo.wallets.find_one({"member_id": test_recipient["member_id"]})
        assert wf["balance_centavos"] == 100000 - 25000 == 75000
        assert wt["balance_centavos"] == 25000

    def test_transfer_concurrency_exactly_one_succeeds(self, mongo, test_member, test_recipient):
        """Fire 2 concurrent transfers each for FULL balance (100000). Exactly ONE succeeds."""
        # Ensure wallet balance is exactly 100000
        mongo.wallets.update_one(
            {"member_id": test_member["member_id"]},
            {"$set": {"balance_centavos": 100000, "balance": 1000.0}},
        )

        # Need a second recipient to make transfers distinct-ish (same recipient OK too)
        rid2 = f"mbr_test_{uuid.uuid4().hex[:10]}"
        wnum2 = f"PYX-{uuid.uuid4().hex[:8].upper()}"
        mongo.members.insert_one({
            "member_id": rid2, "email": f"r2_{uuid.uuid4().hex[:6]}@blacksclub.com",
            "name": "R2", "nickname": "R2", "tier": "diamond",
            "invite_code": f"TESTINV_{uuid.uuid4().hex[:10]}",
            "created_at": datetime.now(timezone.utc),
        })
        mongo.wallets.insert_one({
            "member_id": rid2, "wallet_number": wnum2, "balance": 0.0,
            "balance_centavos": 0, "reserved_centavos": 0,
            "escrow_in": 0.0, "escrow_out": 0.0,
            "created_at": datetime.now(timezone.utc),
        })

        payload_base = {
            "from_member_id": test_member["member_id"],
            "amount_centavos": 100000,  # FULL balance
            "password": test_member["password"],
        }

        async def _fire(to_wallet):
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None,
                lambda: requests.post(f"{API}/pyx/transfer",
                                      json={**payload_base, "to_wallet": to_wallet},
                                      timeout=20),
            )

        async def _run():
            return await asyncio.gather(
                _fire(test_recipient["wallet_number"]),
                _fire(wnum2),
                return_exceptions=True,
            )

        try:
            results = asyncio.run(_run())
            statuses = [(r.status_code, r.text[:120]) if hasattr(r, "status_code") else ("EXC", str(r)) for r in results]
            print(f"Concurrent transfer statuses: {statuses}")
            succ = sum(1 for r in results if hasattr(r, "status_code") and r.status_code == 200)
            fail_400 = sum(1 for r in results if hasattr(r, "status_code") and r.status_code == 400)
            assert succ == 1, f"Expected exactly 1 success, got {succ}. Statuses: {statuses}"
            assert fail_400 == 1, f"Expected exactly 1 400-insufficient, got {fail_400}. Statuses: {statuses}"

            wf = mongo.wallets.find_one({"member_id": test_member["member_id"]})
            assert wf["balance_centavos"] == 0, f"Sender balance must be 0, got {wf['balance_centavos']}"
            assert wf["balance_centavos"] >= 0, "balance must NEVER be negative"
        finally:
            mongo.members.delete_one({"member_id": rid2})
            mongo.wallets.delete_one({"member_id": rid2})
            mongo.wallet_txs.delete_many({"$or": [{"from_id": rid2}, {"to_id": rid2}]})


# =============================================================================
# FIX 3 — POST /api/pyx/pix-orders/{order_id}/approve (idempotent claim)
# =============================================================================

class TestPixOrderApproveFix:
    def test_double_approve_no_double_credit(self, mongo, admin_headers, test_member):
        mid = test_member["member_id"]
        order_id = f"ord_TEST_{uuid.uuid4().hex[:8]}"
        mongo.pix_orders.insert_one({
            "order_id": order_id,
            "member_id": mid,
            "pyx_centavos": 5000,  # 50 PYX
            "status": "pending",
            "created_at": datetime.now(timezone.utc),
        })
        try:
            before = mongo.wallets.find_one({"member_id": mid})["balance_centavos"]

            r1 = requests.post(f"{API}/pyx/pix-orders/{order_id}/approve",
                               json={"note": "1st"}, headers=admin_headers, timeout=15)
            assert r1.status_code == 200, f"first approve failed: {r1.status_code} {r1.text}"
            d1 = r1.json()
            assert d1.get("ok") is True

            r2 = requests.post(f"{API}/pyx/pix-orders/{order_id}/approve",
                               json={"note": "2nd"}, headers=admin_headers, timeout=15)
            assert r2.status_code == 200
            d2 = r2.json()
            assert d2.get("ok") is True
            # second call must NOT credit again
            assert d2.get("already") == "approved", f"Second call must return already=approved, got {d2}"

            after = mongo.wallets.find_one({"member_id": mid})["balance_centavos"]
            assert after == before + 5000, f"balance must be credited exactly ONCE. before={before} after={after}"

            # Only 1 wallet_tx for this order
            txs = list(mongo.wallet_txs.find({"ref_pix_order_id": order_id}))
            assert len(txs) == 1, f"Expected exactly 1 wallet_tx for order {order_id}, got {len(txs)}"
        finally:
            mongo.pix_orders.delete_one({"order_id": order_id})
            mongo.wallet_txs.delete_many({"ref_pix_order_id": order_id})


# =============================================================================
# FIX 4 — POST /api/staff/team/{user_id}/password
# =============================================================================

class TestStaffPasswordChangeFix:
    def test_change_master_password_blocked(self, admin_headers):
        # find master user_id
        r = requests.get(f"{API}/staff/team", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        team = r.json()["team"]
        master = next((u for u in team if (u.get("email") or "").lower() == ADMIN_EMAIL.lower()), None)
        assert master is not None, "master admin not found in staff/team list"
        master_uid = master["user_id"]

        r2 = requests.post(f"{API}/staff/team/{master_uid}/password",
                           json={"new_password": "NewMaster123!"},
                           headers=admin_headers, timeout=15)
        assert r2.status_code == 400, f"expected 400 for master password change, got {r2.status_code}: {r2.text}"
        detail = r2.json().get("detail", "")
        assert ".env" in detail or "Master" in detail or "master" in detail, f"detail should mention .env/Master: {detail}"

        # Verify master can still login with original password
        r3 = requests.post(f"{API}/auth/login",
                           json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r3.status_code == 200, "Master login broken after blocked password change"

    def test_change_support_password_works(self, mongo, admin_headers):
        # Create a TEST support user, change its password, restore.
        uid = f"user_{uuid.uuid4().hex[:12]}"
        email = f"support_{uuid.uuid4().hex[:6]}@blacksclub.com"
        orig_pw = "OrigSupport123!"
        mongo.users.insert_one({
            "user_id": uid,
            "email": email,
            "name": "TEST Support",
            "role": "support",
            "password_hash": _hash_pw(orig_pw),
            "active": True,
            "created_at": datetime.now(timezone.utc),
        })
        try:
            new_pw = "NewSupport456!"
            r = requests.post(f"{API}/staff/team/{uid}/password",
                              json={"new_password": new_pw},
                              headers=admin_headers, timeout=15)
            assert r.status_code == 200, f"support pw change failed: {r.status_code} {r.text}"
            assert r.json().get("ok") is True

            # Verify the new password actually works via login
            r2 = requests.post(f"{API}/auth/login",
                               json={"email": email, "password": new_pw}, timeout=15)
            assert r2.status_code == 200, f"login with new pw failed: {r2.status_code} {r2.text}"

            # Old password should fail
            r3 = requests.post(f"{API}/auth/login",
                               json={"email": email, "password": orig_pw}, timeout=15)
            assert r3.status_code in (401, 403), f"old pw should be rejected, got {r3.status_code}"
        finally:
            mongo.users.delete_one({"user_id": uid})


# =============================================================================
# REGRESSIONS
# =============================================================================

class TestRegressions:
    def test_staff_login_master(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert "token" in r.json()

    def test_members_login_master(self):
        r = requests.post(f"{API}/members/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200, f"member login failed: {r.status_code} {r.text}"
        data = r.json()
        # member login returns member payload
        assert "member" in data or "token" in data or "member_id" in data

    def test_ads_enrichment(self):
        r = requests.get(f"{API}/ads", timeout=15)
        assert r.status_code == 200
        ads = r.json()
        assert isinstance(ads, list)
        if not ads:
            pytest.skip("No active ads present to validate enrichment")
        # At least one ad should have seller_nickname / seller_tier filled
        with_enrichment = [a for a in ads if a.get("seller_nickname") and a.get("seller_tier")]
        assert len(with_enrichment) > 0, f"No ads enriched with seller_nickname/tier. Sample: {ads[0]}"
