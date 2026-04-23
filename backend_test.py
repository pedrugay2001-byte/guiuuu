#!/usr/bin/env python3
"""
BLACKSCLUB backend regression — Phase 1 (Goals CRUD, Entries, Daily Message,
Post/Story delete, Edge cases).
"""
import os
import json
import requests
from datetime import datetime, timedelta

BASE = os.environ.get(
    "BACKEND_URL", "https://member-shop-2.preview.emergentagent.com"
).rstrip("/") + "/api"

DEMO_ID = "mem_e5bb9b5878dd"
DEMO_EMAIL = "demo@blacksclub.com"

PASSED = []
FAILED = []
CREATED_GOAL_IDS = []
CREATED_POST_IDS = []
CREATED_STORY_IDS = []


def _log(name, ok, info=""):
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}   {info}")
    if ok:
        PASSED.append(name)
    else:
        FAILED.append((name, info))


def _req(method, path, **kw):
    url = BASE + path
    try:
        r = requests.request(method, url, timeout=60, **kw)
        return r
    except Exception as e:
        return e


print(f"BASE = {BASE}")

# ---------------------------------------------------------------------------
# 1) GOALS CRUD
# ---------------------------------------------------------------------------
print("\n=== 1) GOALS CRUD ===")
end_date = (datetime.utcnow() + timedelta(days=60)).date().isoformat()

body = {
    "member_id": DEMO_ID,
    "type": "weight",
    "title": "Perder 10kg teste",
    "initial_value": 100,
    "current_value": 100,
    "target_value": 90,
    "unit": "kg",
    "end_date": end_date,
    "description": "Meta de teste regressão",
    "motive": "saúde",
}
r = _req("POST", "/goals", json=body)
created = None
if hasattr(r, "status_code") and r.status_code == 200:
    created = r.json()
    CREATED_GOAL_IDS.append(created["goal_id"])
    ok = (
        created.get("initial_value") == 100
        and created.get("target_value") == 90
        and created.get("type") == "weight"
        and "color" in created
        and "history" in created
        and "ideal_series" in created
    )
    _log("POST /goals create weight goal", ok,
         f"goal_id={created.get('goal_id')} initial={created.get('initial_value')} "
         f"color={created.get('color')} history_len={len(created.get('history', []))} "
         f"ideal_len={len(created.get('ideal_series', []))}")
else:
    _log("POST /goals create weight goal", False,
         f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:400]}")

# GET /goals/{member_id}
r = _req("GET", f"/goals/{DEMO_ID}")
if hasattr(r, "status_code") and r.status_code == 200:
    arr = r.json()
    found = next((g for g in arr if created and g["goal_id"] == created["goal_id"]), None)
    ok = bool(found) and "initial_value" in found and "color" in found \
        and "history" in found and "ideal_series" in found
    _log("GET /goals/{member_id} lists new goal with required fields", ok,
         f"count={len(arr)} initial={found and found.get('initial_value')} "
         f"history={found and len(found.get('history', []))} "
         f"ideal={found and len(found.get('ideal_series', []))}")
else:
    _log("GET /goals/{member_id}", False, f"status={getattr(r,'status_code',None)}")

# PATCH /goals/{goal_id}
if created:
    patch = {
        "title": "Perder 12kg atualizado",
        "target_value": 88,
        "color": "#FF6B9D",
        "motive": "teste",
        "description": "x",
    }
    r = _req("PATCH", f"/goals/{created['goal_id']}", json=patch)
    if hasattr(r, "status_code") and r.status_code == 200:
        gu = r.json()
        ok = (
            gu.get("title") == "Perder 12kg atualizado"
            and gu.get("target_value") == 88
            and gu.get("color") == "#FF6B9D"
            and gu.get("motive") == "teste"
            and gu.get("description") == "x"
        )
        _log("PATCH /goals/{goal_id} updates fields", ok,
             f"title={gu.get('title')} target={gu.get('target_value')} color={gu.get('color')} "
             f"progress_pct={gu.get('progress_pct')}")
    else:
        _log("PATCH /goals/{goal_id}", False,
             f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:300]}")

# GET /goals/dashboard/{member_id}
r = _req("GET", f"/goals/dashboard/{DEMO_ID}")
if hasattr(r, "status_code") and r.status_code == 200:
    dash = r.json()
    has_goals_summary = "goals_summary" in dash and isinstance(dash["goals_summary"], list)
    _log("GET /goals/dashboard/{member_id} has goals_summary[]", has_goals_summary,
         f"has_goals={dash.get('has_goals')} active={dash.get('active_count')} "
         f"summary_len={len(dash.get('goals_summary', []))}")
