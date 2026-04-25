"""
Tests for STAFF TEAM MANAGEMENT endpoints (7 endpoints).
Tests against public URL.
"""
import sys
import os
import time
import requests

BASE = "https://member-shop-2.preview.emergentagent.com/api"

ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_OLD_PWD = "admin123"
ADMIN_NEW_PWD = "WE1U-DARN-OIKP-OH07!94"

SUPPORT_EMAIL = "suporte@blacksclub.com"
SUPPORT_PWD = "suporte123"

TEST_EMAIL = "teste_team@blacksclub.com"
TEST_PWD = "teste@123abc"
TEST_PWD_NEW = "NovaSenha2026!"

PASS = 0
FAIL = 0
ERRORS = []


def assert_true(cond, msg):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {msg}")
    else:
        FAIL += 1
        ERRORS.append(msg)
        print(f"  ❌ FAIL: {msg}")


def section(title):
    print(f"\n{'='*70}\n{title}\n{'='*70}")


def login(email, password, expect=200):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    return r


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ========================================================================
section("0) REGRESSION LOGIN — old vs new admin password")

r_old = login(ADMIN_EMAIL, ADMIN_OLD_PWD)
assert_true(r_old.status_code == 401, f"admin login with OLD password (admin123) → 401 (got {r_old.status_code})")

r_new = login(ADMIN_EMAIL, ADMIN_NEW_PWD)
assert_true(r_new.status_code == 200, f"admin login with NEW password → 200 (got {r_new.status_code}: {r_new.text[:200]})")

if r_new.status_code != 200:
    print("FATAL: Cannot proceed without admin JWT.")
    print(f"PASS={PASS}  FAIL={FAIL}")
    sys.exit(1)

admin_data = r_new.json()
ADMIN_TOKEN = admin_data["token"]
ADMIN_USER_ID = admin_data["user"]["user_id"]
assert_true(isinstance(ADMIN_TOKEN, str) and len(ADMIN_TOKEN) > 20, "admin JWT returned (len>20)")
print(f"  admin user_id={ADMIN_USER_ID}")

# Login support for 403 tests
r_sup = login(SUPPORT_EMAIL, SUPPORT_PWD)
assert_true(r_sup.status_code == 200, f"support login OK (got {r_sup.status_code})")
SUPPORT_TOKEN = r_sup.json()["token"] if r_sup.status_code == 200 else None

# ========================================================================
section("1) GET /staff/team (list)")

# 1a) no JWT
r = requests.get(f"{BASE}/staff/team")
assert_true(r.status_code == 401, f"GET /staff/team without JWT → 401 (got {r.status_code})")

# 1b) support JWT → 403
if SUPPORT_TOKEN:
    r = requests.get(f"{BASE}/staff/team", headers=auth_headers(SUPPORT_TOKEN))
    assert_true(r.status_code == 403, f"GET /staff/team with support JWT → 403 (got {r.status_code})")

# 1c) admin
r = requests.get(f"{BASE}/staff/team", headers=auth_headers(ADMIN_TOKEN))
assert_true(r.status_code == 200, f"GET /staff/team with admin JWT → 200 (got {r.status_code}: {r.text[:200]})")

if r.status_code == 200:
    body = r.json()
    assert_true("team" in body, "response has 'team' key")
    team = body.get("team", [])
    assert_true(isinstance(team, list), "team is a list")
    assert_true(len(team) >= 3, f"team has >=3 accounts (got {len(team)})")
    # Required fields
    for u in team:
        for k in ("user_id", "email", "name", "role", "active", "created_at"):
            assert_true(k in u, f"item.{k} present (email={u.get('email')})")
        assert_true("password_hash" not in u, f"password_hash NOT exposed (email={u.get('email')})")
        assert_true(u.get("active") is True, f"{u.get('email')} active=True")
    # Must include admin, support, financeiro
    emails = {u["email"] for u in team}
    assert_true(ADMIN_EMAIL in emails, f"admin@farmaclube.com in team list")
    assert_true(SUPPORT_EMAIL in emails, "suporte@blacksclub.com in team list")
    assert_true("financeiro@blacksclub.com" in emails, "financeiro@blacksclub.com in team list")

INITIAL_TEAM_COUNT = len(team) if r.status_code == 200 else 3

# ========================================================================
section("2) POST /staff/team (create)")

