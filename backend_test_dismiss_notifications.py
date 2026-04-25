"""
Backend test for the 3 NEW endpoints — Dismiss de Notificações.

Endpoints under test:
  1) POST /api/community/dms/{member_id}/mark-all-read
  2) POST /api/notifications/{member_id}/mark-read
  3) GET  /api/notifications/{member_id}/count   (regression/verification)

Spec from review:
- For mark-all-read: 200 + {ok:true, threads_marked:int>=0, last_read_at:ISO}
  After call: GET /notifications/<id>/count.messages == 0.
  Idempotent: calling twice does not error.
- For notifications/mark-read: 200 + {ok:true, notif_read_at:ISO}
  After call: GET /notifications/<id>/count.notifications == 0.
  Idempotent.
- For count regression:
  After both, messages == 0 AND notifications == 0.
  Sending a NEW DM after that brings messages back >= 1.

Member used: mem_7a9d652945e7 (admin master Luis Guilherme).

Base URL is sourced from /app/frontend/.env EXPO_PUBLIC_BACKEND_URL plus /api.
"""

import os
import re
import sys
import time
import uuid
import json
import requests
from datetime import datetime

# ----------------------------- Config ---------------------------------------

BACKEND_URL = "https://member-shop-2.preview.emergentagent.com"
# fall back if anyone overrides
env_path = "/app/frontend/.env"
try:
    with open(env_path, "r", encoding="utf-8") as fp:
        for line in fp:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BACKEND_URL = line.split("=", 1)[1].strip().strip('"')
                break
except FileNotFoundError:
    pass

API = BACKEND_URL.rstrip("/") + "/api"

ADMIN_MEMBER_ID = "mem_7a9d652945e7"      # admin master, has DMs in DB
ADMIN_EMAIL = "guilherme925145000@gmail.com"
ADMIN_PASS = "blacks2026"

DEMO_EMAIL = "demo@blacksclub.com"
DEMO_PASS = "novasenha123"

passes = 0
fails = 0
fail_msgs = []


def _check(label: str, cond: bool, detail: str = "") -> None:
    global passes, fails
    if cond:
        passes += 1
        print(f"  PASS — {label}")
    else:
        fails += 1
        msg = f"  FAIL — {label}"
        if detail:
            msg += f"\n         detail: {detail}"
        fail_msgs.append(msg)
        print(msg)


def _is_iso(s: str) -> bool:
    if not isinstance(s, str):
        return False
    # very tolerant ISO-8601 detector (with or without TZ)
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", s))


# --------------------------- Helpers ----------------------------------------

