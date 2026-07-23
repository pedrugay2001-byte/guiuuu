# FarmaClube — PRD

## Vision
Exclusive members-only mobile club for buying weight-loss products, peptides, Landerlan line / hormones, pre-workouts and supplements. Premium black visual identity with silver/white accents. Access is gated by an invite-code chain controlled by the owner (Guilherme).

## Gate Flow (primary entry)
1. **Welcome slides (3)** — "Acesso que poucos têm", "Entregas sem chamar atenção", "Landerlan, peptídeos e linha Paraguai"
2. **Termo de Compromisso** — 4 cláusulas + aviso de EXCLUSÃO PERMANENTE em caso de descumprimento. Checkbox obrigatório.
3. **Formulário de entrada**: Nome completo, Telefone/WhatsApp, Endereço completo, Código de acesso
4. **Validação**:
   - `X2T` (código raiz / Guilherme) sempre válido
   - Qualquer outro código deve existir como `invite_code` de um membro existente
5. **Código pessoal**: novo membro recebe `<código_usado> + LETRA + DIGITO`. Ex: `X2T` → `X2TG5`; `X2TG5` → `X2TG5H2`; crescimento infinito em cadeia.
6. **Tela de sucesso**: mostra código pessoal + botões "Indicar via WhatsApp" / "Compartilhar código" / "Entrar no app"
7. Gate fica salvo em AsyncStorage — não pede novamente. Pode ser resetado em Membro → "Sair do clube".

## Email Notification (MOCKED por enquanto)
- A cada novo membro, envia email HTML (dark theme) para `guilherme925145000@gmail.com` com: nome, telefone, endereço, código usado, padrinho, código gerado, **total de membros do clube**
- **Status atual**: MOCKADO — loga no console backend com `[EMAIL MOCKED]`
- **Ativação real**: definir `RESEND_API_KEY=re_...` em `/app/backend/.env` e reiniciar backend. Cadastre `guilherme925145000@gmail.com` em resend.com para ser o sender verificado.

## Catálogo (já implementado)
- 20 produtos seedados (6 categorias: Emagrecedores, Peptídeos, Landerlan, Hormônios, Pré-treinos, Suplementos)
- Emagrecedores agora inclui linha Paraguai: Lipoless Tirzec 15mg/30mg, Tirzepatida genérica, Retatrutida 5/10/20mg, Cagrilintida, Semaglutida multidose
- Busca, filtro por categoria, destaque na Home, carrinho persistente, checkout via WhatsApp (`wa.me`)
- **Admin embutido**: toda pessoa que passa pelo gate ganha acesso silencioso de admin (CRUD de produtos). Útil pra Guilherme gerenciar preços sem ter que logar.

## Backend Endpoints
- Gate: `POST /api/members/enter`, `GET /api/members/stats`
- Auth (interno, admin seed): `POST /api/auth/login`, `GET /api/auth/me`
- Products: `GET/POST/PUT/DELETE /api/products`, `GET /api/products/featured`, `GET /api/categories`

## Collections MongoDB
- `users` — só admin (seed automático para CRUD)
- `members` — dados dos membros do gate (index único em `invite_code`)
- `products` — catálogo

## Próximas iterações
- Ativar Resend com API key (5 min quando Guilherme passar)
- Histórico de pedidos por membro
- Revogar código de um membro específico (exclusão permanente no admin)
- Dashboard de árvore de indicações (ver quem indicou quem)
- Upload de imagens (em vez de URL)
- Pagamento real (Stripe / PIX)

## Smart enhancement
**Dashboard de rede**: visualizar a árvore genealógica de indicações (quem trouxe quem, quantos membros em cada galho). Permite ver rapidamente quais padrinhos estão trazendo mais membros — ótimo pra recompensar com descontos progressivos no futuro.

