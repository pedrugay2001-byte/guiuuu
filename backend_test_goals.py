"""
BLACKSCLUB - Central de Performance Phase 1 — Goals endpoint deep test.

Tests NEW/MODIFIED /api/goals/* endpoints:
  POST   /api/goals
  POST   /api/goals/{goal_id}/entries
  GET    /api/goals/{goal_id}/detail
  POST   /api/goals/{goal_id}/daily-message
  GET    /api/goals/dashboard/{member_id}
  PATCH  /api/goals/{goal_id}
  GET    /api/goals/{member_id}
  DELETE /api/goals/{goal_id}

Uses internal URL http://localhost:8001 per review request.
Cleans up all goals created at the end.
"""
from __future__ import annotations
import json
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import requests

BASE = "http://localhost:8001/api"
MEMBER_ID = "mem_e5bb9b5878dd"

PASS = []
FAIL = []
CREATED_IDS: List[str] = []


def log_pass(name: str, info: str = ""):
    PASS.append((name, info))
    print(f"[PASS] {name} {info}")


def log_fail(name: str, info: str):
    FAIL.append((name, info))
    print(f"[FAIL] {name} :: {info}")


def today_plus(days: int) -> str:
    return (datetime.utcnow() + timedelta(days=days)).date().isoformat()


def post(path: str, body: dict, expected_status: int = 200) -> Optional[dict]:
    url = f"{BASE}{path}"
    try:
        r = requests.post(url, json=body, timeout=60)
    except Exception as e:
        log_fail(f"POST {path}", f"request error: {e}")
        return None
    if r.status_code != expected_status:
        log_fail(f"POST {path}", f"status {r.status_code} (expected {expected_status}): {r.text[:400]}")
        return None
    try:
        return r.json()
    except Exception:
        log_fail(f"POST {path}", f"non-json body: {r.text[:400]}")
        return None


def patch(path: str, body: dict, expected_status: int = 200) -> Optional[dict]:
    url = f"{BASE}{path}"
    try:
        r = requests.patch(url, json=body, timeout=30)
    except Exception as e:
        log_fail(f"PATCH {path}", f"request error: {e}")
        return None
    if r.status_code != expected_status:
        log_fail(f"PATCH {path}", f"status {r.status_code}: {r.text[:400]}")
        return None
    try:
        return r.json()
    except Exception:
        log_fail(f"PATCH {path}", f"non-json body: {r.text[:400]}")
        return None


def get(path: str, expected_status: int = 200) -> Optional[Any]:
    url = f"{BASE}{path}"
    try:
        r = requests.get(url, timeout=30)
    except Exception as e:
        log_fail(f"GET {path}", f"request error: {e}")
        return None
    if r.status_code != expected_status:
        log_fail(f"GET {path}", f"status {r.status_code}: {r.text[:400]}")
        return None
    try:
        return r.json()
    except Exception:
        log_fail(f"GET {path}", f"non-json body: {r.text[:400]}")
        return None


def delete(path: str, expected_status: int = 200) -> Optional[dict]:
    url = f"{BASE}{path}"
    try:
        r = requests.delete(url, timeout=30)
    except Exception as e:
        log_fail(f"DELETE {path}", f"request error: {e}")
        return None
    if r.status_code != expected_status:
        log_fail(f"DELETE {path}", f"status {r.status_code}: {r.text[:400]}")
        return None
    try:
        return r.json()
    except Exception:
        return {}


# ===========================================================================
# 1) POST /api/goals  —  create 5 types
# ===========================================================================

