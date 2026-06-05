"""
Importa os anúncios do arquivo /app/scripts/ads_export.json para o MongoDB de
PRODUÇÃO. Use a variável de ambiente PROD_MONGO_URL com a connection string
do Mongo de produção (obtida no painel de Deploy do Emergent).

Uso:
    PROD_MONGO_URL="mongodb+srv://USER:PASS@HOST/DB" python3 /app/scripts/import_ads_to_production.py

Comportamento:
    - Lê todos os anúncios do JSON (74 itens, ~4.6MB)
    - Para cada anúncio, faz UPSERT (não duplica se ad_id já existir na prod)
    - Restaura datas ISO → datetime real do BSON
    - Imprime resumo ao final (criados / atualizados)

Segurança:
    - Não persiste o PROD_MONGO_URL em arquivo nem em logs (só env var)
    - Use `unset PROD_MONGO_URL` depois da importação para limpar a variável
"""
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient


def parse_dates(obj):
    """Converte campos ISO date string de volta para datetime."""
    for f in ("created_at", "updated_at"):
        v = obj.get(f)
        if isinstance(v, str):
            try:
                # Aceita 'Z' como UTC suffix
                obj[f] = datetime.fromisoformat(v.replace("Z", "+00:00"))
            except Exception:
                pass
    return obj


async def main():
    prod_url = os.environ.get("PROD_MONGO_URL")
    if not prod_url:
        print("❌ ERRO: PROD_MONGO_URL não definido.")
        print("   Use:  PROD_MONGO_URL='mongodb+srv://...' python3 import_ads_to_production.py")
        sys.exit(1)

    # DB name: tenta extrair da URL, senão usa default
    prod_db_name = os.environ.get("PROD_DB_NAME", "test_database")

    json_path = Path("/app/scripts/ads_export.json")
    if not json_path.exists():
        print(f"❌ ERRO: arquivo {json_path} não encontrado.")
        print("   Rode antes:  python3 /app/scripts/export_preview_ads.py")
        sys.exit(1)

    with json_path.open("r", encoding="utf-8") as f:
        ads = json.load(f)
    print(f"📦 Carregados {len(ads)} anúncios do JSON.")

    client = AsyncIOMotorClient(prod_url, serverSelectionTimeoutMS=10_000)
    db = client[prod_db_name]

    # Testa conexão
    try:
        await client.server_info()
        print(f"🔌 Conectado ao MongoDB de produção (DB: {prod_db_name})")
    except Exception as e:
        print(f"❌ Falha na conexão: {e}")
        sys.exit(1)

    created, updated = 0, 0
    for raw_ad in ads:
        ad = parse_dates(dict(raw_ad))
        ad_id = ad.get("ad_id")
        if not ad_id:
            continue
        # UPSERT por ad_id — não duplica
        result = await db.ads.update_one(
            {"ad_id": ad_id},
            {"$set": ad},
            upsert=True,
        )
        if result.upserted_id:
            created += 1
        else:
            updated += 1

    total = await db.ads.count_documents({})
    print(f"\n✅ Importação concluída")
    print(f"   Criados:    {created}")
    print(f"   Atualizados: {updated}")
    print(f"   Total no DB prod agora: {total}")

    # Resumo por nicho
    pipeline = [{"$group": {"_id": "$niche", "count": {"$sum": 1}}}]
    by_niche = await db.ads.aggregate(pipeline).to_list(length=20)
    print(f"   Por nicho:  { {b['_id']: b['count'] for b in by_niche} }")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