## Sincronização Emergent ↔ GitHub ↔ Domínio (corrigido em 21/07)
**Causa raiz da divergência de senha Master:** em 07/06 o `.gitignore` passou a bloquear os `.env` (removidos do Git em 31/05). O deploy externo ficou sem `ADMIN_EMAIL`/`ADMIN_PASSWORD`, o `seed_admin()` falhava silenciosamente (KeyError) e o banco de produção mantinha a senha antiga. Além disso, o build web (`backend/static_frontend/`) estava congelado em 07/06 — sem USx, AmountText, cores novas.
**Correções aplicadas:**
1. `.gitignore` corrigido — `.env` voltam a ser versionados (NUNCA re-adicionar regras `*.env`).
2. `seed_admin()` blindado com fallbacks (`guilherme925145000@gmail.com` / `Shakira12@`) — qualquer ambiente converge para a mesma senha a cada startup, mesmo sem `.env`.
3. `static_frontend` re-compilado com todas as mudanças recentes (USx, centavos menores, cores).
**Fluxo de publicação:** após qualquer mudança de frontend, rodar `bash /app/scripts/build-and-deploy-frontend.sh` e depois "Save to GitHub" — o Netlify republica automaticamente.

## Code Review pós-deploy (22/07) — defeitos corrigidos e testados (11/11 PASS, iteration_17)
1. **HIGH** `/api/wallet/withdraw`: debitava só o campo legado `balance` (float) — agora debita `balance_centavos` (fonte de verdade) com `find_one_and_update` condicional atômico.
2. **MEDIUM** Duplo gasto em concorrência: `/api/pyx/transfer`, compra catálogo e buy-pyx de anúncio agora usam débito condicional `{balance_centavos: {$gte: amt}}` — saldo nunca fica negativo.
3. **MEDIUM** `/api/pyx/pix-orders/{id}/approve`: pedido é reivindicado atomicamente (pending→approved) ANTES do crédito — sem crédito duplicado.
4. Senha do MASTER não pode mais ser trocada via `/api/staff/team/{id}/password` (retorna 400 explicando que vem do .env) — elimina conflito com o seed_admin que re-sincroniza a senha a cada startup.
Backlog do review (baixa prioridade): rate limiting nos logins (P1 já planejado), padronizar/remover campo legado `balance` float.

## Auditoria de Segurança (22/07)
CORRIGIDO (não afeta login/deploy):
- GET /api/members/{id} não retorna mais password_hash/reset_token/PII.
- POST/DELETE /api/admin/seed-marketplace agora exigem require_admin.
- Busca de produtos/anúncios: re.escape no $regex (anti-ReDoS).

BACKLOG P0 (NÃO implementar sem aval — risco de regressão, usuário pediu estabilidade):
- SEC-001: membros não têm sessão/JWT; endpoints confiam no member_id enviado pelo cliente → BOLA/IDOR em massa (DMs, wallet, perfil, pix-orders, refund/confirm/mark-shipped). Correção = emitir JWT de membro no login e derivar identidade do token em ~119 rotas + api.ts. Toca no fluxo inteiro do membro; exige teste completo antes de publicar.
- SEC-003 (parcial): /wallet/refund, /wallet/confirm, /pyx/orders/{tx}/mark-shipped confiam em IDs do body (parte do root cause do SEC-001).
- Rotacionar OPENAI_API_KEY commitada no .env (repo privado → risco baixo).

## Fix "undefined/api" no Netlify (23/07) — CAUSA RAIZ REAL
O `.gitignore` tinha DOIS blocos com `*.env`; o fork anterior corrigiu só o primeiro. O segundo (linha ~98-100) continuava ignorando `frontend/.env` E `backend/.env` → nenhum dos dois estava no Git → build do Netlify sem `EXPO_PUBLIC_BACKEND_URL` → Expo injeta `undefined` → `undefined/api/members/login`.
Correções:
1. Removido o 2º bloco `.env/.env.*/*.env` do `.gitignore`; `frontend/.env` e `backend/.env` agora TRACKED (git add -f). NUNCA re-adicionar regras de .env.
2. `frontend/src/api.ts` e `frontend/app/welcome.tsx`: `BASE_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "https://member-shop-2.preview.emergentagent.com").replace(/\/$/,"")` → nunca gera undefined (env var tem precedência).
3. `frontend/netlify.toml`: `[build.environment] EXPO_PUBLIC_BACKEND_URL` para builds from-source do Netlify.
4. static_frontend re-buildado (bundle confirmado sem "undefined/api"). Login Master validado E2E na Home.
ARQUITETURA: o frontend no Netlify chama o backend do Emergent (preview URL) — MESMO backend/DB/usuários. NÃO usar Emergent Publish para o backend nesse cenário (criaria DB novo/vazio = causa da divergência anterior). Se o subdomínio do preview mudar (fork/reset do pod), atualizar a URL em api.ts/welcome.tsx/netlify.toml/frontend/.env e rebuildar.