def login_member(email: str, password: str) -> dict:
    r = requests.post(
        f"{API}/members/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def get_count(member_id: str) -> dict:
    r = requests.get(f"{API}/notifications/{member_id}/count", timeout=15)
    r.raise_for_status()
    return r.json()


# --------------------------- Tests ------------------------------------------

print(f"[INFO] API base = {API}")
print(f"[INFO] Admin member_id = {ADMIN_MEMBER_ID}")

# Optionally login admin to confirm credentials still valid (not strictly required
# for the tested endpoints, but doc'd in review).
try:
    admin_login = login_member(ADMIN_EMAIL, ADMIN_PASS)
    real_admin_id = (admin_login.get("user") or {}).get("member_id") or admin_login.get("member_id")
    if real_admin_id:
        ADMIN_MEMBER_ID = real_admin_id
    print(f"[INFO] Admin login OK; using member_id={ADMIN_MEMBER_ID}")
except Exception as e:
    print(f"[WARN] Admin login failed ({e}); falling back to hardcoded {ADMIN_MEMBER_ID}")

# Login demo to obtain another member_id for sending a fresh DM later.
demo_login = login_member(DEMO_EMAIL, DEMO_PASS)
demo_member_id = (demo_login.get("user") or {}).get("member_id") or demo_login.get("member_id")
print(f"[INFO] Demo member_id = {demo_member_id}")
assert demo_member_id, "demo_member_id required for new-DM regression"

# Snapshot initial counters
initial = get_count(ADMIN_MEMBER_ID)
print(f"[INFO] initial count = {initial}")


# ============================================================
# 1) POST /api/community/dms/{member_id}/mark-all-read
# ============================================================
print("\n=== 1) POST /community/dms/{member_id}/mark-all-read ===")

r1 = requests.post(
    f"{API}/community/dms-mark-all-read/{ADMIN_MEMBER_ID}",
    timeout=15,
)
_check("HTTP 200", r1.status_code == 200, f"got {r1.status_code} body={r1.text[:200]}")
body1 = {}
try:
    body1 = r1.json()
except Exception as e:
    _check("response is JSON", False, str(e))

_check("body.ok is True", body1.get("ok") is True, f"body={body1}")
_check(
    "body.threads_marked is int >=0",
    isinstance(body1.get("threads_marked"), int) and body1.get("threads_marked") >= 0,
    f"threads_marked={body1.get('threads_marked')!r}",
)
_check(
    "body.last_read_at is ISO timestamp",
    _is_iso(body1.get("last_read_at", "")),
    f"last_read_at={body1.get('last_read_at')!r}",
)

threads_marked_first = body1.get("threads_marked")

# Verify count.messages == 0 after marking all read
count_after_mark_all = get_count(ADMIN_MEMBER_ID)
print(f"[INFO] count after mark-all-read = {count_after_mark_all}")
_check(
    "GET /notifications/<id>/count.messages == 0 after mark-all-read",
    count_after_mark_all.get("messages") == 0,
    f"messages={count_after_mark_all.get('messages')!r}",
)
_check(
    "count.messages is int (no bool)",
    isinstance(count_after_mark_all.get("messages"), int)
    and not isinstance(count_after_mark_all.get("messages"), bool),
)

# Idempotency: 2nd call must not error and threads_marked >= 0
r1b = requests.post(
    f"{API}/community/dms-mark-all-read/{ADMIN_MEMBER_ID}",
    timeout=15,
)
_check("idempotent 2nd call HTTP 200", r1b.status_code == 200, f"got {r1b.status_code}")
body1b = {}
try:
    body1b = r1b.json()
except Exception:
    pass
_check("idempotent 2nd call body.ok=True", body1b.get("ok") is True, f"body={body1b}")
_check(
    "idempotent 2nd call threads_marked int >=0",
    isinstance(body1b.get("threads_marked"), int) and body1b.get("threads_marked") >= 0,
    f"threads_marked={body1b.get('threads_marked')!r}",
)
_check(
    "idempotent — last_read_at also ISO",
    _is_iso(body1b.get("last_read_at", "")),
)

# After idempotent call, messages still 0
count_after_idem = get_count(ADMIN_MEMBER_ID)
_check(
    "messages still 0 after idempotent mark-all-read",
    count_after_idem.get("messages") == 0,
    f"messages={count_after_idem.get('messages')!r}",
)


# ============================================================
# 2) POST /api/notifications/{member_id}/mark-read
# ============================================================
print("\n=== 2) POST /notifications/{member_id}/mark-read ===")

r2 = requests.post(
    f"{API}/notifications/{ADMIN_MEMBER_ID}/mark-read",
    timeout=15,
)
_check("HTTP 200", r2.status_code == 200, f"got {r2.status_code} body={r2.text[:200]}")
body2 = {}
try:
    body2 = r2.json()
except Exception as e:
    _check("response is JSON", False, str(e))

_check("body.ok is True", body2.get("ok") is True, f"body={body2}")
_check(
    "body.notif_read_at is ISO timestamp",
    _is_iso(body2.get("notif_read_at", "")),
    f"notif_read_at={body2.get('notif_read_at')!r}",
)

# Verify count.notifications == 0
count_after_notif = get_count(ADMIN_MEMBER_ID)
print(f"[INFO] count after notifications/mark-read = {count_after_notif}")
_check(
    "count.notifications == 0 after mark-read",
    count_after_notif.get("notifications") == 0,
    f"notifications={count_after_notif.get('notifications')!r}",
)
_check(
    "count.notifications is int (no bool)",
    isinstance(count_after_notif.get("notifications"), int)
    and not isinstance(count_after_notif.get("notifications"), bool),
)

# Idempotency: 2nd call
r2b = requests.post(
    f"{API}/notifications/{ADMIN_MEMBER_ID}/mark-read",
    timeout=15,
)
_check("idempotent 2nd call HTTP 200", r2b.status_code == 200, f"got {r2b.status_code}")
body2b = {}
try:
    body2b = r2b.json()
except Exception:
    pass
_check("idempotent 2nd call body.ok=True", body2b.get("ok") is True, f"body={body2b}")
_check(
    "idempotent 2nd call notif_read_at ISO",
    _is_iso(body2b.get("notif_read_at", "")),
)

count_after_notif_idem = get_count(ADMIN_MEMBER_ID)
_check(
    "notifications still 0 after idempotent mark-read",
    count_after_notif_idem.get("notifications") == 0,
    f"notifications={count_after_notif_idem.get('notifications')!r}",
)


# ============================================================
# 3) GET /api/notifications/{member_id}/count — full regression
# ============================================================
print("\n=== 3) GET /notifications/{member_id}/count regression ===")

count_clean = get_count(ADMIN_MEMBER_ID)
print(f"[INFO] count after both mark-reads = {count_clean}")
_check("post-cleanup messages == 0", count_clean.get("messages") == 0, f"{count_clean}")
_check("post-cleanup notifications == 0", count_clean.get("notifications") == 0, f"{count_clean}")
_check(
    "count == messages + notifications",
    count_clean.get("count") == (count_clean.get("messages", 0) + count_clean.get("notifications", 0)),
    f"{count_clean}",
)

# Send a fresh DM from demo -> admin to bring messages back >=1
print(f"[INFO] sending DM from {demo_member_id} -> {ADMIN_MEMBER_ID}")
dm_send = requests.post(
    f"{API}/community/dms/{demo_member_id}/{ADMIN_MEMBER_ID}",
    json={"text": f"ping notifications regression {uuid.uuid4().hex[:6]}"},
    timeout=15,
)
_check("DM send HTTP 200", dm_send.status_code == 200, f"got {dm_send.status_code} body={dm_send.text[:200]}")
dm_doc = {}
try:
    dm_doc = dm_send.json()
except Exception:
    pass
_check("DM send returned dm_id", isinstance(dm_doc.get("dm_id"), str) and dm_doc.get("dm_id"),
       f"doc={dm_doc}")

# Give Mongo a tick to settle.
time.sleep(0.4)

count_after_new_dm = get_count(ADMIN_MEMBER_ID)
print(f"[INFO] count after new DM = {count_after_new_dm}")
_check(
    "count.messages >= 1 after new DM arrives",
    count_after_new_dm.get("messages", 0) >= 1,
    f"messages={count_after_new_dm.get('messages')!r}, full={count_after_new_dm}",
)
_check(
    "count.notifications still 0 after new DM",
    count_after_new_dm.get("notifications") == 0,
    f"notifications={count_after_new_dm.get('notifications')!r}",
)

# Cleanup: mark all read again so we don't leave noise
requests.post(
    f"{API}/community/dms-mark-all-read/{ADMIN_MEMBER_ID}",
    timeout=15,
)
count_final = get_count(ADMIN_MEMBER_ID)
_check(
    "after final mark-all-read messages back to 0",
    count_final.get("messages") == 0,
    f"final={count_final}",
)


# --------------------------- Summary ----------------------------------------

print("\n" + "=" * 60)
print(f"RESULT  passed={passes}  failed={fails}")
print("=" * 60)
if fails:
    print("\nFAILURE DETAILS:")
    for m in fail_msgs:
        print(m)
    sys.exit(1)
sys.exit(0)
