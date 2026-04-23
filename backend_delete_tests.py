"""
Test DELETE endpoints (Phase 1 - content deletion) for BLACKSCLUB backend.

Targets:
- DELETE /api/feed/posts/{post_id}?member_id=...
- DELETE /api/stories/{story_id}?member_id=...
- DELETE /api/goals/{goal_id}/entries/{entry_id}  (weight / habit / behavior)
"""
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

# ---- Config ----------------------------------------------------------------
FRONTEND_ENV = "/app/frontend/.env"
BASE = None
with open(FRONTEND_ENV) as f:
    for line in f:
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().strip('"')
            break
if not BASE:
    print("[FATAL] EXPO_PUBLIC_BACKEND_URL not found")
    sys.exit(1)
API = f"{BASE}/api"
DEMO = "mem_e5bb9b5878dd"
OTHER = "mem_other_fake_999"

print(f"[INFO] API base: {API}")
print(f"[INFO] Demo member: {DEMO}")

results = []
created_goals = []  # goal_ids for cleanup
created_posts = []
created_stories = []


def record(name, passed, detail=""):
    mark = "PASS" if passed else "FAIL"
    line = f"[{mark}] {name}"
    if detail:
        line += f" -- {detail}"
    print(line)
    results.append((name, passed, detail))


def req(method, path, **kw):
    url = API + path
    kw.setdefault("timeout", 30)
    return requests.request(method, url, **kw)


# ---- 0. Ensure demo exists --------------------------------------------------
r = req("GET", f"/members/{DEMO}")
if r.status_code != 200:
    record("demo member exists", False, f"status={r.status_code} body={r.text[:200]}")
    sys.exit(1)
record("demo member exists", True)


# ============================================================================
# 1. DELETE /api/feed/posts/{post_id}
# ============================================================================
print("\n=== 1. DELETE /api/feed/posts ===")

# Create post
r = req("POST", "/feed/posts", json={"member_id": DEMO, "text": "test post for delete"})
if r.status_code != 200:
    record("create post #1", False, f"status={r.status_code} {r.text[:200]}")
else:
    post1 = r.json()
    record("create post #1", True, f"post_id={post1.get('post_id')}")
    created_posts.append(post1["post_id"])

    # Delete with correct member_id
    r = req("DELETE", f"/feed/posts/{post1['post_id']}", params={"member_id": DEMO})
    ok = r.status_code == 200 and r.json().get("ok") is True
    record("delete post with correct member_id -> 200+{ok:true}", ok,
           f"status={r.status_code} body={r.text[:200]}")
    if ok:
        created_posts.remove(post1["post_id"])

    # Delete again -> 404
    r = req("DELETE", f"/feed/posts/{post1['post_id']}", params={"member_id": DEMO})
    record("delete already-deleted post -> 404", r.status_code == 404,
           f"status={r.status_code}")

# Create second post and try delete with WRONG member_id
r = req("POST", "/feed/posts", json={"member_id": DEMO, "text": "test post 2 (wrong author delete)"})
if r.status_code == 200:
    post2 = r.json()
    created_posts.append(post2["post_id"])
    r = req("DELETE", f"/feed/posts/{post2['post_id']}", params={"member_id": OTHER})
    record("delete post with wrong member_id -> 403", r.status_code == 403,
           f"status={r.status_code} body={r.text[:200]}")
else:
    record("create post #2", False, f"status={r.status_code}")


# ============================================================================
# 2. DELETE /api/stories/{story_id}
# ============================================================================
print("\n=== 2. DELETE /api/stories ===")

r = req("POST", "/stories", json={"member_id": DEMO, "text": "teste"})
if r.status_code != 200:
    record("create story #1", False, f"status={r.status_code} {r.text[:200]}")
else:
    story1 = r.json()
    record("create story #1", True, f"story_id={story1.get('story_id')}")
    created_stories.append(story1["story_id"])

    # 403 with wrong member_id first
    r = req("DELETE", f"/stories/{story1['story_id']}", params={"member_id": OTHER})
    record("delete story with wrong member_id -> 403", r.status_code == 403,
           f"status={r.status_code} body={r.text[:200]}")

    # 200 with correct member_id
    r = req("DELETE", f"/stories/{story1['story_id']}", params={"member_id": DEMO})
    ok = r.status_code == 200 and r.json().get("ok") is True
    record("delete story with correct member_id -> 200+{ok:true}", ok,
           f"status={r.status_code} body={r.text[:200]}")
    if ok:
        created_stories.remove(story1["story_id"])

    # 404 after already deleted
    r = req("DELETE", f"/stories/{story1['story_id']}", params={"member_id": DEMO})
    record("delete already-deleted story -> 404", r.status_code == 404,
           f"status={r.status_code}")