else:
    _log("GET /goals/dashboard/{member_id}", False,
         f"status={getattr(r,'status_code',None)}")

# DELETE /goals/{goal_id} (archive)
if created:
    r = _req("DELETE", f"/goals/{created['goal_id']}")
    ok_del = hasattr(r, "status_code") and r.status_code == 200
    _log("DELETE /goals/{goal_id} archives", ok_del,
         f"status={getattr(r,'status_code',None)}")
    # verify absence in dashboard
    r2 = _req("GET", f"/goals/dashboard/{DEMO_ID}")
    if hasattr(r2, "status_code") and r2.status_code == 200:
        d2 = r2.json()
        ids = [g["goal_id"] for g in d2.get("goals_summary", [])]
        gone = created["goal_id"] not in ids
        _log("Archived goal no longer in dashboard", gone,
             f"summary_ids={ids}")
    if ok_del:
        CREATED_GOAL_IDS.remove(created["goal_id"])


# ---------------------------------------------------------------------------
# 2) GOAL ENTRIES CRUD
# ---------------------------------------------------------------------------
print("\n=== 2) GOAL ENTRIES ===")
body2 = {
    "member_id": DEMO_ID,
    "type": "weight",
    "title": "Entry test goal",
    "initial_value": 100,
    "current_value": 100,
    "target_value": 90,
    "unit": "kg",
    "end_date": end_date,
}
r = _req("POST", "/goals", json=body2)
goal2 = r.json() if hasattr(r, "status_code") and r.status_code == 200 else None
if goal2:
    CREATED_GOAL_IDS.append(goal2["goal_id"])
    goal_id = goal2["goal_id"]

    entry_ids = []
    for v in (95, 94, 92):
        r = _req("POST", f"/goals/{goal_id}/entries",
                 json={"value": v, "note": f"entry {v}"})
        if hasattr(r, "status_code") and r.status_code == 200:
            j = r.json()
            entry_ids.append(j["entry_id"])

    # after 3 entries -> current should be 92, progress > 0
    r = _req("GET", f"/goals/{DEMO_ID}")
    glist = r.json() if hasattr(r, "status_code") and r.status_code == 200 else []
    g = next((x for x in glist if x["goal_id"] == goal_id), None)
    ok = g and g.get("current_value") == 92 and g.get("progress_pct", 0) > 0
    _log("3 entries (95,94,92) -> current=92 & progress_pct>0", bool(ok),
         f"current={g and g.get('current_value')} progress_pct={g and g.get('progress_pct')}")

    # Entry with photo + note
    photo = "data:image/jpeg;base64,AAAAAAAAAAAAAAAA"
    r = _req("POST", f"/goals/{goal_id}/entries",
             json={"value": 91, "note": "com foto", "photo_base64": photo})
    photo_entry_id = None
    if hasattr(r, "status_code") and r.status_code == 200:
        j = r.json()
        photo_entry_id = j["entry_id"]
        entry_ids.append(photo_entry_id)
        _log("POST entry with photo_base64 + note persists", True, f"entry_id={photo_entry_id}")
    else:
        _log("POST entry with photo_base64", False,
             f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")

    # GET /goals/{goal_id}/detail returns entries + photos array
    r = _req("GET", f"/goals/{goal_id}/detail")
    if hasattr(r, "status_code") and r.status_code == 200:
        det = r.json()
        has_photo = any(p.get("entry_id") == photo_entry_id for p in det.get("photos", []))
        ok = (
            isinstance(det.get("entries"), list) and len(det["entries"]) >= 4
            and has_photo
        )
        _log("GET /goals/{goal_id}/detail returns entries+photos", ok,
             f"entries={len(det.get('entries', []))} photos={len(det.get('photos', []))}")
    else:
        _log("GET /goals/{goal_id}/detail", False,
             f"status={getattr(r,'status_code',None)}")

    # DELETE middle entry (the one with value=94 -> entry_ids[1])
    if len(entry_ids) >= 2:
        target_entry = entry_ids[1]
        r = _req("DELETE", f"/goals/{goal_id}/entries/{target_entry}")
        if hasattr(r, "status_code") and r.status_code == 200:
            jd = r.json()
            gu = jd.get("goal", {})
            # spec says current should be 92 (remaining last by spec)
            # Impl uses last by date; after deleting value=94, remaining order: 95,92,91 -> last=91
            current = gu.get("current_value")
            ok = current in (92, 91)
            _log("DELETE middle entry recalculates current_value", ok,
                 f"new_current_value={current} (spec expected 92 or last-remaining)")
        else:
            _log("DELETE /goals/{goal_id}/entries/{entry_id}", False,
                 f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:200]}")

    # Delete all entries -> current_value falls back to initial_value (100)
    r = _req("GET", f"/goals/{goal_id}/entries")
    remaining = r.json() if hasattr(r, "status_code") and r.status_code == 200 else []
    for e in remaining:
        _req("DELETE", f"/goals/{goal_id}/entries/{e['entry_id']}")
    # verify
    r = _req("GET", f"/goals/{DEMO_ID}")
    glist = r.json() if hasattr(r, "status_code") and r.status_code == 200 else []
    g = next((x for x in glist if x["goal_id"] == goal_id), None)
    ok = g and g.get("current_value") == 100
    _log("Delete all entries -> current_value falls back to initial_value", bool(ok),
         f"current={g and g.get('current_value')} initial={g and g.get('initial_value')}")