# First, try to cleanup any leftover test account from a previous failed run
r_list = requests.get(f"{BASE}/staff/team", headers=auth_headers(ADMIN_TOKEN))
if r_list.status_code == 200:
    for u in r_list.json().get("team", []):
        if u["email"] == TEST_EMAIL:
            print(f"  (cleanup) deleting leftover {TEST_EMAIL} / {u['user_id']}")
            requests.delete(f"{BASE}/staff/team/{u['user_id']}", headers=auth_headers(ADMIN_TOKEN))
            break

# 2a) password too short (5 chars)
r = requests.post(f"{BASE}/staff/team", headers=auth_headers(ADMIN_TOKEN),
                  json={"name": "Conta Teste", "email": TEST_EMAIL, "password": "abc12", "role": "support"})
assert_true(r.status_code == 400, f"password 5 chars → 400 (got {r.status_code})")

# 2b) role invalid
r = requests.post(f"{BASE}/staff/team", headers=auth_headers(ADMIN_TOKEN),
                  json={"name": "Conta Teste", "email": TEST_EMAIL, "password": TEST_PWD, "role": "invalido"})
assert_true(r.status_code == 400, f"role='invalido' → 400 (got {r.status_code})")

# 2c) name too short
r = requests.post(f"{BASE}/staff/team", headers=auth_headers(ADMIN_TOKEN),
                  json={"name": "A", "email": TEST_EMAIL, "password": TEST_PWD, "role": "support"})
assert_true(r.status_code == 400, f"name 1 char → 400 (got {r.status_code})")

# 2d) valid create
r = requests.post(f"{BASE}/staff/team", headers=auth_headers(ADMIN_TOKEN),
                  json={"name": "Conta Teste", "email": TEST_EMAIL, "password": TEST_PWD, "role": "support"})
assert_true(r.status_code == 200, f"create valid account → 200 (got {r.status_code}: {r.text[:200]})")

TEST_USER_ID = None
if r.status_code == 200:
    created = r.json()
    TEST_USER_ID = created.get("user_id")
    assert_true(TEST_USER_ID and TEST_USER_ID.startswith("user_"), f"user_id generated ({TEST_USER_ID})")
    assert_true("password_hash" not in created, "password_hash NOT in response")
    assert_true(created.get("email") == TEST_EMAIL, f"email echoed ({created.get('email')})")
    assert_true(created.get("name") == "Conta Teste", f"name echoed ({created.get('name')})")
    assert_true(created.get("role") == "support", f"role echoed ({created.get('role')})")
    assert_true(created.get("active") is True, f"active=True ({created.get('active')})")

# 2e) duplicate email → 409
r = requests.post(f"{BASE}/staff/team", headers=auth_headers(ADMIN_TOKEN),
                  json={"name": "Conta Teste 2", "email": TEST_EMAIL, "password": TEST_PWD, "role": "support"})
assert_true(r.status_code == 409, f"duplicate email → 409 (got {r.status_code})")

# 2f) team count == 4
r = requests.get(f"{BASE}/staff/team", headers=auth_headers(ADMIN_TOKEN))
if r.status_code == 200:
    team_len = len(r.json().get("team", []))
    assert_true(team_len == INITIAL_TEAM_COUNT + 1, f"team has {INITIAL_TEAM_COUNT + 1} accounts after create (got {team_len})")

# 2g) Login with new account
r_test_login = login(TEST_EMAIL, TEST_PWD)
assert_true(r_test_login.status_code == 200, f"login with new account → 200 (got {r_test_login.status_code})")

# ========================================================================
section("3) PUT /staff/team/{user_id} (update name)")

if TEST_USER_ID:
    # 3a) valid update
    r = requests.put(f"{BASE}/staff/team/{TEST_USER_ID}", headers=auth_headers(ADMIN_TOKEN),
                     json={"name": "Nome Atualizado"})
    assert_true(r.status_code == 200, f"update name → 200 (got {r.status_code})")
    if r.status_code == 200:
        body = r.json()
        assert_true(body.get("ok") is True, "ok=true")
        assert_true(body.get("name") == "Nome Atualizado", f"new name echoed ({body.get('name')})")

    # 3b) name 1 char
    r = requests.put(f"{BASE}/staff/team/{TEST_USER_ID}", headers=auth_headers(ADMIN_TOKEN),
                     json={"name": "A"})
    assert_true(r.status_code == 400, f"name 1 char → 400 (got {r.status_code})")

    # 3c) user_id inexistente
    r = requests.put(f"{BASE}/staff/team/user_doesnotexist123", headers=auth_headers(ADMIN_TOKEN),
                     json={"name": "Whatever"})
    assert_true(r.status_code == 404, f"user_id inexistent → 404 (got {r.status_code})")

