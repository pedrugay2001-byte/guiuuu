"""
Backend tests for FarmaClube Orders + In-App Chat endpoints.
Tests the new /api/orders and /api/chat/* routes per review request.
"""
import os
import sys
import json
import uuid
from pathlib import Path
from datetime import datetime

import requests


def load_env_var(path: Path, key: str) -> str:
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            if k.strip() == key:
                return v.strip().strip('"').strip("'")
    return ""


FRONTEND_ENV = Path("/app/frontend/.env")
BACKEND_URL = load_env_var(FRONTEND_ENV, "EXPO_PUBLIC_BACKEND_URL")
if not BACKEND_URL:
    print("FATAL: EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")
    sys.exit(1)
API = f"{BACKEND_URL.rstrip('/')}/api"

results = []

def record(name, passed, detail, request=None, response=None):
    entry = {
        "name": name,
        "passed": bool(passed),
        "detail": detail,
    }
    if request is not None:
        entry["request"] = request
    if response is not None:
        entry["response"] = response
    results.append(entry)
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name} :: {detail}")


def safe_json(resp):
    try:
        return resp.json()
    except Exception:
        return {"_raw": resp.text[:500]}


def main():
    print(f"Testing backend at: {API}")

    # ------------------------------------------------------------------
    # 1) POST /api/members/enter -> member_id + invite_code
    # ------------------------------------------------------------------
    member_body = {
        "name": "Teste Chat",
        "phone": "+5511999990000",
        "address": "Rua Teste 1",
        "code": "X2T",
    }
    r = requests.post(f"{API}/members/enter", json=member_body, timeout=30)
    body = safe_json(r)
    member_id = body.get("member_id") if isinstance(body, dict) else None
    invite_code = body.get("invite_code") if isinstance(body, dict) else None
    ok = r.status_code == 200 and member_id and invite_code
    record(
        "1) POST /api/members/enter (gate)",
        ok,
        f"status={r.status_code}, member_id={member_id}, invite_code={invite_code}",
        request=member_body,
        response=body,
    )
    if not ok:
        print("Cannot continue without member_id. Aborting.")
        return save_report()

    # ------------------------------------------------------------------
    # 2) POST /api/orders -> order_id, status=open
    # ------------------------------------------------------------------
    order_body = {
        "member_id": member_id,
        "items": [
            {"product_id": "p1", "name": "Ozempic 1mg", "quantity": 1, "price": 999.0},
            {"product_id": "p2", "name": "BPC-157", "quantity": 2, "price": 329.0},
        ],
        "total": 1657.0,
    }
    r = requests.post(f"{API}/orders", json=order_body, timeout=30)
    body = safe_json(r)
    order_id = body.get("order_id") if isinstance(body, dict) else None
    ok = (
        r.status_code == 200
        and order_id
        and body.get("status") == "open"
    )
    record(
        "2) POST /api/orders (create order)",
        ok,
        f"status={r.status_code}, order_id={order_id}, order_status={body.get('status') if isinstance(body, dict) else None}",
        request=order_body,
        response=body,
    )

    # ------------------------------------------------------------------
    # 3) POST /api/auth/login as support
    # ------------------------------------------------------------------
    login_body = {"email": "suporte@farmaclube.com", "password": "suporte123"}
    r = requests.post(f"{API}/auth/login", json=login_body, timeout=30)
    body = safe_json(r)
    support_token = body.get("token") if isinstance(body, dict) else None
    support_user = body.get("user") if isinstance(body, dict) else None
    ok = (
        r.status_code == 200
        and support_token
        and support_user
        and support_user.get("role") == "support"
    )
    record(
        "3) POST /api/auth/login (support)",
        ok,
        f"status={r.status_code}, token_present={bool(support_token)}, role={support_user.get('role') if support_user else None}",
        request={"email": login_body["email"], "password": "***"},
        response={"user": support_user, "token_present": bool(support_token)},
    )
    if not support_token:
        print("Cannot continue without support token. Aborting.")
        return save_report()

    auth_headers = {"Authorization": f"Bearer {support_token}"}

    # ------------------------------------------------------------------
    # 4) GET /api/chat/threads (staff)
    # ------------------------------------------------------------------
    r = requests.get(f"{API}/chat/threads", headers=auth_headers, timeout=30)
    body = safe_json(r)
    thread = None
    if isinstance(body, list):
        for t in body:
            if t.get("member_id") == member_id:
                thread = t
                break
    ok = (
        r.status_code == 200
        and isinstance(body, list)
        and thread is not None
        and thread.get("member_name") == "Teste Chat"
        and isinstance(thread.get("last_message"), str)
        and thread["last_message"].startswith("🛒")
        and int(thread.get("unread", 0)) >= 1
    )
    record(
        "4) GET /api/chat/threads (staff, expects order summary thread)",
        ok,
        f"status={r.status_code}, threads_count={len(body) if isinstance(body, list) else 'n/a'}, "
        f"thread_found={thread is not None}, "
        f"last_message_prefix={(thread.get('last_message')[:12] if thread else None)}, "
        f"unread={thread.get('unread') if thread else None}",
        response=thread or body,
    )

    # ------------------------------------------------------------------
    # 5) GET /api/chat/threads WITHOUT auth
    # ------------------------------------------------------------------
    r = requests.get(f"{API}/chat/threads", timeout=30)
    ok = r.status_code in (401, 403)
    record(
        "5) GET /api/chat/threads without auth (expect 401/403)",
        ok,
        f"status={r.status_code}",
        response=safe_json(r),
    )

    # ------------------------------------------------------------------
    # 6) GET /api/chat/support/{member_id} (staff) -> first msg order summary
    # ------------------------------------------------------------------
    r = requests.get(f"{API}/chat/support/{member_id}", headers=auth_headers, timeout=30)
    body = safe_json(r)
    first = body[0] if isinstance(body, list) and body else None
    ok = (
        r.status_code == 200
        and isinstance(body, list)
        and first is not None
        and first.get("sender") == "member"
        and isinstance(first.get("text"), str)
        and first["text"].startswith("🛒")
    )
    record(
        "6) GET /api/chat/support/{member_id} (staff reads thread)",
        ok,
        f"status={r.status_code}, msgs={len(body) if isinstance(body, list) else 'n/a'}, "
        f"first_sender={first.get('sender') if first else None}, "
        f"first_text_prefix={(first.get('text')[:12] if first else None)}",
        response=first,
    )

    # ------------------------------------------------------------------
    # 7) POST /api/chat/support/{member_id} as support
    # ------------------------------------------------------------------
    send_body = {"text": "Olá, pedido recebido!"}
    r = requests.post(
        f"{API}/chat/support/{member_id}",
        json=send_body,
        headers=auth_headers,
        timeout=30,
    )
    body = safe_json(r)
    ok = (
        r.status_code == 200
        and isinstance(body, dict)
        and body.get("sender") == "support"
        and body.get("sender_name") == "Equipe de Suporte"
        and body.get("text") == "Olá, pedido recebido!"
    )
    record(
        "7) POST /api/chat/support/{member_id} (staff replies)",
        ok,
        f"status={r.status_code}, sender={body.get('sender') if isinstance(body, dict) else None}, "
        f"sender_name={body.get('sender_name') if isinstance(body, dict) else None}",
        request=send_body,
        response=body,
    )

    # ------------------------------------------------------------------
    # 8) GET /api/chat/member/{member_id} (no auth) -> has both
    # ------------------------------------------------------------------
    r = requests.get(f"{API}/chat/member/{member_id}", timeout=30)
    body = safe_json(r)
    has_order_summary = False
    has_support_reply = False
    if isinstance(body, list):
        for m in body:
            text = m.get("text", "")
            if m.get("sender") == "member" and text.startswith("🛒"):
                has_order_summary = True
            if m.get("sender") == "support" and text == "Olá, pedido recebido!":
                has_support_reply = True
    ok = r.status_code == 200 and has_order_summary and has_support_reply
    record(
        "8) GET /api/chat/member/{member_id} (no auth, contains both msgs)",
        ok,
        f"status={r.status_code}, msgs={len(body) if isinstance(body, list) else 'n/a'}, "
        f"has_order_summary={has_order_summary}, has_support_reply={has_support_reply}",
    )

    # ------------------------------------------------------------------
    # 9) POST /api/chat/member/{member_id} (no auth) -> member msg
    # ------------------------------------------------------------------
    member_msg = {"text": "Obrigado!"}
    r = requests.post(f"{API}/chat/member/{member_id}", json=member_msg, timeout=30)
    body = safe_json(r)
    ok = (
        r.status_code == 200
        and isinstance(body, dict)
        and body.get("sender") == "member"
        and body.get("text") == "Obrigado!"
    )
    record(
        "9) POST /api/chat/member/{member_id} (member replies)",
        ok,
        f"status={r.status_code}, sender={body.get('sender') if isinstance(body, dict) else None}, "
        f"text={body.get('text') if isinstance(body, dict) else None}",
        request=member_msg,
        response=body,
    )

    # ------------------------------------------------------------------
    # 10) GET /api/chat/threads again -> last_message=Obrigado!, last_sender=member
    # ------------------------------------------------------------------
    r = requests.get(f"{API}/chat/threads", headers=auth_headers, timeout=30)
    body = safe_json(r)
    thread2 = None
    if isinstance(body, list):
        for t in body:
            if t.get("member_id") == member_id:
                thread2 = t
                break
    ok = (
        r.status_code == 200
        and thread2 is not None
        and thread2.get("last_message") == "Obrigado!"
        and thread2.get("last_sender") == "member"
    )
    record(
        "10) GET /api/chat/threads again (last_message updated)",
        ok,
        f"status={r.status_code}, last_message={thread2.get('last_message') if thread2 else None}, "
        f"last_sender={thread2.get('last_sender') if thread2 else None}",
        response=thread2,
    )

    # ------------------------------------------------------------------
    # 11) Error cases
    # ------------------------------------------------------------------
    # 11a) POST /api/orders with unknown member_id -> 404
    bad_order = {
        "member_id": f"mem_{uuid.uuid4().hex[:12]}",
        "items": [{"product_id": "p1", "name": "X", "quantity": 1, "price": 10.0}],
        "total": 10.0,
    }
    r = requests.post(f"{API}/orders", json=bad_order, timeout=30)
    record(
        "11a) POST /api/orders with unknown member_id (expect 404)",
        r.status_code == 404,
        f"status={r.status_code}",
        response=safe_json(r),
    )

    # 11b) POST /api/chat/member/{nonexistent} -> 404
    fake_id = f"mem_{uuid.uuid4().hex[:12]}"
    r = requests.post(f"{API}/chat/member/{fake_id}", json={"text": "hi"}, timeout=30)
    record(
        "11b) POST /api/chat/member/{nonexistent} (expect 404)",
        r.status_code == 404,
        f"status={r.status_code}",
        response=safe_json(r),
    )

    # 11c) POST /api/chat/support/{member_id} with empty text -> 400
    r = requests.post(
        f"{API}/chat/support/{member_id}",
        json={"text": ""},
        headers=auth_headers,
        timeout=30,
    )
    record(
        "11c) POST /api/chat/support/{member_id} empty text (expect 400)",
        r.status_code == 400,
        f"status={r.status_code}",
        response=safe_json(r),
    )

    # 11d) POST /api/chat/support/{member_id} without token -> 401
    r = requests.post(
        f"{API}/chat/support/{member_id}",
        json={"text": "hi"},
        timeout=30,
    )
    record(
        "11d) POST /api/chat/support/{member_id} without token (expect 401)",
        r.status_code == 401,
        f"status={r.status_code}",
        response=safe_json(r),
    )

    # 11e) Login as role=member then try /api/chat/threads -> 403
    rand_email = f"member_{uuid.uuid4().hex[:8]}@test.com"
    reg_body = {"email": rand_email, "password": "Senha@123", "name": "Cliente Teste"}
    r = requests.post(f"{API}/auth/register", json=reg_body, timeout=30)
    reg = safe_json(r)
    member_token = reg.get("token") if isinstance(reg, dict) else None
    if r.status_code == 200 and member_token:
        r2 = requests.get(
            f"{API}/chat/threads",
            headers={"Authorization": f"Bearer {member_token}"},
            timeout=30,
        )
        record(
            "11e) GET /api/chat/threads as role=member (expect 403)",
            r2.status_code == 403,
            f"register_status={r.status_code}, threads_status={r2.status_code}, "
            f"role={reg.get('user', {}).get('role')}",
            response=safe_json(r2),
        )
    else:
        record(
            "11e) GET /api/chat/threads as role=member (expect 403)",
            False,
            f"could not register member; register_status={r.status_code}, body={reg}",
        )

    save_report()


def save_report():
    out_dir = Path("/app/test_reports")
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "iteration_2.json"
    passed = sum(1 for r in results if r["passed"])
    failed = sum(1 for r in results if not r["passed"])
    payload = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "api_base": API,
        "summary": {"total": len(results), "passed": passed, "failed": failed},
        "results": results,
    }
    out.write_text(json.dumps(payload, indent=2, default=str))
    print(f"\nReport saved to {out}")
    print(f"Totals: total={len(results)} passed={passed} failed={failed}")


if __name__ == "__main__":
    main()
