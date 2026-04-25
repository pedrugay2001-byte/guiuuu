"""
Smoke test for backend startup change (asyncio.create_task background seeds + Mongo timeouts).
Validates:
1. Ultra-fast health checks: GET /, /health, /ready, /api/health
2. Login regression (admin staff + member)
3. PIX info + Staff team endpoint sanity
4. Confirms seed_admin ran in background (>=3 staff accounts)
"""
import os
import sys
import json
import requests

FRONTEND_ENV = "/app/frontend/.env"
PUBLIC_BASE = None
for line in open(FRONTEND_ENV):
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        PUBLIC_BASE = line.split("=", 1)[1].strip().strip('"')
        break
assert PUBLIC_BASE, "EXPO_PUBLIC_BACKEND_URL not found"
API = PUBLIC_BASE.rstrip("/") + "/api"
# Health probes run pod-internally (Kubernetes liveness probe).
# The public ingress only routes /api/* to backend — non-/api paths go to frontend SPA.
LOCAL = "http://localhost:8001"
print(f"PUBLIC_BASE={PUBLIC_BASE}\nAPI={API}\nLOCAL (for k8s probe paths)={LOCAL}\n")

results = []
def rec(name, ok, info=""):
    results.append((name, ok, info))
    sym = "PASS" if ok else "FAIL"
    print(f"[{sym}] {name} :: {info}")

# 1) Health checks (probes hit pod-internal localhost:8001 in production)
import time
try:
    t0 = time.time()
    r = requests.get(LOCAL + "/", timeout=10)
    dt = (time.time() - t0) * 1000
    body = r.json()
    ok = r.status_code == 200 and body == {"status": "ok", "service": "blacksclub-api", "api": "/api"}
    rec(f"GET / (local probe, {dt:.0f}ms)", ok, f"status={r.status_code} body={body}")
except Exception as e:
    rec("GET / (local)", False, f"exception {e}")

try:
    t0 = time.time()
    r = requests.get(LOCAL + "/health", timeout=10)
    dt = (time.time() - t0) * 1000
    body = r.json()
    ok = r.status_code == 200 and body == {"status": "ok", "service": "blacksclub-api"}
    rec(f"GET /health (local probe, {dt:.0f}ms)", ok, f"status={r.status_code} body={body}")
except Exception as e:
    rec("GET /health (local)", False, f"exception {e}")

try:
    t0 = time.time()
    r = requests.get(LOCAL + "/ready", timeout=10)
    dt = (time.time() - t0) * 1000
    body = r.json()
    ok = r.status_code == 200 and body.get("status") in ("ready", "degraded")
    rec(f"GET /ready (local probe, {dt:.0f}ms)", ok, f"status={r.status_code} body={body}")
except Exception as e:
    rec("GET /ready (local)", False, f"exception {e}")

# /api/health works through public ingress AND localhost
try:
    r = requests.get(API + "/health", timeout=10)
    body = r.json()
    ok = r.status_code == 200 and body.get("status") == "ok"
    rec("GET /api/health (public)", ok, f"status={r.status_code} body={body}")
except Exception as e:
    rec("GET /api/health", False, f"exception {e}")

# Confirm /, /health, /ready are NOT exposed via public ingress (returns frontend SPA / 404)
# This is expected — k8s probe runs pod-internal, not via public URL.
try:
    r = requests.get(PUBLIC_BASE + "/health", timeout=10)
    not_json_or_404 = r.status_code == 404 or "html" in r.headers.get("content-type", "").lower()
    rec("Public /health intentionally NOT exposed (probes are pod-internal)", not_json_or_404,
        f"status={r.status_code} ct={r.headers.get('content-type','')}")
except Exception as e:
    rec("Public /health check", False, f"exception {e}")

# 2) Login regressions
admin_token = None
try:
    r = requests.post(API + "/auth/login", json={
        "email": "admin@farmaclube.com",
        "password": "WE1U-DARN-OIKP-OH07!94"
    }, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    # /api/auth/login returns {user, token} (not access_token)
    admin_token = body.get("token") or body.get("access_token")
    ok = r.status_code == 200 and bool(admin_token)
    rec("POST /api/auth/login admin", ok, f"status={r.status_code} token_len={len(admin_token) if admin_token else 0}")
except Exception as e:
    rec("POST /api/auth/login admin", False, f"exception {e}")

try:
    r = requests.post(API + "/members/login", json={
        "email": "guilherme925145000@gmail.com",
        "password": "8P6S-JSIN-ISGN!45"
    }, timeout=15)
    ok = r.status_code == 200
    body = r.json() if r.status_code == 200 else r.text
    rec("POST /api/members/login guilherme", ok, f"status={r.status_code} keys={list(body.keys()) if isinstance(body, dict) else body[:200]}")
except Exception as e:
    rec("POST /api/members/login", False, f"exception {e}")

# 3) PIX info (public)
try:
    r = requests.get(API + "/blx/pix-info", timeout=10)
    body = r.json()
    ok = r.status_code == 200 and "beneficiario" in body and "cnpj_masked" in body and "pix_code" in body
    rec("GET /api/blx/pix-info", ok, f"status={r.status_code} keys={list(body.keys()) if isinstance(body, dict) else 'n/a'}")
except Exception as e:
    rec("GET /api/blx/pix-info", False, f"exception {e}")

# 4) Staff team (admin JWT) — also confirms seed_admin ran in background
team_count = 0
if admin_token:
    try:
        r = requests.get(API + "/staff/team", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        body = r.json()
        ok = r.status_code == 200 and "team" in body and isinstance(body["team"], list)
        team_count = len(body["team"]) if ok else 0
        rec("GET /api/staff/team (admin)", ok, f"status={r.status_code} team_count={team_count}")
        # Check seed admin produced >=3 accounts
        if ok:
            emails = [m.get("email", "") for m in body["team"]]
            roles = [m.get("role", "") for m in body["team"]]
            has_admin = any("admin" in r for r in roles)
            has_support = any("support" in r for r in roles)
            has_financeiro = any("financeiro" in r for r in roles)
            seed_ok = team_count >= 3 and has_admin
            rec("Seed admin background task ran (>=3 staff, includes admin role)", seed_ok,
                f"count={team_count} has_admin={has_admin} has_support={has_support} has_financeiro={has_financeiro} emails={emails}")
    except Exception as e:
        rec("GET /api/staff/team", False, f"exception {e}")
else:
    rec("GET /api/staff/team", False, "no admin token (login failed)")

# Summary
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n=== SMOKE RESULTS: {passed}/{total} PASS ===")
fails = [(n, i) for (n, ok, i) in results if not ok]
if fails:
    print("FAILURES:")
    for n, i in fails:
        print(f"  - {n} :: {i}")
sys.exit(0 if passed == total else 1)