# ============================================================================
# 3. DELETE /api/goals/{goal_id}/entries/{entry_id} -- weight goal
# ============================================================================
print("\n=== 3. DELETE /goals/{id}/entries/{id} (WEIGHT goal) ===")
end_date = (datetime.now(timezone.utc) + timedelta(days=60)).strftime("%Y-%m-%d")

r = req("POST", "/goals", json={
    "member_id": DEMO,
    "type": "weight",
    "title": "Del Test",
    "initial_value": 100,
    "current_value": 100,
    "target_value": 90,
    "unit": "kg",
    "end_date": end_date,
})
if r.status_code != 200:
    record("create weight goal", False, f"status={r.status_code} {r.text[:200]}")
    weight_goal = None
else:
    weight_goal = r.json()
    record("create weight goal", True,
           f"goal_id={weight_goal['goal_id']} initial={weight_goal.get('initial_value')}")
    created_goals.append(weight_goal["goal_id"])

if weight_goal:
    gid = weight_goal["goal_id"]
    entry_ids = []
    for v in [99, 98, 97]:
        time.sleep(0.05)
        r = req("POST", f"/goals/{gid}/entries", json={"value": v})
        if r.status_code != 200:
            record(f"add weight entry value={v}", False,
                   f"status={r.status_code} {r.text[:200]}")
            continue
        j = r.json()
        entry_ids.append(j.get("entry_id"))
        record(f"add weight entry value={v}", True,
               f"entry_id={j.get('entry_id')} current_value={j.get('goal', {}).get('current_value')}")

    if len(entry_ids) == 3:
        # current_value should now be 97 (last entry)
        # Delete middle entry (value=98, index 1)
        middle_id = entry_ids[1]
        r = req("DELETE", f"/goals/{gid}/entries/{middle_id}")
        if r.status_code != 200:
            record("delete middle weight entry (value=98)", False,
                   f"status={r.status_code} {r.text[:200]}")
        else:
            j = r.json()
            ok_flag = j.get("ok") is True and "goal" in j
            cur = j.get("goal", {}).get("current_value")
            record("delete middle weight entry (value=98) -> 200+{ok,goal}", ok_flag,
                   f"current_value after delete={cur} (expected 97)")
            record("weight current_value = 97 after delete-middle", cur == 97.0,
                   f"got={cur}")

        # Delete remaining entries -> when last one deleted, current_value should fallback to initial_value(100)
        # We have entries[0]=99 and entries[2]=97 left. Delete both.
        r = req("DELETE", f"/goals/{gid}/entries/{entry_ids[0]}")
        if r.status_code == 200:
            cur_after_first_remaining = r.json().get("goal", {}).get("current_value")
            record("delete weight entry value=99 -> current=97 (last remaining)",
                   cur_after_first_remaining == 97.0,
                   f"current_value={cur_after_first_remaining}")
        else:
            record("delete weight entry value=99", False, f"status={r.status_code}")

        r = req("DELETE", f"/goals/{gid}/entries/{entry_ids[2]}")
        if r.status_code == 200:
            cur_after_all = r.json().get("goal", {}).get("current_value")
            record("delete final weight entry -> current_value falls back to initial_value(100)",
                   cur_after_all == 100.0,
                   f"current_value={cur_after_all}")
        else:
            record("delete final weight entry", False, f"status={r.status_code}")

    # 404 tests
    r = req("DELETE", f"/goals/{gid}/entries/ge_does_not_exist")
    record("delete nonexistent entry -> 404", r.status_code == 404,
           f"status={r.status_code}")
    r = req("DELETE", "/goals/g_no_such_goal/entries/anything")
    record("delete entry of nonexistent goal -> 404", r.status_code == 404,
           f"status={r.status_code}")


# ============================================================================
# 4. HABIT goal recalc
# ============================================================================
print("\n=== 4. HABIT goal recalc ===")
r = req("POST", "/goals", json={
    "member_id": DEMO,
    "type": "habit",
    "title": "Del Habit Test",
    "initial_value": 0,
    "current_value": 0,
    "target_value": 30,
    "unit": "dias",
    "end_date": end_date,
})
if r.status_code != 200:
    record("create habit goal", False, f"status={r.status_code} {r.text[:200]}")
    habit_goal = None