# ========================================================================
section("4) POST /staff/team/{user_id}/password (change pwd)")

if TEST_USER_ID:
    # 4a) valid
    r = requests.post(f"{BASE}/staff/team/{TEST_USER_ID}/password", headers=auth_headers(ADMIN_TOKEN),
                      json={"new_password": TEST_PWD_NEW})
    assert_true(r.status_code == 200, f"change password → 200 (got {r.status_code}: {r.text[:200]})")
    if r.status_code == 200:
        body = r.json()
        assert_true(body.get("ok") is True, "ok=true")
        assert_true("password_changed_at" in body and "T" in body["password_changed_at"],
                    f"password_changed_at ISO ({body.get('password_changed_at')})")

    # 4b) login with new pwd
    r_new_login = login(TEST_EMAIL, TEST_PWD_NEW)
    assert_true(r_new_login.status_code == 200, f"login with NEW pwd → 200 (got {r_new_login.status_code})")

    # 4c) login with old pwd → 401
    r_old_login = login(TEST_EMAIL, TEST_PWD)
    assert_true(r_old_login.status_code == 401, f"login with OLD pwd → 401 (got {r_old_login.status_code})")

    # 4d) short pwd → 400
    r = requests.post(f"{BASE}/staff/team/{TEST_USER_ID}/password", headers=auth_headers(ADMIN_TOKEN),
                      json={"new_password": "abc12"})
    assert_true(r.status_code == 400, f"new_password 5 chars → 400 (got {r.status_code})")

# ========================================================================
section("5) POST /staff/team/{user_id}/set-active")

