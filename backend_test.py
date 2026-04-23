"""
BLEX Token (BLX) backend tests — validação dos endpoints /api/blx/* e /api/wallet/topup.
Executa contra a URL pública EXPO_PUBLIC_BACKEND_URL.
"""
import os
import sys
import json
import time
import uuid
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://member-shop-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

PASS = []
FAIL = []


def log_pass(name, detail=""):
    PASS.append(name)
    print(f"PASS  {name}  {detail}")


def log_fail(name, detail=""):
    FAIL.append((name, detail))
    print(f"FAIL  {name}  {detail}")


def jprint(obj):
    try:
        return json.dumps(obj, indent=2, default=str, ensure_ascii=False)
    except Exception:
        return str(obj)


def http(method, path, **kw):
    url = f"{API}{path}"
    r = requests.request(method, url, timeout=30, **kw)
    return r


# ----------- Credentials ------------
ADMIN_EMAIL = "admin@farmaclube.com"
ADMIN_PASSWORD = "admin123"

MEMBER_LUIZ = "mem_7a9d652945e7"
MEMBER_DEMO = "mem_e5bb9b5878dd"


def login_admin():
    r = http("POST", "/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        log_fail("admin_login", f"{r.status_code} {r.text[:300]}")
        return None
    tok = r.json().get("token")
    log_pass("admin_login", f"token_len={len(tok) if tok else 0}")
    return tok


# ----------- Tests ------------
def test_wallet_existing():
    """1. GET /api/blx/wallet/{existing_member} returns all expected fields."""
    r = http("GET", f"/blx/wallet/{MEMBER_LUIZ}")
    if r.status_code != 200:
        log_fail("wallet_existing_status", f"{r.status_code} {r.text[:300]}")
        return None
    w = r.json()
    required = {"member_id", "wallet_number", "balance_centavos", "balance_blx",
                "escrow_in_centavos", "escrow_out_centavos", "currency"}
    missing = required - set(w.keys())
    if missing:
        log_fail("wallet_existing_fields", f"missing={missing} body={jprint(w)}")
        return None
    if w["currency"] != "BLX":
        log_fail("wallet_existing_currency", f"{w['currency']}")
        return None
    if not isinstance(w["balance_centavos"], int):
        log_fail("wallet_existing_balance_centavos_int", f"{type(w['balance_centavos'])}")
        return None
    if not (isinstance(w["wallet_number"], str) and w["wallet_number"].startswith("BLX-")):
        log_fail("wallet_existing_wallet_number_fmt", f"{w.get('wallet_number')}")
        return None
    log_pass("wallet_existing",
             f"wallet_number={w['wallet_number']} balance_centavos={w['balance_centavos']} balance_blx={w['balance_blx']}")
    return w


def test_wallet_demo():
    r = http("GET", f"/blx/wallet/{MEMBER_DEMO}")
    if r.status_code != 200:
        log_fail("wallet_demo", f"{r.status_code} {r.text[:200]}")
        return None
    w = r.json()
    log_pass("wallet_demo", f"wallet_number={w.get('wallet_number')} balance={w['balance_centavos']}")
    return w


def test_wallet_new_member_backfill():
    """Lazy creation test: fetch wallet for a brand new member_id (never used).
    Note: the endpoint doesn't validate membership — it will create a wallet row.
    We use an ephemeral id and verify wallet_number + balance_centavos=0 are backfilled."""
    fake_id = f"mem_test_{uuid.uuid4().hex[:10]}"
    r = http("GET", f"/blx/wallet/{fake_id}")
    if r.status_code != 200:
        log_fail("wallet_new_lazy", f"{r.status_code} {r.text[:200]}")
        return
    w = r.json()
    if not (w.get("wallet_number") or "").startswith("BLX-"):
        log_fail("wallet_new_lazy_wallet_number", jprint(w))
        return
    if w.get("balance_centavos") != 0:
        log_fail("wallet_new_lazy_balance_zero", jprint(w))
        return
    # 2ª chamada — deve devolver o MESMO wallet_number (persistência)
    r2 = http("GET", f"/blx/wallet/{fake_id}")
    w2 = r2.json()
    if w2.get("wallet_number") != w.get("wallet_number"):
        log_fail("wallet_new_lazy_stable", f"{w['wallet_number']} != {w2.get('wallet_number')}")
        return
    log_pass("wallet_new_lazy_backfill", f"wallet_number={w['wallet_number']}")


def test_lookup_by_wallet(wallet_number):
    r = http("GET", "/blx/lookup", params={"q": wallet_number})
    if r.status_code != 200:
        log_fail("lookup_by_wallet_status", f"{r.status_code} {r.text[:200]}")
        return
    data = r.json()
    if not isinstance(data, list) or len(data) != 1:
        log_fail("lookup_by_wallet_count", f"len={len(data) if isinstance(data, list) else 'NA'} body={jprint(data)}")
        return
    item = data[0]
    if item.get("wallet_number") != wallet_number:
        log_fail("lookup_by_wallet_match", jprint(item))
        return
    needed = {"member_id", "name", "nickname", "tier", "avatar_base64", "wallet_number"}
    missing = needed - set(item.keys())
    if missing:
        log_fail("lookup_by_wallet_fields", f"missing={missing}")
        return
    log_pass("lookup_by_wallet", f"{wallet_number} -> {item.get('member_id')} ({item.get('name')})")


def test_lookup_by_wallet_not_found():
    r = http("GET", "/blx/lookup", params={"q": "BLX-ZZZZZZZZ"})
    if r.status_code != 200:
        log_fail("lookup_nf_status", f"{r.status_code}")
        return
    data = r.json()
    if data != []:
        log_fail("lookup_nf_empty", jprint(data))
        return
    log_pass("lookup_by_wallet_notfound")


def test_lookup_short_query():
    r = http("GET", "/blx/lookup", params={"q": "ab"})
    if r.status_code != 200:
        log_fail("lookup_short_status", f"{r.status_code} {r.text[:200]}")
        return
    if r.json() != []:
        log_fail("lookup_short_empty", jprint(r.json()))
        return
    log_pass("lookup_short_q_returns_empty")


def test_lookup_by_name():
    # Busca por "Guilherme" deve retornar alguma coisa
    r = http("GET", "/blx/lookup", params={"q": "Guilherme"})
    if r.status_code != 200:
        log_fail("lookup_name_status", f"{r.status_code}")
        return
    data = r.json()
    if not isinstance(data, list) or len(data) == 0:
        log_fail("lookup_by_name_results", f"expected >=1, got {len(data) if isinstance(data, list) else 'NA'}")
        return
    # Verifica formato dos itens
    for it in data:
        if "member_id" not in it or "wallet_number" not in it:
            log_fail("lookup_by_name_format", jprint(it))
            return
    if len(data) > 8:
        log_fail("lookup_by_name_limit", f"expected<=8, got {len(data)}")
        return
    log_pass("lookup_by_name", f"hits={len(data)} first={data[0].get('name')}")


def test_transfer_valid_and_check_balances():
    # Estado inicial
    wf = http("GET", f"/blx/wallet/{MEMBER_LUIZ}").json()
    wt = http("GET", f"/blx/wallet/{MEMBER_DEMO}").json()
    bf0 = int(wf["balance_centavos"])
    bt0 = int(wt["balance_centavos"])

    amount = 1234  # 12,34 BLX — valor pequeno e com centavos
    if bf0 < amount:
        log_fail("transfer_valid_setup",
                 f"remetente sem saldo p/ testar: {bf0} centavos. pulando transfer.")
        return None

    body = {
        "from_member_id": MEMBER_LUIZ,
        "to_wallet": wt.get("wallet_number"),
        "amount_centavos": amount,
        "note": "Teste automatizado BLX",
    }
    r = http("POST", "/blx/transfer", json=body)
    if r.status_code != 200:
        log_fail("transfer_valid", f"{r.status_code} {r.text[:300]}")
        return None
    tx = r.json()
    # Validações da tx
    problems = []
    if tx.get("type") != "transfer":
        problems.append(f"type={tx.get('type')}")
    if tx.get("status") != "settled":
        problems.append(f"status={tx.get('status')}")
    if tx.get("currency") != "BLX":
        problems.append(f"currency={tx.get('currency')}")
    if tx.get("amount_centavos") != amount:
        problems.append(f"amount_centavos={tx.get('amount_centavos')} != {amount}")
    if tx.get("from_id") != MEMBER_LUIZ or tx.get("to_id") != MEMBER_DEMO:
        problems.append(f"from/to ids wrong: {tx.get('from_id')} -> {tx.get('to_id')}")
    if not tx.get("tx_id"):
        problems.append("tx_id missing")
    if problems:
        log_fail("transfer_valid_shape", f"{problems} body={jprint(tx)}")
        return None

    # Saldos atualizados?
    wf1 = http("GET", f"/blx/wallet/{MEMBER_LUIZ}").json()
    wt1 = http("GET", f"/blx/wallet/{MEMBER_DEMO}").json()
    bf1 = int(wf1["balance_centavos"])
    bt1 = int(wt1["balance_centavos"])
    if bf1 != bf0 - amount:
        log_fail("transfer_valid_debit", f"bf0={bf0} bf1={bf1} expected={bf0-amount}")
        return None
    if bt1 != bt0 + amount:
        log_fail("transfer_valid_credit", f"bt0={bt0} bt1={bt1} expected={bt0+amount}")
        return None
    log_pass("transfer_valid", f"tx_id={tx.get('tx_id')} debit={bf1-bf0} credit={bt1-bt0}")
    return tx


def test_transfer_insufficient_balance():
    body = {
        "from_member_id": MEMBER_LUIZ,
        "to_member_id": MEMBER_DEMO,
        "amount_centavos": 999_999_999,  # 9.999.999,99 BLX — muito maior que o saldo
    }
    r = http("POST", "/blx/transfer", json=body)
    if r.status_code != 400:
        log_fail("transfer_insufficient", f"expected 400, got {r.status_code}: {r.text[:300]}")
        return
    if "saldo" not in r.text.lower() and "insufici" not in r.text.lower():
        log_fail("transfer_insufficient_msg", f"message={r.text[:200]}")
        return
    log_pass("transfer_insufficient_balance")


def test_transfer_self():
    # Buscar wallet number do Luiz
    w = http("GET", f"/blx/wallet/{MEMBER_LUIZ}").json()
    body = {
        "from_member_id": MEMBER_LUIZ,
        "to_wallet": w.get("wallet_number"),
        "amount_centavos": 100,
    }
    r = http("POST", "/blx/transfer", json=body)
    if r.status_code != 400:
        log_fail("transfer_self", f"expected 400, got {r.status_code}: {r.text[:300]}")
        return
    log_pass("transfer_self_blocked")


def test_transfer_wallet_not_found():
    body = {
        "from_member_id": MEMBER_LUIZ,
        "to_wallet": "BLX-NOEXIST1",
        "amount_centavos": 100,
    }
    r = http("POST", "/blx/transfer", json=body)
    if r.status_code != 404:
        log_fail("transfer_wallet_404", f"expected 404, got {r.status_code}: {r.text[:300]}")
        return
    log_pass("transfer_wallet_not_found_404")


def test_transactions_extrato():
    r = http("GET", f"/blx/transactions/{MEMBER_LUIZ}", params={"limit": 20, "skip": 0})
    if r.status_code != 200:
        log_fail("extrato_status", f"{r.status_code} {r.text[:200]}")
        return
    txs = r.json()
    if not isinstance(txs, list):
        log_fail("extrato_list", jprint(txs))
        return
    if len(txs) == 0:
        log_fail("extrato_empty", "esperava ao menos 1 tx após os testes acima")
        return
    # Ordenação desc por data
    times = []
    for t in txs:
        ca = t.get("created_at")
        times.append(ca)
    # str ISO ordenação lexicográfica funciona p/ ISO UTC
    times_sorted = sorted(times, reverse=True)
    if times != times_sorted:
        log_fail("extrato_order_desc", f"not sorted desc. First={times[:3]}")
        return
    # amount_centavos presente e int
    for t in txs:
        if not isinstance(t.get("amount_centavos"), int):
            log_fail("extrato_amount_centavos", f"{t.get('amount_centavos')} in tx {t.get('tx_id')}")
            return
    # Pelo menos a última transfer criada deve ter to_name/from_name preenchido se for transfer
    for t in txs:
        if t.get("type") == "transfer":
            if not (t.get("from_name") or t.get("to_name")):
                log_fail("extrato_names_enriched", f"transfer sem from/to_name: {jprint(t)}")
                return
            break
    log_pass("extrato_pagination", f"count={len(txs)}")


def test_extrato_pagination_skip():
    r0 = http("GET", f"/blx/transactions/{MEMBER_LUIZ}", params={"limit": 1, "skip": 0}).json()
    r1 = http("GET", f"/blx/transactions/{MEMBER_LUIZ}", params={"limit": 1, "skip": 1}).json()
    if not r0 or not r1:
        log_pass("extrato_pagination_skip", "not enough txs to validate skip — skipped")
        return
    if r0[0].get("tx_id") == r1[0].get("tx_id"):
        log_fail("extrato_pagination_skip", "same tx at skip=0 and skip=1")
        return
    log_pass("extrato_pagination_skip")


def test_topup_requires_auth():
    body = {"member_id": MEMBER_DEMO, "amount_centavos": 10000}
    r = http("POST", "/wallet/topup", json=body)
    if r.status_code not in (401, 403):
        log_fail("topup_no_auth", f"expected 401/403, got {r.status_code}: {r.text[:300]}")
        return
    log_pass("topup_no_auth_blocked", f"status={r.status_code}")


def test_topup_invalid_token():
    body = {"member_id": MEMBER_DEMO, "amount_centavos": 10000}
    r = http("POST", "/wallet/topup", json=body, headers={"Authorization": "Bearer invalid.token.here"})
    if r.status_code not in (401, 403):
        log_fail("topup_invalid_token", f"expected 401/403, got {r.status_code}")
        return
    log_pass("topup_invalid_token_blocked", f"status={r.status_code}")


def test_topup_with_amount_centavos(token):
    # Estado inicial
    w0 = http("GET", f"/blx/wallet/{MEMBER_DEMO}").json()
    b0 = int(w0["balance_centavos"])

    body = {"member_id": MEMBER_DEMO, "amount_centavos": 10000}  # 100,00 BLX
    headers = {"Authorization": f"Bearer {token}"}
    r = http("POST", "/wallet/topup", json=body, headers=headers)
    if r.status_code != 200:
        log_fail("topup_amount_centavos", f"{r.status_code} {r.text[:300]}")
        return
    tx = r.json()
    if tx.get("amount_centavos") != 10000:
        log_fail("topup_amount_centavos_body", jprint(tx))
        return
    if tx.get("currency") != "BLX":
        log_fail("topup_currency", jprint(tx))
        return
    if tx.get("type") != "topup":
        log_fail("topup_type", jprint(tx))
        return
    if tx.get("status") != "settled":
        log_fail("topup_status", jprint(tx))
        return

    # Confirma saldo atualizado em centavos e float
    w1 = http("GET", f"/blx/wallet/{MEMBER_DEMO}").json()
    b1 = int(w1["balance_centavos"])
    if b1 != b0 + 10000:
        log_fail("topup_balance_centavos_inc", f"before={b0} after={b1} expected={b0+10000}")
        return
    # balance_blx também atualizado
    if round(w1["balance_blx"], 2) != round((b0 + 10000) / 100.0, 2):
        log_fail("topup_balance_blx_consistent", f"balance_blx={w1['balance_blx']} centavos={b1}")
        return
    log_pass("topup_amount_centavos", f"+10000 centavos -> saldo {b1}")


def test_topup_legacy_amount(token):
    """Testa a compat com 'amount' (float em BLX inteiros)."""
    headers = {"Authorization": f"Bearer {token}"}
    w0 = http("GET", f"/blx/wallet/{MEMBER_DEMO}").json()
    b0 = int(w0["balance_centavos"])
    body = {"member_id": MEMBER_DEMO, "amount": 5}  # 5,00 BLX -> 500 centavos
    r = http("POST", "/wallet/topup", json=body, headers=headers)
    if r.status_code != 200:
        log_fail("topup_legacy_amount", f"{r.status_code} {r.text[:300]}")
        return
    w1 = http("GET", f"/blx/wallet/{MEMBER_DEMO}").json()
    b1 = int(w1["balance_centavos"])
    if b1 != b0 + 500:
        log_fail("topup_legacy_amount_delta", f"before={b0} after={b1} expected={b0+500}")
        return
    log_pass("topup_legacy_amount", f"+500 centavos via amount=5")


def test_topup_invalid_value(token):
    headers = {"Authorization": f"Bearer {token}"}
    # Sem amount nem amount_centavos
    r = http("POST", "/wallet/topup", json={"member_id": MEMBER_DEMO}, headers=headers)
    if r.status_code != 400:
        log_fail("topup_no_amount", f"expected 400 got {r.status_code}")
        return
    # Valor zero
    r = http("POST", "/wallet/topup", json={"member_id": MEMBER_DEMO, "amount_centavos": 0}, headers=headers)
    if r.status_code != 400:
        log_fail("topup_zero", f"expected 400 got {r.status_code}")
        return
    # Valor negativo
    r = http("POST", "/wallet/topup", json={"member_id": MEMBER_DEMO, "amount_centavos": -100}, headers=headers)
    if r.status_code != 400:
        log_fail("topup_negative", f"expected 400 got {r.status_code}")
        return
    log_pass("topup_invalid_values")


def main():
    print(f"BASE={BASE}")
    print("=" * 70)

    # Wallet
    wluiz = test_wallet_existing()
    test_wallet_demo()
    test_wallet_new_member_backfill()

    # Lookup
    if wluiz:
        test_lookup_by_wallet(wluiz["wallet_number"])
    test_lookup_by_wallet_not_found()
    test_lookup_short_query()
    test_lookup_by_name()

    # Transfer
    test_transfer_self()
    test_transfer_wallet_not_found()
    test_transfer_insufficient_balance()
    test_transfer_valid_and_check_balances()

    # Extrato
    test_transactions_extrato()
    test_extrato_pagination_skip()

    # Topup
    test_topup_requires_auth()
    test_topup_invalid_token()
    token = login_admin()
    if token:
        test_topup_with_amount_centavos(token)
        test_topup_legacy_amount(token)
        test_topup_invalid_value(token)

    print("=" * 70)
    print(f"TOTAL PASS: {len(PASS)}")
    print(f"TOTAL FAIL: {len(FAIL)}")
    if FAIL:
        print("\nFAILED:")
        for n, d in FAIL:
            print(f"  - {n}: {d}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
