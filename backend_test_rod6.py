"""
BLACKSCLUB — Rodada 6 backend tests.
Foco: novos endpoints (stories leve, stories/{id}/image) e novos campos de snapshot
de metas (delta_from_start, is_regressing).
"""
import os
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
import requests

BASE = "https://member-shop-2.preview.emergentagent.com/api"
MEMBER_ID = "mem_e5bb9b5878dd"

results: List[Dict[str, Any]] = []


def record(name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    results.append({"name": name, "status": status, "detail": detail})
    print(f"[{status}] {name}{' — ' + detail if detail else ''}")


def req(method: str, path: str, **kw) -> requests.Response:
    url = BASE + path
    r = requests.request(method, url, timeout=30, **kw)
    return r


# ----------------------------------------------------------------------------
# 1. Stories endpoint LEVE
# ----------------------------------------------------------------------------
def test_stories_light():
    print("\n=== 1. GET /stories (LEVE, sem image_base64) ===")
    r = req("GET", "/stories")
    record("GET /stories responde 200", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code != 200:
        return None
    # tamanho
    size_bytes = len(r.content)
    size_kb = size_bytes / 1024.0
    record(f"Tamanho da resposta <500KB", size_kb < 500, f"{size_kb:.1f}KB")

    data = r.json()
    record("Resposta é lista", isinstance(data, list), f"tipo={type(data).__name__}")
    if not isinstance(data, list):
        return None
    # Verifica que NENHUM story tem image_base64
    any_with_image = False
    total_stories = 0
    first_story_id = None
    for group in data:
        for s in group.get("stories", []):
            total_stories += 1
            if s.get("image_base64"):
                any_with_image = True
            if first_story_id is None:
                first_story_id = s.get("story_id")
    record(
        f"Nenhum story carrega image_base64 no payload ({total_stories} stories)",
        not any_with_image,
        "image_base64 encontrado em algum story" if any_with_image else ""
    )
    return first_story_id


# ----------------------------------------------------------------------------
# 2. Stories image endpoint
# ----------------------------------------------------------------------------
def test_story_image_endpoint(story_id):
    print("\n=== 2. GET /stories/{id}/image ===")
    if not story_id:
        # Crie um story para poder testar o endpoint
        payload = {
            "member_id": MEMBER_ID,
            "text": "Teste Rodada 6 - foto",
            "image_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
        }
        r = req("POST", "/stories", json=payload)
        if r.status_code == 200:
            story_id = r.json().get("story_id")
            print(f"(criado story_id de teste: {story_id})")
        else:
            record("Criação de story para teste", False, f"HTTP {r.status_code}: {r.text[:120]}")
            return

    r = req("GET", f"/stories/{story_id}/image")
    record("GET /stories/{id}/image com id válido retorna 200", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        keys = set(data.keys())
        has_expected = {"story_id", "image_base64", "text"}.issubset(keys)
        record("Resposta contém story_id, image_base64, text",
               has_expected, f"keys={sorted(keys)}")

    r = req("GET", "/stories/st_invalid_id_xxx/image")
    record("GET /stories/{id}/image com id inválido retorna 404", r.status_code == 404, f"HTTP {r.status_code}")


# ----------------------------------------------------------------------------
# Helpers para goals
# ----------------------------------------------------------------------------
def _future_date(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()


def _find_goal(goals: List[Dict[str, Any]], goal_id: str) -> Dict[str, Any]:
    for g in goals:
        if g.get("goal_id") == goal_id:
            return g
    return {}


# ----------------------------------------------------------------------------
# 3. Goal weight (decrease) — delta_from_start / is_regressing
# ----------------------------------------------------------------------------
def test_goal_weight_decrease():
    print("\n=== 3. Goal weight (decrease): delta_from_start / is_regressing ===")

    payload = {
        "member_id": MEMBER_ID,
        "type": "weight",
        "title": "ROD6 Weight Decrease Test",
        "initial_value": 100,
        "current_value": 100,
        "target_value": 90,
        "unit": "kg",
        "end_date": _future_date(60),
    }
    r = req("POST", "/goals", json=payload)
    record("Criar meta weight (decrease)", r.status_code == 200, f"HTTP {r.status_code}: {r.text[:180]}")
    if r.status_code != 200:
        return None
    goal_id = r.json().get("goal_id")

    # snapshot inicial via GET /goals/{member_id}
    r = req("GET", f"/goals/{MEMBER_ID}")
    record("GET /goals/{member_id} responde 200", r.status_code == 200)
    goal = _find_goal(r.json() if r.status_code == 200 else [], goal_id)

    has_delta = "delta_from_start" in goal
    has_reg = "is_regressing" in goal
    record("Campo delta_from_start presente no início", has_delta,
           f"valor={goal.get('delta_from_start')}")
    record("Campo is_regressing presente no início", has_reg,
           f"valor={goal.get('is_regressing')}")
    record("delta_from_start == 0 no início",
           abs(float(goal.get("delta_from_start", -1))) < 0.01,
           f"valor={goal.get('delta_from_start')}")
    record("is_regressing == false no início",
           goal.get("is_regressing") is False,
           f"valor={goal.get('is_regressing')}")

    # Entry value=102 → regressão (peso subiu)
    r = req("POST", f"/goals/{goal_id}/entries", json={"value": 102, "note": "regressão teste"})
    record("Adicionar entry value=102 (regrediu)", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code == 200:
        g = r.json().get("goal", {})
        # Para weight (decrease): delta_done = initial - current = 100 - 102 = -2
        delta = g.get("delta_from_start")
        is_reg = g.get("is_regressing")
        record("Após regressão: delta_from_start ≈ -2",
               abs(float(delta or 0) - (-2)) < 0.05, f"valor={delta}")
        record("Após regressão: is_regressing == true",
               is_reg is True, f"valor={is_reg}")

    # Entry value=97 → progrediu
    r = req("POST", f"/goals/{goal_id}/entries", json={"value": 97, "note": "progresso teste"})
    record("Adicionar entry value=97 (progrediu)", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code == 200:
        g = r.json().get("goal", {})
        # delta_done = 100 - 97 = 3 (positivo)
        delta = g.get("delta_from_start")
        is_reg = g.get("is_regressing")
        record("Após progresso: delta_from_start > 0 (positivo)",
               float(delta or -1) > 0, f"valor={delta}")
        record("Após progresso: is_regressing == false",
               is_reg is False, f"valor={is_reg}")

    return goal_id


# ----------------------------------------------------------------------------
# 4. Goal financial (increase) — regressão
# ----------------------------------------------------------------------------
def test_goal_financial_increase():
    print("\n=== 4. Goal financial (increase): regressão ===")

    payload = {
        "member_id": MEMBER_ID,
        "type": "financial",
        "title": "ROD6 Financial Increase Test",
        "initial_value": 10000,
        "current_value": 10000,
        "target_value": 50000,
        "unit": "BRL",
        "end_date": _future_date(90),
    }
    r = req("POST", "/goals", json=payload)
    record("Criar meta financial (increase)", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code != 200:
        return None
    goal_id = r.json().get("goal_id")

    # Entry 8000 → perdeu dinheiro (regressão)
    r = req("POST", f"/goals/{goal_id}/entries", json={"value": 8000})
    record("Adicionar entry value=8000 (perdeu)", r.status_code == 200)
    if r.status_code == 200:
        g = r.json().get("goal", {})
        # direction=increase: delta_done = current - initial = 8000 - 10000 = -2000
        delta = g.get("delta_from_start")
        is_reg = g.get("is_regressing")
        record("Financeiro regressão: delta_from_start == -2000",
               abs(float(delta or 0) - (-2000)) < 1, f"valor={delta}")
        record("Financeiro regressão: is_regressing == true",
               is_reg is True, f"valor={is_reg}")

    # Entry 15000 → progrediu
    r = req("POST", f"/goals/{goal_id}/entries", json={"value": 15000})
    record("Adicionar entry value=15000 (progrediu)", r.status_code == 200)
    if r.status_code == 200:
        g = r.json().get("goal", {})
        # delta_done = 15000 - 10000 = 5000
        delta = g.get("delta_from_start")
        is_reg = g.get("is_regressing")
        record("Financeiro progresso: delta_from_start == 5000",
               abs(float(delta or 0) - 5000) < 1, f"valor={delta}")
        record("Financeiro progresso: is_regressing == false",
               is_reg is False, f"valor={is_reg}")

    return goal_id


# ----------------------------------------------------------------------------
# 5. Habit / behavior: não devem ter delta_from_start / is_regressing
# ----------------------------------------------------------------------------
def test_habit_no_regression_fields():
    print("\n=== 5. Habit/behavior sem delta_from_start / is_regressing ===")
    payload = {
        "member_id": MEMBER_ID,
        "type": "habit",
        "title": "ROD6 Habit Test",
        "initial_value": 0,
        "current_value": 0,
        "target_value": 30,
        "unit": "dias",
        "end_date": _future_date(30),
    }
    r = req("POST", "/goals", json=payload)
    record("Criar meta habit", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code != 200:
        return None
    goal_id = r.json().get("goal_id")
    snap = r.json()
    record("Meta habit: delta_from_start NÃO presente",
           "delta_from_start" not in snap,
           f"encontrado: {snap.get('delta_from_start')}")
    record("Meta habit: is_regressing NÃO presente",
           "is_regressing" not in snap,
           f"encontrado: {snap.get('is_regressing')}")

    # Também verifica via GET /goals/{member_id}
    r = req("GET", f"/goals/{MEMBER_ID}")
    if r.status_code == 200:
        g = _find_goal(r.json(), goal_id)
        record("Habit via GET /goals: delta_from_start NÃO presente",
               "delta_from_start" not in g)
        record("Habit via GET /goals: is_regressing NÃO presente",
               "is_regressing" not in g)

    # Behavior também
    payload_b = {
        "member_id": MEMBER_ID,
        "type": "behavior",
        "title": "ROD6 Behavior Test",
        "initial_value": 0,
        "current_value": 0,
        "target_value": 8,
        "unit": "score",
        "end_date": _future_date(30),
    }
    r = req("POST", "/goals", json=payload_b)
    record("Criar meta behavior", r.status_code == 200)
    behavior_goal_id = r.json().get("goal_id") if r.status_code == 200 else None
    if r.status_code == 200:
        snap = r.json()
        record("Meta behavior: delta_from_start NÃO presente",
               "delta_from_start" not in snap,
               f"encontrado: {snap.get('delta_from_start')}")
        record("Meta behavior: is_regressing NÃO presente",
               "is_regressing" not in snap,
               f"encontrado: {snap.get('is_regressing')}")

    return [goal_id, behavior_goal_id]


# ----------------------------------------------------------------------------
# 6. Cleanup
# ----------------------------------------------------------------------------
def cleanup(goal_ids: List[str]):
    print("\n=== 6. Cleanup ===")
    cleaned = 0
    for gid in goal_ids:
        if not gid:
            continue
        r = req("DELETE", f"/goals/{gid}")
        if r.status_code == 200:
            cleaned += 1
    record(f"Limpeza de {len([g for g in goal_ids if g])} metas criadas",
           cleaned == len([g for g in goal_ids if g]),
           f"removidas={cleaned}")


# ----------------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------------
def main():
    print(f"BLACKSCLUB Rodada 6 — testing @ {BASE}")

    story_id = test_stories_light()
    test_story_image_endpoint(story_id)

    gid_weight = test_goal_weight_decrease()
    gid_fin = test_goal_financial_increase()
    habit_ids = test_habit_no_regression_fields() or []

    cleanup([gid_weight, gid_fin] + list(habit_ids))

    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    print("\n" + "=" * 60)
    print(f"TOTAL: {passed} PASS / {failed} FAIL (em {len(results)} assertions)")
    print("=" * 60)
    if failed:
        print("\nFALHAS:")
        for r in results:
            if r["status"] == "FAIL":
                print(f"  - {r['name']}: {r['detail']}")


if __name__ == "__main__":
    main()