if TEST_USER_ID:
    # 5a) deactivate
    r = requests.post(f"{BASE}/staff/team/{TEST_USER_ID}/set-active", headers=auth_headers(ADMIN_TOKEN),
                      json={"active": False})
    assert_true(r.status_code == 200, f"deactivate → 200 (got {r.status_code})")
    if r.status_code == 200:
        body = r.json()
        assert_true(body.get("ok") is True, "ok=true")
        assert_true(body.get("active") is False, f"active=false echoed ({body.get('active')})")

    # 5b) login deactivated account → 403
    r_ded = login(TEST_EMAIL, TEST_PWD_NEW)
    assert_true(r_ded.status_code == 403, f"login deactivated → 403 (got {r_ded.status_code}: {r_ded.text[:200]})")
    if r_ded.status_code == 403:
        assert_true("desativada" in r_ded.text.lower(),
                    f"msg mentions 'desativada' ({r_ded.text[:100]})")

    # 5c) reactivate
    r = requests.post(f"{BASE}/staff/team/{TEST_USER_ID}/set-active", headers=auth_headers(ADMIN_TOKEN),
                      json={"active": True})
    assert_true(r.status_code == 200 and r.json().get("active") is True, "reactivate → 200 active=true")

    # 5d) login works again
    r_rel = login(TEST_EMAIL, TEST_PWD_NEW)
    assert_true(r_rel.status_code == 200, f"login after reactivate → 200 (got {r_rel.status_code})")

    # 5e) self-deactivate (admin trying to deactivate itself)
    r = requests.post(f"{BASE}/staff/team/{ADMIN_USER_ID}/set-active", headers=auth_headers(ADMIN_TOKEN),
                      json={"active": False})
    assert_true(r.status_code == 400, f"self-deactivate → 400 (got {r.status_code})")
    if r.status_code == 400:
        detail = r.json().get("detail", "")
        assert_true("própria" in detail.lower() or "sua" in detail.lower(),
                    f"msg mentions 'própria conta' ({detail[:100]})")

    # 5f) Try "last admin" rule:
    # Approach: create a temp admin T, then try deactivate ADMIN_USER_ID from T's token.
    # That should check "last admin" rule (since admin@farmaclube.com is the only other admin,
    # after deactivation we'd still have T active, so it would actually succeed).
    # So a cleaner test: deactivate admin@farmaclube.com from ITSELF → first hits self-check → 400 "própria".
    # And we already validated that above.
    # Let's additionally: create temp admin T → delete support test account from T → confirm works
    # But review says: "Tentar desativar admin@farmaclube.com (último admin) → 400 'Mantenha ao menos 1 administrador ativo'"
    # This requires a second admin to login as. Let's create temp admin.
    r_temp = requests.post(f"{BASE}/staff/team", headers=auth_headers(ADMIN_TOKEN),
                           json={"name": "Admin Temporario", "email": "temp_admin@blacksclub.com",
                                 "password": "TempAdmin2026!", "role": "admin"})
    temp_admin_id = None
    temp_admin_token = None
    if r_temp.status_code == 200:
        temp_admin_id = r_temp.json().get("user_id")
        r_temp_login = login("temp_admin@blacksclub.com", "TempAdmin2026!")
        if r_temp_login.status_code == 200:
            temp_admin_token = r_temp_login.json()["token"]

    if temp_admin_token:
        # Now 2 admins exist. Deactivate admin@farmaclube.com from temp → should SUCCEED (200)
        # because there is still 1 admin left (temp). Then reactivate.
        r = requests.post(f"{BASE}/staff/team/{ADMIN_USER_ID}/set-active",
                          headers=auth_headers(temp_admin_token),
                          json={"active": False})
        assert_true(r.status_code == 200,
                    f"deactivate admin from another admin (2 admins exist) → 200 (got {r.status_code})")
        # Reactivate admin@farmaclube.com
        if r.status_code == 200:
            r_react = requests.post(f"{BASE}/staff/team/{ADMIN_USER_ID}/set-active",
                                    headers=auth_headers(temp_admin_token),
                                    json={"active": True})
            assert_true(r_react.status_code == 200, "reactivate admin@farmaclube.com")

        # Now test "last admin" rule: Deactivate temp first (from admin@farmaclube.com token)
        # wait, temp is admin too → if we deactivate temp we have admin@farmaclube active only.
        # But we want the "Mantenha ao menos 1 administrador ativo" rule. Deactivate temp FIRST.
        r_deact_temp = requests.post(f"{BASE}/staff/team/{temp_admin_id}/set-active",
                                     headers=auth_headers(ADMIN_TOKEN),
                                     json={"active": False})
        assert_true(r_deact_temp.status_code == 200, "deactivate temp admin → 200")

        # Now there's only 1 active admin (admin@farmaclube.com). The temp admin is inactive (can't login).
        # We cannot test "deactivate last admin" from temp (they're deactivated, can't login).
        # Try deactivate admin@farmaclube.com from itself → will hit "própria conta" first.
        # Alternate: reactivate temp briefly, then check with temp trying to deactivate admin@farmaclube
        # Actually re-reactivate temp so we have 2 admins then deactivate admin@farmaclube from temp is
        # the only admin left case → but admin@farmaclube is now only... wait, if we reactivate temp,
        # we have 2 admins. If temp deactivates admin@farma, temp survives → SUCCESS.
        # To actually trigger "Mantenha ao menos 1 administrador", we need exactly 1 admin attempting to
        # deactivate another admin — impossible since the "other" wouldn't exist.
        # 
        # The rule is only triggered when there's 1 admin in active state AND you try to deactivate them.
        # Let's clean up: reactivate temp, keep admin@farmaclube active.
        requests.post(f"{BASE}/staff/team/{temp_admin_id}/set-active",
                      headers=auth_headers(ADMIN_TOKEN), json={"active": True})

        # Delete temp admin at end (section 6 already covers delete tests).
        # We'll keep temp for now and delete it at the end.

# ========================================================================
section("6) DELETE /staff/team/{user_id}")

# 6a) self-delete (admin trying to delete itself) → 400
r = requests.delete(f"{BASE}/staff/team/{ADMIN_USER_ID}", headers=auth_headers(ADMIN_TOKEN))
assert_true(r.status_code == 400, f"self-delete → 400 (got {r.status_code})")

# 6b) last admin: try to delete admin@farmaclube.com from the last admin himself already caught by 6a.
# Instead: delete temp admin → if we have 2 admins, this should succeed. Then attempt delete
# admin@farmaclube.com with only 1 admin left (but still via itself, hitting self-check first).
# The "last admin" rule check (admin_count <= 1) would require a second admin trying to delete the only.
# Since admin@farmaclube.com is the only admin after deleting temp, we can't login as a different admin.
# The rule is still validated indirectly via the code path — but we can at least assert that
# the check code runs. Let's delete temp admin first (using admin@farmaclube.com token).
if 'temp_admin_id' in dir() and temp_admin_id:
    r = requests.delete(f"{BASE}/staff/team/{temp_admin_id}", headers=auth_headers(ADMIN_TOKEN))
    assert_true(r.status_code == 200, f"delete temp admin → 200 (got {r.status_code}: {r.text[:200]})")
    if r.status_code == 200:
        body = r.json()
        assert_true(body.get("ok") is True, "ok=true on delete")
        assert_true(body.get("deleted_user_id") == temp_admin_id, "deleted_user_id echoed")

