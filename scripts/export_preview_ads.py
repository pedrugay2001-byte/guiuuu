"""
Exporta TODOS os anúncios (db.ads) do MongoDB do PREVIEW para um arquivo JSON.
O arquivo gerado pode ser importado na produção via mongoimport ou
via o script `import_ads_to_production.py` (que aceita PROD_MONGO_URL).

Uso:
    python3 /app/scripts/export_preview_ads.py
    → gera /app/scripts/ads_export.json
"""
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

from motor.motor_asyncio import AsyncIOMotorClient


def json_serializer(obj):
    """Converte tipos do BSON para JSON (datetime → isoformat)."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "binary"):  # ObjectId/Binary
        return str(obj)
    raise TypeError(f"Type {type(obj)} not JSON-serializable")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "test_database")]

    # Pega TODOS os anúncios — sem filtro (incluindo inativos para preservar tudo)
    ads = await db.ads.find({}, {"_id": 0}).to_list(length=10_000)
    print(f"Encontrados {len(ads)} anúncios no preview.")

    # Salva como JSON pretty-printed
    out_path = Path("/app/scripts/ads_export.json")
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(ads, f, ensure_ascii=False, indent=2, default=json_serializer)

    print(f"✅ Exportado para {out_path}")
    print(f"   Tamanho: {out_path.stat().st_size / 1024:.1f} KB")
    print(f"   Anúncios: {len(ads)}")

    # Resumo por nicho
    by_niche: dict = {}
    for a in ads:
        n = a.get("niche") or "<sem-niche>"
        by_niche[n] = by_niche.get(n, 0) + 1
    print(f"   Por nicho: {by_niche}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
