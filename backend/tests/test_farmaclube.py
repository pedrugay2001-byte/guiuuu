"""FarmaClube backend API tests"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://member-shop-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def member_token():
    email = f"test_{uuid.uuid4().hex[:8]}@farmaclube.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "member123", "name": "TEST User"}, timeout=15)
    assert r.status_code == 200, f"Register failed: {r.text}"
    data = r.json()
    assert data["user"]["role"] == "member"
    assert data["user"]["email"] == email
    return data["token"], email


# ---------- Auth ----------
class TestAuth:
    def test_register_and_auto_token(self):
        email = f"auto_{uuid.uuid4().hex[:8]}@farmaclube.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pw12345", "name": "Auto Test"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and len(d["token"]) > 20
        assert d["user"]["role"] == "member"

    def test_register_duplicate_fails(self, member_token):
        _, email = member_token
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "x", "name": "dup"}, timeout=15)
        assert r.status_code == 400

    def test_admin_login(self, admin_token):
        assert admin_token

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG"}, timeout=15)
        assert r.status_code == 401

    def test_auth_me_with_token(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert u["role"] == "admin"

    def test_auth_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# ---------- Products & Categories ----------
class TestProducts:
    def test_list_products_seeded(self):
        r = requests.get(f"{API}/products", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 12, f"expected >=12 seeded products, got {len(items)}"
        # required fields
        first = items[0]
        for k in ["product_id", "name", "category", "price", "member_price", "image_url"]:
            assert k in first
        assert first["member_price"] < first["price"]

    def test_filter_by_category(self):
        r = requests.get(f"{API}/products", params={"category": "emagrecedores"}, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert all(p["category"] == "emagrecedores" for p in items)

    def test_search_query(self):
        r = requests.get(f"{API}/products", params={"q": "ozempic"}, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert any("ozempic" in p["name"].lower() for p in items)

    def test_featured(self):
        r = requests.get(f"{API}/products/featured", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert all(p["featured"] is True for p in items)

    def test_get_single_product(self):
        listing = requests.get(f"{API}/products", timeout=15).json()
        pid = listing[0]["product_id"]
        r = requests.get(f"{API}/products/{pid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["product_id"] == pid

    def test_get_product_not_found(self):
        r = requests.get(f"{API}/products/prod_doesnotexist", timeout=15)
        assert r.status_code == 404

    def test_categories(self):
        r = requests.get(f"{API}/categories", timeout=15)
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 6
        ids = {c["id"] for c in cats}
        assert {"emagrecedores", "peptideos", "landerlan", "hormonios", "pre_treinos", "suplementos"} == ids


# ---------- Admin CRUD ----------
class TestAdminCRUD:
    def test_create_requires_auth(self):
        r = requests.post(f"{API}/products", json={"name": "x", "category": "suplementos", "description": "x", "price": 1, "member_price": 1, "image_url": "x"}, timeout=15)
        assert r.status_code == 401

    def test_create_forbidden_for_member(self, member_token):
        token, _ = member_token
        r = requests.post(
            f"{API}/products",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "x", "category": "suplementos", "description": "x", "price": 1, "member_price": 1, "image_url": "x"},
            timeout=15,
        )
        assert r.status_code == 403

    def test_admin_full_crud(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "name": "TEST_AdminProduct",
            "category": "suplementos",
            "description": "temp test product",
            "price": 200.0,
            "member_price": 150.0,
            "image_url": "https://example.com/x.jpg",
            "stock": 5,
            "featured": False,
        }
        # CREATE
        r = requests.post(f"{API}/products", headers=headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        pid = created["product_id"]
        assert created["name"] == "TEST_AdminProduct"

        # GET (verify persistence)
        r2 = requests.get(f"{API}/products/{pid}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["price"] == 200.0

        # UPDATE
        r3 = requests.put(f"{API}/products/{pid}", headers=headers, json={"price": 299.0, "featured": True}, timeout=15)
        assert r3.status_code == 200
        assert r3.json()["price"] == 299.0
        assert r3.json()["featured"] is True

        # Verify update persisted
        r4 = requests.get(f"{API}/products/{pid}", timeout=15)
        assert r4.json()["price"] == 299.0

        # DELETE
        r5 = requests.delete(f"{API}/products/{pid}", headers=headers, timeout=15)
        assert r5.status_code == 200

        # Confirm 404
        r6 = requests.get(f"{API}/products/{pid}", timeout=15)
        assert r6.status_code == 404