else:
    habit_goal = r.json()
    created_goals.append(habit_goal["goal_id"])
    record("create habit goal", True, f"goal_id={habit_goal['goal_id']}")

if habit_goal:
    gid = habit_goal["goal_id"]
    h_entry_ids = []
    for _ in range(5):
        time.sleep(0.05)
        r = req("POST", f"/goals/{gid}/entries", json={"value": 1})
        if r.status_code == 200:
            h_entry_ids.append(r.json().get("entry_id"))
    # current_value should be 5
    r = req("GET", f"/goals/{DEMO}")
    cur = None
    if r.status_code == 200:
        for g in r.json():
            if g["goal_id"] == gid:
                cur = g.get("current_value")
                break
    record("habit current_value=5 after 5 check-ins", cur == 5.0, f"got={cur}")

    # Delete one check-in
    if h_entry_ids:
        r = req("DELETE", f"/goals/{gid}/entries/{h_entry_ids[0]}")
        if r.status_code == 200:
            cur_after = r.json().get("goal", {}).get("current_value")
            record("habit current_value=4 after deleting one check-in", cur_after == 4.0,
                   f"got={cur_after}")
        else:
            record("delete habit check-in", False, f"status={r.status_code}")


# ============================================================================
# 5. BEHAVIOR goal recalc
# ============================================================================
print("\n=== 5. BEHAVIOR goal recalc ===")
r = req("POST", "/goals", json={
    "member_id": DEMO,
    "type": "behavior",
    "title": "Del Behavior Test",
    "initial_value": 0,
    "current_value": 0,
    "target_value": 8,
    "unit": "score",
    "end_date": end_date,
})
if r.status_code != 200:
    record("create behavior goal", False, f"status={r.status_code} {r.text[:200]}")
    behavior_goal = None
else:
    behavior_goal = r.json()
    created_goals.append(behavior_goal["goal_id"])
    record("create behavior goal", True, f"goal_id={behavior_goal['goal_id']}")

if behavior_goal:
    gid = behavior_goal["goal_id"]
    b_entry_ids = []
    last_cur = None
    for v in [6, 8, 10]:
        time.sleep(0.05)
        r = req("POST", f"/goals/{gid}/entries", json={"value": v})
        if r.status_code == 200:
            j = r.json()
            b_entry_ids.append(j.get("entry_id"))
            last_cur = j.get("goal", {}).get("current_value")
    # avg of 6,8,10 = 8
    record("behavior current_value ~= 8 (avg of 6,8,10)",
           last_cur is not None and abs(last_cur - 8.0) < 0.01,
           f"got={last_cur}")

    # delete entry with value=10 (index 2)
    if len(b_entry_ids) == 3:
        r = req("DELETE", f"/goals/{gid}/entries/{b_entry_ids[2]}")
        if r.status_code == 200:
            cur_after = r.json().get("goal", {}).get("current_value")
            # avg of 6 and 8 = 7
            record("behavior current_value = 7 after deleting value=10 entry",
                   cur_after is not None and abs(cur_after - 7.0) < 0.01,
                   f"got={cur_after}")
        else:
            record("delete behavior entry value=10", False, f"status={r.status_code}")


# ============================================================================
# CLEANUP
# ============================================================================
print("\n=== CLEANUP ===")
for gid in list(created_goals):
    r = req("DELETE", f"/goals/{gid}")
    print(f"  archive goal {gid}: status={r.status_code}")
for pid in list(created_posts):
    r = req("DELETE", f"/feed/posts/{pid}", params={"member_id": DEMO})
    print(f"  delete leftover post {pid}: status={r.status_code}")
for sid in list(created_stories):
    r = req("DELETE", f"/stories/{sid}", params={"member_id": DEMO})
    print(f"  delete leftover story {sid}: status={r.status_code}")


# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 72)
passed = sum(1 for _, ok, _ in results if ok)
failed = sum(1 for _, ok, _ in results if not ok)
print(f"TOTAL: {passed} passed, {failed} failed (out of {len(results)})")
if failed:
    print("\nFAILURES:")
    for name, ok, detail in results:
        if not ok:
            print(f"  - {name}: {detail}")
sys.exit(0 if failed == 0 else 1)
