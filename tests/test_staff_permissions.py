"""
Focused test: validate permission relaxation for staff roles (support + financeiro)
on admin/authorized and admin/stats endpoints, and confirm admin-only guard on
admin/members/{id} DELETE.
"""
import os
import sys
import requests

BASE_URL = os.environ.get(
    "BACKEND_URL",
    "https://member-shop-2.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

SUPPORT = ("suporte@blacksclub.com", "suporte123")
FINANCEIRO = ("financeiro@blacksclub.com", "financeiro123")
ADMIN = ("admin@farmaclube.com", "admin123")

results = []


def log(ok, label, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {label}  {detail}")
    results.append((ok, label, detail))


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def run():
    # ---------- 1. SUPPORT FLOW ----------
    print("\n=== 1. SUPPORT FLOW ===")
    r = login(*SUPPORT)
    ok = r.status_code == 200
    log(ok, "POST /auth/login support", f"status={r.status_code}")
    if not ok:
        print("Aborting support flow:", r.text[:300])
        return
    data = r.json()
    support_token = data.get("token")
    support_role = data.get("user", {}).get("role")
    log(support_role == "support", "support role == 'support'", f"got={support_role}")

    # GET /admin/authorized as support
    r = requests.get(f"{API}/admin/authorized", headers=auth_header(support_token), timeout=30)
    log(r.status_code == 200, "GET /admin/authorized (support)", f"status={r.status_code}")
    if r.status_code == 200:
        lst = r.json()
        log(isinstance(lst, list), "  returns list", f"count={len(lst) if isinstance(lst, list) else 'n/a'}")

    # POST /admin/authorized as support
    payload = {
        "name": "Teste QA Suporte",
        "phone": "+5511900001111",
        "code": "QA-SUPP",
        "tier": "black",
    }
    r = requests.post(f"{API}/admin/authorized", headers=auth_header(support_token), json=payload, timeout=30)
    log(r.status_code == 200, "POST /admin/authorized (support)", f"status={r.status_code}")
    resp_body = r.json() if r.status_code == 200 else {}
    log(resp_body.get("ok") is True and resp_body.get("code") == "QA-SUPP",
        "  response {ok:true, code:'QA-SUPP'}", f"body={resp_body}")

    # Get auth_id for the created entry
    auth_id_support = None
    r_list = requests.get(f"{API}/admin/authorized", headers=auth_header(support_token), timeout=30)
    if r_list.status_code == 200:
        for item in r_list.json():
            if item.get("code") == "QA-SUPP":
                auth_id_support = item.get("auth_id")
                break
    log(bool(auth_id_support), "  retrieved auth_id for QA-SUPP", f"auth_id={auth_id_support}")

    # DELETE /admin/authorized/{auth_id} as support
    if auth_id_support:
        r = requests.delete(f"{API}/admin/authorized/{auth_id_support}", headers=auth_header(support_token), timeout=30)
        log(r.status_code == 200, "DELETE /admin/authorized/{auth_id} (support)", f"status={r.status_code}")
        body = r.json() if r.status_code == 200 else {}
        log(body.get("ok") is True, "  response {ok:true}", f"body={body}")

    # ---------- 2. FINANCEIRO FLOW ----------
    print("\n=== 2. FINANCEIRO FLOW ===")
    r = login(*FINANCEIRO)
    ok = r.status_code == 200
    log(ok, "POST /auth/login financeiro", f"status={r.status_code}")
    if not ok:
        print("  body:", r.text[:300])
        return
    fdata = r.json()
    fin_token = fdata.get("token")
    fin_role = fdata.get("user", {}).get("role")
    log(fin_role == "financeiro", "financeiro role == 'financeiro'", f"got={fin_role}")

    # GET /admin/stats as financeiro
    r = requests.get(f"{API}/admin/stats", headers=auth_header(fin_token), timeout=30)
    log(r.status_code == 200, "GET /admin/stats (financeiro)", f"status={r.status_code}")

    # POST /admin/authorized as financeiro
    payload_fin = {
        "name": "Teste QA Financeiro",
        "phone": "+5511900002222",
        "code": "QA-FIN",
        "tier": "black",
    }
    r = requests.post(f"{API}/admin/authorized", headers=auth_header(fin_token), json=payload_fin, timeout=30)
    log(r.status_code == 200, "POST /admin/authorized (financeiro)", f"status={r.status_code}")
    body = r.json() if r.status_code == 200 else {}
    log(body.get("ok") is True and body.get("code") == "QA-FIN", "  response {ok:true, code:'QA-FIN'}", f"body={body}")

    # cleanup (use financeiro token)
    r_list = requests.get(f"{API}/admin/authorized", headers=auth_header(fin_token), timeout=30)
    fin_auth_id = None
    if r_list.status_code == 200:
        for item in r_list.json():
            if item.get("code") == "QA-FIN":
                fin_auth_id = item.get("auth_id")
                break
    if fin_auth_id:
        r = requests.delete(f"{API}/admin/authorized/{fin_auth_id}", headers=auth_header(fin_token), timeout=30)
        log(r.status_code == 200, "DELETE /admin/authorized (financeiro cleanup)", f"status={r.status_code}")

    # ---------- 3. ADMIN REGRESSION ----------
    print("\n=== 3. ADMIN REGRESSION ===")
    r = login(*ADMIN)
    ok = r.status_code == 200
    log(ok, "POST /auth/login admin", f"status={r.status_code}")
    if not ok:
        print("  body:", r.text[:300])
        return
    adata = r.json()
    admin_token = adata.get("token")
    admin_role = adata.get("user", {}).get("role")
    log(admin_role == "admin", "admin role == 'admin'", f"got={admin_role}")

    # POST /admin/authorized as admin
    payload_admin = {
        "name": "Teste QA Admin",
        "phone": "+5511900003333",
        "code": "QA-ADMIN",
        "tier": "black",
    }
    r = requests.post(f"{API}/admin/authorized", headers=auth_header(admin_token), json=payload_admin, timeout=30)
    log(r.status_code == 200, "POST /admin/authorized (admin)", f"status={r.status_code}")

    # cleanup admin entry
    r_list = requests.get(f"{API}/admin/authorized", headers=auth_header(admin_token), timeout=30)
    if r_list.status_code == 200:
        for item in r_list.json():
            if item.get("code") == "QA-ADMIN":
                aid = item.get("auth_id")
                requests.delete(f"{API}/admin/authorized/{aid}", headers=auth_header(admin_token), timeout=30)
                break

    # DELETE /admin/members/{id} guard — support token must be 403
    # Use a dummy member_id (guard check runs before DB lookup)
    r = requests.delete(f"{API}/admin/members/mem_nonexistent", headers=auth_header(support_token), timeout=30)
    log(r.status_code == 403, "DELETE /admin/members (support token) → 403", f"status={r.status_code} body={r.text[:120]}")

    # Same with financeiro
    r = requests.delete(f"{API}/admin/members/mem_nonexistent", headers=auth_header(fin_token), timeout=30)
    log(r.status_code == 403, "DELETE /admin/members (financeiro token) → 403", f"status={r.status_code} body={r.text[:120]}")

    # Admin DELETE should pass the role guard (may 404 since member doesn't exist, but NOT 403)
    r = requests.delete(f"{API}/admin/members/mem_nonexistent", headers=auth_header(admin_token), timeout=30)
    log(r.status_code != 403, "DELETE /admin/members (admin token) → NOT 403", f"status={r.status_code}")


if __name__ == "__main__":
    run()
    total = len(results)
    passed = sum(1 for ok, _, _ in results if ok)
    print(f"\n===== RESULT: {passed}/{total} passed =====")
    sys.exit(0 if passed == total else 1)
