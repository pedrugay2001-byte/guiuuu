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