def test_create_goals() -> Dict[str, dict]:
    goals = {}

    fixtures = {
        "weight": dict(
            member_id=MEMBER_ID,
            type="weight",
            title="Perder peso teste",
            initial_value=90,
            current_value=89,
            target_value=82,
            unit="kg",
            end_date=today_plus(90),
            color="#2ECC71",
            description="Quero voltar ao meu peso ideal com disciplina.",
            motive="Saúde e energia para minha família.",
        ),
        "financial": dict(
            member_id=MEMBER_ID,
            type="financial",
            title="Aumentar patrimônio",
            initial_value=10000,
            current_value=12000,
            target_value=50000,
            unit="R$",
            end_date=today_plus(180),
        ),
        "habit": dict(
            member_id=MEMBER_ID,
            type="habit",
            title="Meditar diariamente",
            initial_value=0,
            current_value=0,
            target_value=60,
            unit="dias",
            end_date=today_plus(60),
        ),
        "behavior": dict(
            member_id=MEMBER_ID,
            type="behavior",
            title="Equilíbrio emocional",
            initial_value=5,
            current_value=5,
            target_value=8,
            unit="/10",
            end_date=today_plus(90),
        ),
        "productivity": dict(
            member_id=MEMBER_ID,
            type="productivity",
            title="Entregar projeto",
            initial_value=0,
            current_value=0,
            target_value=100,
            unit="%",
            end_date=today_plus(45),
        ),
    }

    required_fields = {
        "goal_id", "member_id", "type", "title",
        "initial_value", "target_value", "color",
        "description", "motive", "photo_initial",
        "history", "ideal_series",
    }

    for gtype, body in fixtures.items():
        data = post("/goals", body)
        if not data:
            continue
        missing = required_fields - set(data.keys())
        if missing:
            log_fail(f"create goal {gtype}", f"missing fields in response: {missing}")
            continue

        # sanity: initial_value should reflect what we sent (not current_value)
        if gtype == "weight" and float(data["initial_value"]) != 90.0:
            log_fail(
                f"create goal {gtype}",
                f"initial_value should be 90 (input), got {data['initial_value']}",
            )
            continue
        if gtype == "financial" and float(data["initial_value"]) != 10000.0:
            log_fail(f"create goal {gtype}", f"initial_value should be 10000, got {data['initial_value']}")
            continue

        goals[gtype] = data
        CREATED_IDS.append(data["goal_id"])
        log_pass(
            f"create goal {gtype}",
            f"goal_id={data['goal_id']} initial={data['initial_value']} target={data['target_value']} color={data['color']}",
        )

    return goals


# ===========================================================================
# 2) POST /api/goals/{goal_id}/entries
# ===========================================================================

