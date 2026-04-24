#!/usr/bin/env python3
"""
BLACKSCLUB — TIER-LOCK validation for community official groups
Validates:
  1) GET /api/community/groups (no member_id)
  2) GET /api/community/groups?member_id=<demo_diamond_id>
  3) POST /api/community/groups/g_tier_diamond/join/<demo_diamond_id> (200)
  4) POST /api/community/groups/g_tier_black/join/<demo_diamond_id>   (403 TIER_LOCKED)
  5) POST /api/community/groups/g_tier_diamond/messages (200)
  6) POST /api/community/groups/g_tier_black/messages   (403 TIER_LOCKED)
  7) GET  /api/community/groups/g_tier_diamond/messages?member_id=... (200)
  8) GET  /api/community/groups/g_tier_black/messages?member_id=...   (403 TIER_LOCKED)
  9) GET  /api/community/groups/g_tier_diamond/messages (no member_id) (200, legacy-safe)
"""
import os
import sys
import json
from typing import Any, Dict, List, Optional

import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://member-shop-2.preview.emergentagent.com"
API = BASE.rstrip("/") + "/api"
TIMEOUT = 30

DEMO_EMAIL = "demo@blacksclub.com"
DEMO_PASSWORD = "novasenha123"

OFFICIAL_TIER_GROUPS = {
    "g_tier_black":   {"order": 0, "tier": "black"},
    "g_tier_silver":  {"order": 1, "tier": "silver"},
    "g_tier_gold":    {"order": 2, "tier": "gold"},
    "g_tier_diamond": {"order": 3, "tier": "diamond"},
}

PASS = 0
FAIL = 0
FAIL_DETAILS: List[str] = []


def _c(s: str, code: int) -> str:
    return f"\033[{code}m{s}\033[0m"


def expect(cond: bool, label: str, extra: Any = None):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(_c(f"  ✓ {label}", 32))
    else:
        FAIL += 1
        FAIL_DETAILS.append(f"{label} | {extra}" if extra is not None else label)
        print(_c(f"  ✗ {label}", 31) + (f"  [{extra}]" if extra is not None else ""))


def section(title: str):
    print("\n" + _c("=" * 72, 36))
    print(_c(f" {title}", 36))
    print(_c("=" * 72, 36))


def post(path: str, body: Any = None):
    return requests.post(f"{API}{path}", headers={"Content-Type": "application/json"},
                         data=json.dumps(body or {}), timeout=TIMEOUT)


def get(path: str, **params):
    return requests.get(f"{API}{path}", params=params or None, timeout=TIMEOUT)