# 6c) Now only admin@farmaclube.com is admin. Try to delete it (self-delete check triggers first → 400)
# To trigger "last admin" without self-delete, we'd need a second admin but we just deleted temp.
# This is a code-path test that's hard to isolate in black-box — accept self-check taking precedence.
# Note for main agent: the code checks self-delete FIRST, then last-admin. So without a separate
# admin login, we cannot trigger "Mantenha ao menos 1 administrador no sistema".

# 6d) delete test account
if TEST_USER_ID:
    r = requests.delete(f"{BASE}/staff/team/{TEST_USER_ID}", headers=auth_headers(ADMIN_TOKEN))
    assert_true(r.status_code == 200, f"delete test account → 200 (got {r.status_code})")
    if r.status_code == 200:
        body = r.json()
        assert_true(body.get("ok") is True, "ok=true")
        assert_true(body.get("deleted_user_id") == TEST_USER_ID, f"deleted_user_id echoed ({body.get('deleted_user_id')})")

    # 6e) login with deleted account → 401
    r_del_login = login(TEST_EMAIL, TEST_PWD_NEW)
    assert_true(r_del_login.status_code == 401, f"login deleted account → 401 (got {r_del_login.status_code})")

# ========================================================================
section("7) GET /staff/team/audit-log")

# 7a) no JWT → 401
r = requests.get(f"{BASE}/staff/team/audit-log")
assert_true(r.status_code == 401, f"audit-log without JWT → 401 (got {r.status_code})")

# 7b) support JWT → 403
if SUPPORT_TOKEN:
    r = requests.get(f"{BASE}/staff/team/audit-log", headers=auth_headers(SUPPORT_TOKEN))
    assert_true(r.status_code == 403, f"audit-log with support JWT → 403 (got {r.status_code})")

# 7c) admin
r = requests.get(f"{BASE}/staff/team/audit-log", headers=auth_headers(ADMIN_TOKEN))
assert_true(r.status_code == 200, f"audit-log with admin → 200 (got {r.status_code}: {r.text[:200]})")

if r.status_code == 200:
    body = r.json()
    assert_true("entries" in body, "response has 'entries'")
    entries = body.get("entries", [])
    assert_true(isinstance(entries, list), "entries is list")
    assert_true(len(entries) > 0, f"entries non-empty (len={len(entries)})")

    # sorted desc by timestamp
    ts_list = [e.get("timestamp") for e in entries if e.get("timestamp")]
    assert_true(ts_list == sorted(ts_list, reverse=True), "entries sorted desc by timestamp")

    # actions set
    actions_found = {e.get("action") for e in entries}
    print(f"  actions found: {actions_found}")
    for expected in ("team_create", "team_update_name", "team_password_change",
                     "team_deactivate", "team_activate", "team_delete"):
        assert_true(expected in actions_found, f"action '{expected}' in audit log")

    # Each entry has required fields
    for e in entries[:10]:  # check first 10
        for k in ("actor_email", "action", "timestamp"):
            assert_true(k in e, f"entry has {k} (action={e.get('action')})")
    # target_email mostly present for actions on test account
    test_related = [e for e in entries if e.get("target_email") == TEST_EMAIL]
    assert_true(len(test_related) >= 4,
                f"at least 4 entries targeting {TEST_EMAIL} (got {len(test_related)})")

    # actor_email should be admin@farmaclube.com for test-related actions
    for e in test_related:
        assert_true(e.get("actor_email") == ADMIN_EMAIL,
                    f"actor_email==admin@farmaclube.com (got {e.get('actor_email')})")

# 7d) limit param
r = requests.get(f"{BASE}/staff/team/audit-log?limit=3", headers=auth_headers(ADMIN_TOKEN))
assert_true(r.status_code == 200, "audit-log?limit=3 → 200")
if r.status_code == 200:
    entries = r.json().get("entries", [])
    assert_true(len(entries) <= 3, f"limit=3 respected (got {len(entries)})")

# ========================================================================
section("RESULTS")
print(f"\nPASS = {PASS}")
print(f"FAIL = {FAIL}")
if ERRORS:
    print("\nErrors:")
    for e in ERRORS:
        print(f"  - {e}")

sys.exit(0 if FAIL == 0 else 1)
