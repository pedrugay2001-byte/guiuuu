#!/usr/bin/env bash
# ============================================================================
# Build & Deploy Frontend (clean) — BLACKSCLUB
# ============================================================================
# Por que este script existe?
#   Cada `npm run build` gera um novo bundle entry-*.js com hash novo.
#   Se você só faz `cp dist/* static_frontend/`, os bundles antigos ficam
#   acumulados e a imagem do K8s incha (107MB+ → falha de deploy).
#
# O que faz:
#   1) Limpa /app/backend/static_frontend/ (sem deletar a pasta)
#   2) Roda `npm run build` no frontend
#   3) Copia dist/* para static_frontend/
#   4) Restart do expo via supervisor
#
# Uso: bash /app/scripts/build-and-deploy-frontend.sh
# ============================================================================
set -e

FE=/app/frontend
DIST=$FE/dist
STATIC=/app/backend/static_frontend

echo "==> Cleaning static_frontend..."
find "$STATIC" -mindepth 1 -delete

echo "==> Building Expo web..."
cd "$FE"
npm run build

# ============================================================================
# NOTA: O passo de "inline_fonts.py" foi REMOVIDO em favor da migração para
# lucide-react-native. Agora todos os ícones são SVG components (não TTF),
# então não há mais dependência de paths de assets nem necessidade de embarcar
# fontes como base64 no HTML.
# ============================================================================

echo "==> Copying dist to static_frontend..."
cp -r "$DIST"/* "$STATIC"/

SIZE=$(du -sh "$STATIC" | cut -f1)
echo "==> Deploy size: $SIZE"

echo "==> Restarting expo..."
sudo supervisorctl restart expo

echo "==> Done. Static at $STATIC"