def test_add_entries(goals: Dict[str, dict]):
    # Weight entry
    gw = goals.get("weight")
    if gw:
        r = post(f"/goals/{gw['goal_id']}/entries", {"value": 88.5, "note": "melhor dia"})
        if r and r.get("ok") and "entry_id" in r and "goal" in r:
            log_pass("entry weight basic", f"current={r['goal']['current_value']} progress_pct={r['goal']['progress_pct']}")
            # weight progress should be positive using initial_value 90 (baseline) — going 90 -> 88.5 toward target 82
            prog = r['goal']['progress_pct']
            if prog > 0:
                log_pass("weight progress uses initial_value baseline", f"progress_pct={prog}")
            else:
                log_fail("weight progress uses initial_value baseline", f"progress_pct={prog} (expected > 0)")
        else:
            log_fail("entry weight basic", f"bad shape: {r}")

        # weight entry with photo (small base64 sample)
        tiny_png = (
            "data:image/png;base64,"
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        r2 = post(f"/goals/{gw['goal_id']}/entries", {"value": 88.0, "note": "com foto", "photo_base64": tiny_png})
        if r2 and r2.get("ok"):
            log_pass("entry weight with photo", "accepted")
        else:
            log_fail("entry weight with photo", f"bad shape: {r2}")

    # Financial entry
    gf = goals.get("financial")
    if gf:
        r = post(f"/goals/{gf['goal_id']}/entries", {"value": 15000})
        if r and r.get("ok"):
            log_pass("entry financial", f"current={r['goal']['current_value']}")
        else:
            log_fail("entry financial", f"bad: {r}")

    # Habit entry (3 check-ins, different dates)
    gh = goals.get("habit")
    if gh:
        base = datetime.utcnow()
        dates = [
            (base - timedelta(days=2)).isoformat(),
            (base - timedelta(days=1)).isoformat(),
            base.isoformat(),
        ]
        last = None
        for d in dates:
            last = post(f"/goals/{gh['goal_id']}/entries", {"value": 1, "date": d})
            if not last:
                break
        if last and last.get("ok"):
            goal = last["goal"]
            cv = goal.get("current_value")
            pp = goal.get("progress_pct")
            done_count = goal.get("done_count")
            expected_count = goal.get("expected_count")
            ok_cv = abs(float(cv) - 3.0) < 0.001
            ok_pp = abs(float(pp) - 5.0) < 0.5  # 3/60 = 5.0
            ok_done = done_count == 3
            ok_exp = expected_count == 60
            if ok_cv and ok_pp and ok_done and ok_exp:
                log_pass(
                    "entry habit (3 check-ins)",
                    f"current_value=3 progress_pct≈5 (got {pp}) done_count=3 expected_count=60",
                )
            else:
                log_fail(
                    "entry habit (3 check-ins)",
                    f"expected current=3,progress≈5,done=3,expected=60 — got current={cv} progress={pp} done={done_count} expected={expected_count}",
                )
        else:
            log_fail("entry habit (3 check-ins)", f"last response bad: {last}")

    # Behavior entry
    gb = goals.get("behavior")
    if gb:
        r = post(f"/goals/{gb['goal_id']}/entries", {"value": 7, "mood": 4})
        if r and r.get("ok"):
            goal = r["goal"]
            cv = goal.get("current_value")
            pp = goal.get("progress_pct")
            avg = goal.get("avg_score")
            ok_cv = abs(float(cv) - 7.0) < 0.01
            ok_avg = abs(float(avg) - 7.0) < 0.01
            ok_pp = abs(float(pp) - 87.5) < 0.5  # 7/8 = 87.5
            if ok_cv and ok_avg and ok_pp:
                log_pass("entry behavior value=7 mood=4", f"current=7 avg_score=7 progress_pct≈87.5 (got {pp})")
            else:
                log_fail(
                    "entry behavior value=7 mood=4",
                    f"expected current≈7, avg_score≈7, progress≈87.5 — got current={cv} avg={avg} progress={pp}",
                )
        else:
            log_fail("entry behavior value=7 mood=4", f"bad: {r}")


# ===========================================================================
# 3) GET /api/goals/{goal_id}/detail
# ===========================================================================

def test_detail(goals: Dict[str, dict]):
    for gtype in ["weight", "habit"]:
        g = goals.get(gtype)
        if not g:
            continue
        data = get(f"/goals/{g['goal_id']}/detail")
        if not data:
            continue
        required = {"goal", "entries", "photos"}
        missing = required - set(data.keys())
        if missing:
            log_fail(f"detail {gtype}", f"missing keys: {missing}")
            continue
        if not isinstance(data["entries"], list) or not isinstance(data["photos"], list):
            log_fail(f"detail {gtype}", "entries or photos not list")
            continue
        # For weight, we added a photo
        if gtype == "weight":
            if len(data["photos"]) >= 1 and data["photos"][0].get("photo_base64"):
                log_pass(f"detail {gtype}", f"entries={len(data['entries'])} photos={len(data['photos'])} (photo attached)")
            else:
                log_fail(f"detail {gtype}", f"expected ≥1 photo, got {len(data['photos'])}")
        else:
            log_pass(f"detail {gtype}", f"entries={len(data['entries'])} photos={len(data['photos'])}")


# ===========================================================================
# 4) POST /api/goals/{goal_id}/daily-message
# ===========================================================================

def test_daily_message(goals: Dict[str, dict]):
    required = {"day_label", "headline", "focus", "verse", "verse_ref", "parable", "closing",
                "goal_title", "goal_type", "goal_color"}
    for gtype, g in goals.items():
        data = post(f"/goals/{g['goal_id']}/daily-message", {})
        if not data:
            continue
        missing = required - set(data.keys())
        if missing:
            log_fail(f"daily-message {gtype}", f"missing fields: {missing}")
            continue
        # Portuguese sanity check
        joined = " ".join([str(data.get(k, "")) for k in ["day_label", "headline", "focus", "parable", "closing"]]).lower()
        # simple heuristic: at least one common PT stopword or accented char
        pt_hit = any(w in joined for w in [" de ", " da ", " do ", " você", " seu ", " sua ", " não ", "ção", "á", "é", "í", "ó", "ú", "ã", "ç"])
        # No emojis check (basic): no common emoji ranges
        import re
        emoji_pat = re.compile(r"[\U0001F300-\U0001FAFF\U0001F600-\U0001F64F\U0001F680-\U0001F6FF\u2600-\u27BF]")
        has_emoji = bool(emoji_pat.search(joined))
        if pt_hit and not has_emoji:
            log_pass(f"daily-message {gtype}", f"pt ok, no emoji, headline='{data['headline'][:60]}'")
        else:
            log_fail(
                f"daily-message {gtype}",
                f"pt={pt_hit} has_emoji={has_emoji} headline='{data.get('headline','')[:80]}'",
            )


# ===========================================================================
# 5) GET /api/goals/dashboard/{member_id}
# ===========================================================================

def test_dashboard():
    data = get(f"/goals/dashboard/{MEMBER_ID}")
    if not data:
        return
    required = {"has_goals", "active_count", "overall_progress", "avg_rhythm", "goals_summary"}
    missing = required - set(data.keys())
    if missing:
        log_fail("dashboard", f"missing fields: {missing}")
        return
    if not data["has_goals"]:
        log_fail("dashboard", f"expected has_goals=true, got {data}")
        return
    gs = data["goals_summary"]
    if not isinstance(gs, list) or len(gs) < 1:
        log_fail("dashboard goals_summary", f"expected non-empty list, got {gs}")
        return
    summary_required = {"goal_id", "title", "type", "color", "progress_pct"}
    bad = []
    for item in gs:
        missing = summary_required - set(item.keys())
        if missing:
            bad.append((item.get("goal_id"), missing))
    if bad:
        log_fail("dashboard goals_summary shape", f"missing in items: {bad}")
    else:
        log_pass(
            "dashboard",
            f"has_goals=true active={data['active_count']} overall={data['overall_progress']} avg_rhythm={data['avg_rhythm']} summary_len={len(gs)}",
        )


# ===========================================================================
# 6) PATCH /api/goals/{goal_id}
# ===========================================================================

def test_patch(goals: Dict[str, dict]):
    g = goals.get("weight")
    if not g:
        return
    new_title = "Perder peso teste — atualizado"
    new_color = "#123456"
    r = patch(f"/goals/{g['goal_id']}", {"title": new_title, "color": new_color})
    if not r:
        return
    if r.get("title") != new_title or r.get("color") != new_color:
        log_fail("patch goal", f"response didn't reflect update: title={r.get('title')} color={r.get('color')}")
        return
    # Re-fetch via list to confirm persistence
    goals_list = get(f"/goals/{MEMBER_ID}")
    persisted = None
    if isinstance(goals_list, list):
        persisted = next((x for x in goals_list if x["goal_id"] == g["goal_id"]), None)
    if persisted and persisted.get("title") == new_title and persisted.get("color") == new_color:
        log_pass("patch goal", f"title+color updated and persisted")
    else:
        log_fail("patch goal", f"persistence check failed: {persisted}")


# ===========================================================================
# 8) GET /api/goals/{member_id}
# ===========================================================================

def test_list(goals: Dict[str, dict]):
    data = get(f"/goals/{MEMBER_ID}")
    if not isinstance(data, list):
        log_fail("list goals", f"expected list, got {type(data)}")
        return
    ids_in_list = {g["goal_id"] for g in data}
    expected_ids = {g["goal_id"] for g in goals.values()}
    missing = expected_ids - ids_in_list
    if missing:
        log_fail("list goals", f"created goals missing from list: {missing}")
        return
    # check shape — history must be populated for at least some
    shape_required = {"goal_id", "title", "type", "history", "ideal_series", "initial_value", "target_value"}
    bad = []
    for g in data:
        if g["goal_id"] not in expected_ids:
            continue
        missing = shape_required - set(g.keys())
        if missing:
            bad.append((g["goal_id"], missing))
    if bad:
        log_fail("list goals shape", f"items missing fields: {bad}")
        return
    # history populated for goals that have entries
    pops = {g["goal_id"]: len(g.get("history", [])) for g in data if g["goal_id"] in expected_ids}
    log_pass("list goals", f"{len(expected_ids)} goals listed, history lengths={pops}")


# ===========================================================================
# 9) DELETE /api/goals/{goal_id} (archive productivity one)
# ===========================================================================

def test_archive(goals: Dict[str, dict]):
    g = goals.get("productivity")
    if not g:
        return
    r = delete(f"/goals/{g['goal_id']}")
    if not r or not r.get("ok"):
        log_fail("archive productivity goal", f"bad: {r}")
        return
    # confirm not in list
    lst = get(f"/goals/{MEMBER_ID}")
    if not isinstance(lst, list):
        log_fail("archive productivity goal (list check)", "list not returned")
        return
    ids = {x["goal_id"] for x in lst}
    if g["goal_id"] in ids:
        log_fail("archive productivity goal", "still present in list after archive")
        return
    # confirm not in dashboard summary
    dash = get(f"/goals/dashboard/{MEMBER_ID}")
    if dash and any(s["goal_id"] == g["goal_id"] for s in dash.get("goals_summary", [])):
        log_fail("archive productivity goal", "still present in dashboard goals_summary")
        return
    log_pass("archive productivity goal", "no longer in list or dashboard")


# ===========================================================================
# Cleanup
# ===========================================================================

def cleanup():
    for gid in CREATED_IDS:
        try:
            delete(f"/goals/{gid}")
        except Exception:
            pass
    print(f"\n[cleanup] archived {len(CREATED_IDS)} test goals")


# ===========================================================================
# MAIN
# ===========================================================================

def main():
    print(f"Testing against {BASE} for member {MEMBER_ID}\n")
    try:
        # Health check
        r = requests.get(f"{BASE}/plans", timeout=10)
        if r.status_code != 200:
            print(f"Backend not healthy: /plans -> {r.status_code}")
            sys.exit(1)
    except Exception as e:
        print(f"Cannot reach backend: {e}")
        sys.exit(1)

    goals = test_create_goals()
    if not goals:
        print("No goals created — abort")
        sys.exit(1)

    test_add_entries(goals)
    test_detail(goals)
    test_daily_message(goals)
    test_dashboard()
    test_patch(goals)
    test_list(goals)
    test_archive(goals)

    cleanup()

    print("\n=================================================")
    print(f"PASS: {len(PASS)}")
    print(f"FAIL: {len(FAIL)}")
    if FAIL:
        print("\nFailures:")
        for name, info in FAIL:
            print(f"  - {name}: {info}")
    sys.exit(0 if not FAIL else 1)


if __name__ == "__main__":
    main()