def login_demo() -> Dict[str, Any]:
    r = post("/members/login", {"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return r.json()


def assert_tier_locked_payload(detail: Any, required: str, member_tier: str, label: str):
    is_dict = isinstance(detail, dict)
    expect(is_dict, f"{label}: detail é DICT (estruturado, não string)",
           extra=f"type={type(detail).__name__} value={detail}")
    if not is_dict:
        return
    expect(detail.get("error_code") == "TIER_LOCKED",
           f"{label}: detail.error_code == 'TIER_LOCKED'", extra=detail.get("error_code"))
    expect(detail.get("required_tier") == required,
           f"{label}: detail.required_tier == '{required}'", extra=detail.get("required_tier"))
    expect(detail.get("member_tier") == member_tier,
           f"{label}: detail.member_tier == '{member_tier}'", extra=detail.get("member_tier"))
    expect(isinstance(detail.get("message"), str) and len(detail["message"]) > 0,
           f"{label}: detail.message é string não-vazia", extra=detail.get("message"))


def main():
    global PASS, FAIL

    section("SETUP — demo login (expect tier=diamond)")
    demo = login_demo()
    demo_id = demo["member_id"]
    demo_tier = (demo.get("tier") or "").lower()
    print(f"  demo_id={demo_id}  tier={demo_tier}")
    expect(demo_tier == "diamond", "demo é Diamond", extra=demo_tier)
    if demo_tier != "diamond":
        print(_c("Demo não é Diamond; abortando testes (review exige Diamond).", 31))
        sys.exit(2)

    # ---------------------------------------------------------------
    # 1) GET /community/groups (no member_id)
    # ---------------------------------------------------------------
    section("1) GET /community/groups  (sem member_id)")
    r = get("/community/groups")
    expect(r.status_code == 200, "HTTP 200", extra=r.status_code)
    groups = r.json() if r.status_code == 200 else []
    expect(isinstance(groups, list), "resposta é lista")
    by_id = {g["group_id"]: g for g in groups if isinstance(g, dict) and "group_id" in g}

    for gid, meta in OFFICIAL_TIER_GROUPS.items():
        g = by_id.get(gid)
        expect(g is not None, f"grupo {gid} presente na listagem")
        if g is None:
            continue
        expect(g.get("tier_lock") == meta["tier"],
               f"{gid}.tier_lock == '{meta['tier']}'", extra=g.get("tier_lock"))
        expect(g.get("is_official_tier") is True,
               f"{gid}.is_official_tier == true", extra=g.get("is_official_tier"))
        expect(g.get("order") == meta["order"],
               f"{gid}.order == {meta['order']}", extra=g.get("order"))

    # Spec: "Grupos SEM tier_lock NÃO devem ter locked (ou locked=false) pois sem member_id não há filtro."
    # Verifica apenas grupos livres — grupos tier_lock sem member_id podem ter locked=true (safe default).
    free_free = [g for g in groups if not g.get("tier_lock")]
    expect(len(free_free) > 0, "há grupos sem tier_lock na listagem sem member_id",
           extra=len(free_free))
    for g in free_free:
        locked = g.get("locked", False)
        expect(locked is False,
               f"{g['group_id']} (sem tier_lock).locked False/ausente quando member_id ausente",
               extra=locked)

    # Observação informativa (não falha): tier_lock groups sem member_id devolvem locked=true
    for gid in OFFICIAL_TIER_GROUPS:
        g = by_id.get(gid)
        if g is None:
            continue
        print(f"  ℹ  {gid}.locked (sem member_id) = {g.get('locked')}  "
              f"(backend usa safe default — ver nota)")

    # ---------------------------------------------------------------
    # 2) GET /community/groups?member_id=<demo_id>  (demo é Diamond)
    # ---------------------------------------------------------------
    section("2) GET /community/groups?member_id=<demo_diamond_id>")
    r = get("/community/groups", member_id=demo_id)
    expect(r.status_code == 200, "HTTP 200", extra=r.status_code)
    groups2 = r.json() if r.status_code == 200 else []
    by_id2 = {g["group_id"]: g for g in groups2 if isinstance(g, dict) and "group_id" in g}

    # g_tier_black/silver/gold devem estar locked=true
    for gid in ("g_tier_black", "g_tier_silver", "g_tier_gold"):
        g = by_id2.get(gid)
        expect(g is not None, f"{gid} presente para demo Diamond")
        if g is None:
            continue
        expect(g.get("locked") is True,
               f"{gid}.locked == True para Diamond", extra=g.get("locked"))
        expect(g.get("required_tier") == OFFICIAL_TIER_GROUPS[gid]["tier"],
               f"{gid}.required_tier == '{OFFICIAL_TIER_GROUPS[gid]['tier']}'",
               extra=g.get("required_tier"))

    # g_tier_diamond → locked=false
    g_dia = by_id2.get("g_tier_diamond")
    expect(g_dia is not None, "g_tier_diamond presente para demo")
    if g_dia is not None:
        expect(g_dia.get("locked") is False,
               "g_tier_diamond.locked == False para Diamond", extra=g_dia.get("locked"))
        expect(g_dia.get("required_tier") == "diamond",
               "g_tier_diamond.required_tier == 'diamond'", extra=g_dia.get("required_tier"))

    # grupos sem tier_lock → locked=false e required_tier ausente
    free_groups = [g for g in groups2 if not g.get("tier_lock")]
    expect(len(free_groups) > 0, "há grupos sem tier_lock (livres)", extra=len(free_groups))
    for g in free_groups:
        expect(g.get("locked") is False,
               f"{g['group_id']} (livre) locked==False", extra=g.get("locked"))
        expect(g.get("required_tier") in (None, ""),
               f"{g['group_id']} (livre) sem required_tier",
               extra=g.get("required_tier"))

    # ---------------------------------------------------------------
    # 3) POST /community/groups/g_tier_diamond/join/<demo_id>  → 200
    # ---------------------------------------------------------------
    section("3) POST /community/groups/g_tier_diamond/join/<demo>  (esperado 200)")
    r = post(f"/community/groups/g_tier_diamond/join/{demo_id}")
    expect(r.status_code == 200, "HTTP 200", extra=f"{r.status_code} {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    expect(body.get("ok") is True, "ok == True", extra=body)

    # ---------------------------------------------------------------
    # 4) POST /community/groups/g_tier_black/join/<demo_id>  → 403 TIER_LOCKED
    # ---------------------------------------------------------------
    section("4) POST /community/groups/g_tier_black/join/<demo>  (esperado 403 TIER_LOCKED)")
    r = post(f"/community/groups/g_tier_black/join/{demo_id}")
    expect(r.status_code == 403, "HTTP 403", extra=f"{r.status_code} {r.text[:200]}")
    if r.status_code == 403:
        detail = r.json().get("detail")
        assert_tier_locked_payload(detail, required="black", member_tier="diamond",
                                   label="join g_tier_black")

    # ---------------------------------------------------------------
    # 5) POST /community/groups/g_tier_diamond/messages  (200, cria msg)
    # ---------------------------------------------------------------
    section("5) POST /community/groups/g_tier_diamond/messages  (200)")
    r = post("/community/groups/g_tier_diamond/messages",
             {"member_id": demo_id, "text": "Teste TIER-LOCK (diamond OK)"})
    expect(r.status_code == 200, "HTTP 200", extra=f"{r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        doc = r.json()
        expect(doc.get("group_id") == "g_tier_diamond",
               "doc.group_id == 'g_tier_diamond'", extra=doc.get("group_id"))
        expect(doc.get("member_id") == demo_id,
               "doc.member_id == demo_id", extra=doc.get("member_id"))
        expect(doc.get("text") == "Teste TIER-LOCK (diamond OK)",
               "doc.text preservado", extra=doc.get("text"))
        expect("created_at" in doc and bool(doc["created_at"]),
               "doc.created_at presente")

    # ---------------------------------------------------------------
    # 6) POST /community/groups/g_tier_black/messages  (403 TIER_LOCKED)
    # ---------------------------------------------------------------
    section("6) POST /community/groups/g_tier_black/messages  (403 TIER_LOCKED)")
    r = post("/community/groups/g_tier_black/messages",
             {"member_id": demo_id, "text": "Tentativa proibida"})
    expect(r.status_code == 403, "HTTP 403", extra=f"{r.status_code} {r.text[:200]}")
    if r.status_code == 403:
        detail = r.json().get("detail")
        assert_tier_locked_payload(detail, required="black", member_tier="diamond",
                                   label="messages g_tier_black")

    # ---------------------------------------------------------------
    # 7) GET /community/groups/g_tier_diamond/messages?member_id=<demo>  (200)
    # ---------------------------------------------------------------
    section("7) GET /community/groups/g_tier_diamond/messages?member_id=<demo>  (200)")
    r = get("/community/groups/g_tier_diamond/messages", member_id=demo_id)
    expect(r.status_code == 200, "HTTP 200", extra=f"{r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        msgs = r.json()
        expect(isinstance(msgs, list), "resposta é lista", extra=type(msgs).__name__)
        # pode estar vazia mas se teve post bem-sucedido no passo 5, deve conter pelo menos 1
        if isinstance(msgs, list):
            found = any(m.get("text") == "Teste TIER-LOCK (diamond OK)"
                        and m.get("member_id") == demo_id for m in msgs)
            expect(found, "mensagem criada no passo 5 está listada",
                   extra=f"len={len(msgs)}")

    # ---------------------------------------------------------------
    # 8) GET /community/groups/g_tier_black/messages?member_id=<demo>  (403)
    # ---------------------------------------------------------------
    section("8) GET /community/groups/g_tier_black/messages?member_id=<demo>  (403)")
    r = get("/community/groups/g_tier_black/messages", member_id=demo_id)
    expect(r.status_code == 403, "HTTP 403", extra=f"{r.status_code} {r.text[:200]}")
    if r.status_code == 403:
        detail = r.json().get("detail")
        assert_tier_locked_payload(detail, required="black", member_tier="diamond",
                                   label="GET messages g_tier_black")

    # ---------------------------------------------------------------
    # 9) GET /community/groups/g_tier_diamond/messages (sem member_id) → 200 legacy-safe
    # ---------------------------------------------------------------
    section("9) GET /community/groups/g_tier_diamond/messages (sem member_id)  (200 legacy)")
    r = get("/community/groups/g_tier_diamond/messages")
    expect(r.status_code == 200, "HTTP 200 (lock NÃO aplicado sem member_id)",
           extra=f"{r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        msgs = r.json()
        expect(isinstance(msgs, list), "resposta é lista", extra=type(msgs).__name__)

    # Também validar sem member_id em grupo bloqueado (deve permitir leitura — legacy safe)
    r = get("/community/groups/g_tier_black/messages")
    expect(r.status_code == 200,
           "GET g_tier_black/messages (sem member_id) → 200 (legacy-safe)",
           extra=f"{r.status_code} {r.text[:200]}")

    # ------------- RESUMO -------------
    section("RESULTADO FINAL")
    print(f"  PASS: {PASS}")
    print(f"  FAIL: {FAIL}")
    if FAIL:
        print(_c("\nFALHAS:", 31))
        for d in FAIL_DETAILS:
            print("  - " + d)
        sys.exit(1)
    print(_c("\nTIER-LOCK validation: OK ✓", 32))


if __name__ == "__main__":
    main()