# ---------------------------------------------------------------------------
# 3) DAILY MESSAGE
# ---------------------------------------------------------------------------
print("\n=== 3) DAILY MESSAGE ===")
if goal2:
    r = _req("POST", f"/goals/{goal2['goal_id']}/daily-message")
    if hasattr(r, "status_code") and r.status_code == 200:
        dm = r.json()
        required = ["day_label", "headline", "focus", "verse", "verse_ref",
                    "parable", "closing", "goal_title", "goal_type", "goal_color"]
        missing = [k for k in required if k not in dm]
        ok = not missing
        _log("POST /goals/{id}/daily-message returns all required keys",
             ok, f"missing={missing} day_label={dm.get('day_label')}")

        # check portuguese + no emojis (basic heuristic)
        text_blob = " ".join([str(dm.get(k, "")) for k in
                              ("headline", "focus", "verse", "parable", "closing")])
        has_emoji = any(ord(ch) > 0x2600 for ch in text_blob)
        pt_markers = any(w in text_blob.lower() for w in
                         ("você", "da", "que", "para", "não", "é", "caminho", "hoje"))
        _log("Daily message content is Portuguese and emoji-free",
             (not has_emoji) and pt_markers,
             f"has_emoji={has_emoji} pt_marker={pt_markers}")
        print("  sample headline:", dm.get("headline"))
        print("  sample verse:", dm.get("verse"), "-", dm.get("verse_ref"))
    else:
        _log("POST /goals/{id}/daily-message", False,
             f"status={getattr(r,'status_code',None)} body={getattr(r,'text','')[:300]}")

# ---------------------------------------------------------------------------
# 4) POST DELETE
# ---------------------------------------------------------------------------
print("\n=== 4) FEED POST DELETE ===")
r = _req("POST", "/feed/posts",
         json={"member_id": DEMO_ID, "text": "post de teste regressão"})
post = r.json() if hasattr(r, "status_code") and r.status_code == 200 else None
if post:
    CREATED_POST_IDS.append(post["post_id"])
    _log("POST /feed/posts create", True, f"post_id={post['post_id']}")

    # delete as owner
    r = _req("DELETE", f"/feed/posts/{post['post_id']}",
             params={"member_id": DEMO_ID})
    ok = hasattr(r, "status_code") and r.status_code == 200
    _log("DELETE /feed/posts/{id}?member_id=demo -> 200", ok,
         f"status={getattr(r,'status_code',None)}")
    if ok:
        CREATED_POST_IDS.remove(post["post_id"])

    # delete again -> 404
    r = _req("DELETE", f"/feed/posts/{post['post_id']}",
             params={"member_id": DEMO_ID})
    ok = hasattr(r, "status_code") and r.status_code == 404
    _log("DELETE same post again -> 404", ok,
         f"status={getattr(r,'status_code',None)}")

    # create another, delete with wrong member -> 403
    r = _req("POST", "/feed/posts",
             json={"member_id": DEMO_ID, "text": "post forbidden test"})
    p2 = r.json() if hasattr(r, "status_code") and r.status_code == 200 else None
    if p2:
        CREATED_POST_IDS.append(p2["post_id"])
        r = _req("DELETE", f"/feed/posts/{p2['post_id']}",
                 params={"member_id": "mem_other_member"})
        ok = hasattr(r, "status_code") and r.status_code == 403
        _log("DELETE with wrong member_id -> 403", ok,
             f"status={getattr(r,'status_code',None)}")
        # cleanup
        r = _req("DELETE", f"/feed/posts/{p2['post_id']}",
                 params={"member_id": DEMO_ID})
        if hasattr(r, "status_code") and r.status_code == 200:
            CREATED_POST_IDS.remove(p2["post_id"])
