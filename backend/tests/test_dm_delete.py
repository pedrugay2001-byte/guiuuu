"""
BLACKSCLUB — Etapa 1 refactoring: DM chat delete tests.

Covers:
- DELETE /api/community/dms/{me}/{other}/message/{dm_id}  (individual message)
- DELETE /api/community/dms/{me}/{other}                  (whole conversation)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://member-shop-2.preview.emergentagent.com").rstrip("/")

DEMO_EMAIL = "demo@blacksclub.com"
DEMO_PASSWORD = "novasenha123"
DEMO_ID = "mem_e5bb9b5878dd"

ADMIN_EMAIL = "guilherme925145000@gmail.com"
ADMIN_PASSWORD = "8P6S-JSIN-ISGN!45"
ADMIN_ID = "mem_7a9d652945e7"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def verify_logins(api):
    """Sanity-check that both member logins work before running DM tests."""
    r1 = api.post(f"{BASE_URL}/api/members/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r1.status_code == 200, f"Demo login failed: {r1.status_code} {r1.text}"
    assert r1.json().get("member_id") == DEMO_ID
    r2 = api.post(f"{BASE_URL}/api/members/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r2.status_code == 200, f"Admin login failed: {r2.status_code} {r2.text}"
    assert r2.json().get("member_id") == ADMIN_ID


@pytest.fixture(autouse=True)
def _cleanup_thread(api):
    """Ensure DM thread starts clean and gets cleaned after each test."""
    api.delete(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}")
    yield
    api.delete(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}")


# ---------- Individual message delete ----------

class TestDeleteMessage:
    def test_sender_can_delete_own_message(self, api):
        # demo sends to admin
        r = api.post(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}",
                     json={"text": "TEST_msg_to_delete"})
        assert r.status_code == 200, r.text
        dm = r.json()
        dm_id = dm.get("dm_id")
        assert dm_id and dm_id.startswith("dm_")
        assert dm["from_id"] == DEMO_ID
        assert dm["to_id"] == ADMIN_ID
        assert dm["text"] == "TEST_msg_to_delete"

        # delete as sender
        d = api.delete(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}/message/{dm_id}")
        assert d.status_code == 200, d.text
        body = d.json()
        assert body.get("ok") is True
        assert body.get("deleted") == dm_id

        # verify gone via GET
        g = api.get(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}")
        assert g.status_code == 200
        assert not any(m.get("dm_id") == dm_id for m in g.json())

    def test_non_sender_cannot_delete_message(self, api):
        # demo sends to admin
        r = api.post(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}",
                     json={"text": "TEST_only_demo_owns"})
        assert r.status_code == 200
        dm_id = r.json()["dm_id"]

        # try to delete as admin (recipient, not sender) — must be 403
        d = api.delete(f"{BASE_URL}/api/community/dms/{ADMIN_ID}/{DEMO_ID}/message/{dm_id}")
        assert d.status_code == 403, f"expected 403, got {d.status_code}: {d.text}"
        detail = d.json().get("detail", "")
        assert "só pode apagar" in detail.lower() or "so pode apagar" in detail.lower(), detail

        # message must still exist
        g = api.get(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}")
        assert any(m.get("dm_id") == dm_id for m in g.json())

    def test_delete_nonexistent_message_returns_404(self, api):
        d = api.delete(
            f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}/message/dm_doesnotexist999"
        )
        assert d.status_code == 404, d.text


# ---------- Whole-conversation delete ----------

class TestDeleteThread:
    def test_delete_thread_removes_all_messages(self, api):
        # send 3 messages both directions
        api.post(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}",
                 json={"text": "TEST_thread_1"})
        api.post(f"{BASE_URL}/api/community/dms/{ADMIN_ID}/{DEMO_ID}",
                 json={"text": "TEST_thread_2"})
        api.post(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}",
                 json={"text": "TEST_thread_3"})

        # verify count before delete
        g_before = api.get(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}")
        assert g_before.status_code == 200
        count_before = len(g_before.json())
        assert count_before >= 3

        # delete entire thread
        d = api.delete(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}")
        assert d.status_code == 200, d.text
        body = d.json()
        assert body.get("ok") is True
        assert body.get("deleted_count") == count_before

        # verify empty
        g_after = api.get(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}")
        assert g_after.status_code == 200
        assert g_after.json() == []

    def test_delete_thread_symmetric(self, api):
        # sending in either order should target the same thread
        api.post(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}",
                 json={"text": "TEST_sym_1"})
        # delete using reversed order (admin, demo) — must still wipe the thread
        d = api.delete(f"{BASE_URL}/api/community/dms/{ADMIN_ID}/{DEMO_ID}")
        assert d.status_code == 200
        assert d.json().get("ok") is True
        # empty from both viewpoints
        assert api.get(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}").json() == []
        assert api.get(f"{BASE_URL}/api/community/dms/{ADMIN_ID}/{DEMO_ID}").json() == []

    def test_delete_empty_thread_ok(self, api):
        d = api.delete(f"{BASE_URL}/api/community/dms/{DEMO_ID}/{ADMIN_ID}")
        assert d.status_code == 200
        assert d.json().get("ok") is True
        assert d.json().get("deleted_count") == 0
