# FarmaClube — PRD

## Vision
Exclusive members-only mobile club for buying weight-loss products, peptides, Landerlan line / hormones, pre-workouts and supplements. Premium black visual identity with silver/white accents.

## MVP Scope (Iteration 1)
### Authentication
- JWT email/password (register + login)
- Admin auto-seeded: `admin@farmaclube.com` / `admin123`
- Token stored in AsyncStorage

### Catalog
- 12 seeded products across 6 categories (Emagrecedores, Peptídeos, Landerlan, Hormônios, Pré-treinos, Suplementos)
- Search + category filter
- Featured section on Home
- Product details with member vs. regular price (discount badge)

### Cart & Checkout
- Add / remove / quantity controls with AsyncStorage persistence
- Badge on cart tab
- **WhatsApp checkout (MOCKED)**: opens `wa.me/<WHATSAPP_NUMBER>` with formatted order message. No real payment processing. Update `WHATSAPP_NUMBER` in `/app/frontend/src/theme.ts`.

### Member Area
- Profile card with role badge (MEMBRO / ADMINISTRADOR)
- Logout
- **Admin-only**: full product CRUD (create / edit / delete) inside Member tab

### Design System
- Colors: `#050505` bg, `#121212` surface, `#C0C0C0` silver, `#FFFFFF` primary
- Sharp 4/8px radii, uppercase section labels, high-contrast imagery

## Backend Endpoints
- `POST /api/auth/register | login`, `GET /api/auth/me`
- `GET /api/products?category=&q=`, `/api/products/featured`, `/api/products/{id}`
- `POST|PUT|DELETE /api/products` (admin)
- `GET /api/categories`

## Next Iterations (deferred)
- Google social login (Emergent Auth) — mobile native flow
- Orders history per user (persist WhatsApp intent)
- Favorites
- Real payment (Stripe/PIX)
- Push notifications on new drops
- Product image uploads (vs. URL input)

## Business Enhancement Idea
**Referral Code System** — each member gets a unique code; referring a friend who buys unlocks a % discount on next order. Natural fit for exclusive-club psychology and viral growth.