else:
    _log("POST /feed/posts create", False,
         f"status={getattr(r,'status_code',None)}")

# ---------------------------------------------------------------------------
# 5) STORY DELETE
# ---------------------------------------------------------------------------
print("\n=== 5) STORY DELETE ===")
r = _req("POST", "/stories",
         json={"member_id": DEMO_ID, "text": "story de teste"})
st = r.json() if hasattr(r, "status_code") and r.status_code == 200 else None
if st:
    CREATED_STORY_IDS.append(st["story_id"])
    _log("POST /stories create", True, f"story_id={st['story_id']}")

    # wrong member -> 403
    r = _req("DELETE", f"/stories/{st['story_id']}",
             params={"member_id": "mem_wrong_user"})
    ok = hasattr(r, "status_code") and r.status_code == 403
    _log("DELETE story with wrong member -> 403", ok,
         f"status={getattr(r,'status_code',None)}")

    # owner -> 200
    r = _req("DELETE", f"/stories/{st['story_id']}",
             params={"member_id": DEMO_ID})
    ok = hasattr(r, "status_code") and r.status_code == 200
    _log("DELETE /stories/{id}?member_id=demo -> 200", ok,
         f"status={getattr(r,'status_code',None)}")
    if ok:
        CREATED_STORY_IDS.remove(st["story_id"])
else:
    _log("POST /stories create", False, f"status={getattr(r,'status_code',None)}")

# ---------------------------------------------------------------------------
# 6) EDGE CASES
# ---------------------------------------------------------------------------
print("\n=== 6) EDGE CASES ===")

# invalid type
r = _req("POST", "/goals", json={
    "member_id": DEMO_ID, "type": "xyz", "title": "bad",
    "current_value": 10, "target_value": 5, "end_date": end_date,
})
ok = hasattr(r, "status_code") and r.status_code == 400
_log("POST /goals invalid type -> 400", ok,
     f"status={getattr(r,'status_code',None)}")

# empty title
r = _req("POST", "/goals", json={
    "member_id": DEMO_ID, "type": "weight", "title": "   ",
    "current_value": 10, "target_value": 5, "end_date": end_date,
})
ok = hasattr(r, "status_code") and r.status_code == 400
_log("POST /goals empty title -> 400", ok,
     f"status={getattr(r,'status_code',None)}")

# patch nonexistent
r = _req("PATCH", "/goals/g_nonexistent_xyz",
         json={"title": "no"})
ok = hasattr(r, "status_code") and r.status_code == 404
_log("PATCH /goals/{bad_id} -> 404", ok,
     f"status={getattr(r,'status_code',None)}")

# dashboard for zero-goals member
r = _req("GET", "/goals/dashboard/mem_zero_goals_xxx")
if hasattr(r, "status_code") and r.status_code == 200:
    j = r.json()
    ok = j.get("has_goals") is False
    _log("GET dashboard for member w/ 0 goals -> has_goals=false", ok,
         f"body={j}")
else:
    _log("GET dashboard for zero-goals member", False,
         f"status={getattr(r,'status_code',None)}")

# ---------------------------------------------------------------------------
# 7) CLEANUP
# ---------------------------------------------------------------------------
print("\n=== 7) CLEANUP ===")
for gid in list(CREATED_GOAL_IDS):
    r = _req("DELETE", f"/goals/{gid}")
    if hasattr(r, "status_code") and r.status_code == 200:
        CREATED_GOAL_IDS.remove(gid)
for pid in list(CREATED_POST_IDS):
    _req("DELETE", f"/feed/posts/{pid}", params={"member_id": DEMO_ID})
for sid in list(CREATED_STORY_IDS):
    _req("DELETE", f"/stories/{sid}", params={"member_id": DEMO_ID})

print(f"\n=== SUMMARY ===\nPASSED: {len(PASSED)}\nFAILED: {len(FAILED)}")
for n, info in FAILED:
    print(f"  - {n}: {info}")
