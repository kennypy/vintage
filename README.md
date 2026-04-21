# Vintage.br

Marketplace de moda de segunda mão para o Brasil — inspirado no Vinted.
**Sem taxas para vendedores. Proteção ao comprador. PIX como pagamento principal.**

## O que é

Vintage.br é uma plataforma peer-to-peer onde pessoas compram e vendem roupas, calçados, acessórios e itens de segunda mão. O modelo de negócio cobra uma taxa de proteção ao comprador (R$3,50 + 5%) em vez de comissão do vendedor — tornando a plataforma gratuita para quem vende.

## Tech Stack

| Camada | Tecnologia | Descrição |
|--------|-----------|-----------|
| Mobile (P1) | React Native (Expo) | App iOS + Android — plataforma principal |
| Web (P2) | Next.js 15 (App Router) + Tailwind CSS | Site secundário |
| API | NestJS + Prisma + PostgreSQL | Backend com 30+ módulos |
| Shared | TypeScript package | Tipos, constantes, validação CPF/CEP |
| Infra | Docker Compose | Postgres 16, Redis 7, Meilisearch |
| CI | GitHub Actions | Lint, type-check, test, build |

## Estrutura do Monorepo

```
vintage/
├── apps/
│   ├── mobile/           # React Native (Expo) — iOS + Android
│   │   ├── app/          # Expo Router (16+ telas: tabs, auth, orders, offers, wallet, chat, etc.)
│   │   └── src/          # 8 services API, theme, hooks, contexts, components
│   ├── web/              # Next.js 15 (App Router) + Tailwind CSS
│   │   └── src/          # 8 páginas (home, listings, sell, auth, profile) + componentes + testes
│   └── api/              # NestJS backend
│       ├── prisma/       # Schema (35+ models) + seed
│       └── src/          # 25+ módulos + 310 testes unitários
├── packages/
│   └── shared/           # Types, constants, CPF/CEP validation
├── docker-compose.yml    # Postgres, Redis, Meilisearch
├── CLAUDE.md             # Project guidelines + security standards
└── PLAN.md               # Full project plan + company setup guide
```

## Módulos da API

| Módulo | Endpoints | Funcionalidade |
|--------|-----------|---------------|
| **Auth** | register, login, refresh, Google OAuth, Apple Sign In, 2FA setup/enable/disable/confirm, 2FA-SMS setup/enable/resend, email-change request/confirm | CPF validation, bcrypt, JWT, social login, TOTP + SMS 2FA (Twilio), login anomaly detection, email change with token-hash storage |
| **Users** | profile, addresses, follow, vacation, storefront, block/unblock/list-blocks, set-CPF (OAuth accounts) | CEP autocomplete, follow counts, vacation mode, public storefront, user blocking (gates messages + offers), set-once CPF linker for OAuth users |
| **Listings** | CRUD, search, favorites, categories, feed, saved searches, price suggestion, video | Filtros, paginação, social feed, preço sugerido por IA, vídeos 30s MP4/MOV |
| **Orders** | create, ship, confirm | Escrow com janela de hold configurável (ESCROW_HOLD_DAYS, padrão 2d) — buyer pode abrir devolução/disputa durante o hold; taxa de proteção (R$3,50 + 5%), crédito na carteira |
| **Offers** | create, accept, reject, **counter**, thread | Mínimo 50% do preço, expiração em 48h, cadeia de contrapropostas (MAX_OFFER_COUNTERS=3, alternância comprador/vendedor) |
| **Payments** | PIX, cartão, boleto, webhook, **retry** | Tentativas múltiplas por pedido via Payment model (MAX_PAYMENT_ATTEMPTS=3), cada tentativa rastreada com attemptNumber + parentPaymentId |
| **Returns** | request, approve (gera etiqueta inversa), reject, mark-shipped, inspect-approve, inspect-reject | Fluxo de devolução colaborativo; janela de RETURN_WINDOW_DAYS (padrão 7); tracking poller detecta pacote de retorno; seller tem RETURN_INSPECTION_DAYS para inspecionar ou escala para disputa automática |
| **Wallet** | balance, transactions, payout, payout-methods CRUD | Saque via chave PIX salva (race-safe, débito atômico), 5 chaves/conta, 5 tipos PIX canonicalizados (CPF/CNPJ/email/phone BR/random UUID), mascaramento obrigatório |
| **Messages** | conversations, send, WebSocket gateway | Chat em tempo real (Socket.io), typing, read receipts, online status |
| **Reviews** | create, list, seller reply | Avaliação binária (1 ou 5 estrelas), resposta pública do vendedor |
| **Notifications** | list, read, read-all | Contagem de não lidas |
| **Search** | full-text search | Meilisearch: filtros, ordenação, atributos pesquisáveis |
| **Payments** | PIX, cartão, boleto, webhook | QR code PIX, parcelamento 12x, boleto |
| **Shipping** | rates, labels, tracking, drop-off | Correios PAC/SEDEX, Jadlog, Kangu, Pegaki — QR code sem impressora |
| **Disputes** | open, resolve | Janela de 5 dias após entrega, reembolso ou liberação de escrow (OrderListingSnapshot congela evidência) |
| **Bundles** | create, checkout | Pacotes com frete combinado, múltiplos itens |
| **Promotions** | megafone, bump, spotlight | Boost grátis 7 dias, impulsionar R$4,90, destaque R$29,90 |
| **Reports** | file, list | Denúncia de anúncios e usuários (Prisma-backed) |
| **Nota Fiscal** | generate, preview tax | NF-e mock, cálculo ICMS/ISS, gated em `cpfIdentityVerified` do vendedor |
| **Uploads** | presigned URLs, file upload, video upload | S3 com criptografia AES256, validação MIME, vídeos até 100MB, moderação Google Vision SafeSearch (rejeita VERY_LIKELY, sinaliza LIKELY) |
| **Authenticity** | submit, review (admin), status | Badge "Autêntico" com fotos de comprovação, aprovação manual |
| **Seller Insights** | dashboard | Sellability Score, tempo médio de venda por categoria, tendências de demanda |
| **Impact** | user impact, platform stats, order impact | CO₂ e água economizados, selos gamificados (Primeiros Passos → Campeã do Círculo) |
| **Email** | transactional emails | Boas-vindas, confirmação de pedido, envio, pagamento |
| **Push** | device tokens, send | Push notifications via Expo (iOS + Android) |
| **Fraud** | admin list/resolve flags | Rule engine (FraudRule) — regras de velocidade (contas novas) e drain pós-cadastro de payout, auto-sinalização de usuários para revisão |
| **Moderation** | reports, image-flags, fraud-flags | Triagem admin — denúncias, imagens sinalizadas pelo SafeSearch, fraude |
| **Identity** | verify-identity (Serpro), verify-identity-document (Caf) | Track B (CPF+nome+DOB na Receita) e Track C (documento + liveness) — libera `cpfIdentityVerified`, que gate saques e NF-e |
| **Analytics** | server-side events | PostHog EU region — user_registered, listing_created, order_created, order_paid, order_delivered, dispute_opened |
| **Tracking Poller** | cron (hourly) | Auto-promote SHIPPED → DELIVERED quando carriers (Correios, Jadlog, Kangu, Pegaki) reportam entrega via webhook/poll |

## Database

35+ modelos Prisma. Core: User, Listing, ListingImage, ListingVideo, Category, Brand, Order, OrderListingSnapshot, Offer, Bundle, BundleItem, Wallet, WalletTransaction, PayoutMethod, PayoutRequest, Favorite, Follow, Conversation, Message, Review, Dispute, Notification, Address, Coupon, Promotion, SavedSearch, PriceDropAlert, Report, DeviceToken, LoginEvent, AuthenticityRequest, NotaFiscal, PaymentFlag.

Integrity & compliance: ProcessedWebhook (dedup), ListingImageFlag (SafeSearch moderation queue), FraudRule + FraudFlag (velocity/drain signals), CpfVerificationLog (KYC audit, SHA256 hashes only), CafVerificationSession (document+liveness sessions), DeletionAuditLog (LGPD), Consent.

**Seed**: 10 categorias com 55 subcategorias + 55 marcas brasileiras e internacionais + 2 FraudRule rows (NEW_ACCOUNT_VELOCITY, PAYOUT_DRAIN). Admin promotion via `npm run admin:promote -- <email>` (seed.ts refuses to run with NODE_ENV=production).

## Como rodar

### Pré-requisitos
- Node.js >= 20
- Docker + Docker Compose
- **Windows**: Git for Windows (vem com git-bash) **OU** WSL2. O repo já
  normaliza line endings para LF via `.gitattributes`, então basta clonar
  com qualquer Git recente. Os comandos `npm run ...` abaixo rodam em
  PowerShell, cmd.exe, git-bash e WSL sem alteração.

### Setup

```bash
# 1. Instalar dependências
npm install

# 2. Subir banco de dados, Redis e Meilisearch
docker compose up -d

# 3. Gerar Prisma client
cd apps/api && npx prisma generate

# 4. Rodar migrations
npx prisma migrate dev

# 5. Popular banco com categorias e marcas
npx ts-node prisma/seed.ts

# 6. Voltar pra raiz e rodar tudo
cd ../..
npm run dev
```

> **Windows**: se `cd apps/api && ...` falhar no PowerShell antigo, rode
> cada comando separadamente. `&&` funciona em PowerShell 7+ e cmd.exe
> por padrão. Nenhum passo depende de bash.

### Acessos locais

| Serviço | URL |
|---------|-----|
| API (NestJS) | http://localhost:3001 |
| Swagger Docs | http://localhost:3001/docs |
| Web (Next.js) | http://localhost:3000 |
| Mobile (Expo) | `expo start` no app |
| Meilisearch | http://localhost:7700 |

## Pagamentos

- **PIX** — método principal (QR code, copia e cola, confirmação instantânea)
- **Cartão de crédito** — parcelamento até 12x
- **Boleto bancário** — para usuários sem cartão
- Gateway: **Mercado Pago** SDK

## Localização Brasil

- Idioma: Português (BR) em toda a UI
- Moeda: BRL (R$) formato 1.234,56
- CEP: formato XXXXX-XXX com autocomplete via ViaCEP
- Tamanhos: PP, P, M, G, GG, XG, XXG + numéricos
- CPF: validação Módulo 11 no cadastro (`cpfChecksumValid`), verificação completa na Receita Federal via Serpro (`cpfIdentityVerified`, gate para saques e NF-e)

## Segurança e compliance

- **LGPD Art. 18**: exportação de dados via `POST /users/me/export` (ZIP com JSON + imagens + receipt SHA256)
- **KYC em 3 camadas**: Modulo-11 (grátis) → Serpro CPF+nome+DOB na Receita → Caf documento + liveness (conflito)
- **Fraud signals**: `FraudRule` tunable em produção; regras NEW_ACCOUNT_VELOCITY + PAYOUT_DRAIN seeded
- **Moderação de imagens**: Google Vision SafeSearch — rejeita VERY_LIKELY, sinaliza LIKELY para admin
- **Captcha**: Cloudflare Turnstile em register / forgot-password / SMS-resend (web + mobile WebView), gated em `CAPTCHA_ENFORCE`
- **Webhooks**: HMAC-SHA256 obrigatório + dedup via `ProcessedWebhook` (MP, Caf)
- **Snapshots de disputa**: `OrderListingSnapshot` congela o anúncio no momento da compra — evidência para disputa não depende do live Listing
- **Retenção LGPD**: crons diárias purgam `LoginEvent` 90d, `ProcessedWebhook` 30d, `ListingImageFlag`/`FraudFlag`/`CpfVerificationLog`/`CafVerificationSession` 365d, S3 orphan sweep 30d após soft-delete do anúncio
- **Deep links**: Universal Links (iOS) + Android App Links via `/.well-known/apple-app-site-association` e `/.well-known/assetlinks.json` no host web

Detalhes em `CLAUDE.md` §Security Standards e `docs/privacy/ripd.md`.
- Marcas brasileiras: Farm, Animale, Osklen, Colcci, Reserva, Havaianas, Melissa, Arezzo, etc.

## Scripts

```bash
npm run dev          # Rodar todos os apps em desenvolvimento
npm run build        # Build de produção
npm run lint         # Lint em todos os pacotes
npm run test         # Rodar testes
npm run format       # Formatar código com Prettier

./scripts/ci-parity.sh          # OBRIGATÓRIO antes de cada push (Linux/macOS) —
                                 # reproduz .github/workflows/ci.yml com caches
                                 # limpos + pipefail em todos os passos. Ver CLAUDE.md.
./scripts/ci-parity.sh --fast   # iteração local (mantém node_modules)

npm run ci:parity               # Windows / portátil — runner Node equivalente
                                 # (scripts/ci-parity.mjs). Mesmos passos,
                                 # mesma ordem, sem dependência de bash.
npm run ci:parity:fast          # idem, --fast (mantém node_modules)
```

## Documentação

- **[PLAN.md](./PLAN.md)** — Plano completo do projeto, análise de concorrentes (Vinted, Enjoei), fases de implementação, guia de abertura de empresa no Brasil
- **[CLAUDE.md](./CLAUDE.md)** — Guidelines de desenvolvimento, gate obrigatório `./scripts/ci-parity.sh`, anti-padrões que quebraram CI
- **[LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md)** — Top-to-bottom pre-launch + post-launch operational checklist (English)
- **[LOCAL_TEST_PLAN.md](./LOCAL_TEST_PLAN.md)** — Smoke test 30–45min cobrindo auth, 2FA (TOTP + SMS), bloqueios, CPF linker OAuth, saques com chaves PIX salvas
- **[DEPENDENCY_UPGRADE_PLAN.md](./DEPENDENCY_UPGRADE_PLAN.md)** — Fila priorizada para elevar `npm audit` gate de `critical` para `high` pós-lançamento
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Runbook de deploy em Supabase / Upstash / Meilisearch / Fly.io / R2 / Vercel / Resend
- **[STORE_SUBMISSION.md](./STORE_SUBMISSION.md)** — Passo a passo completo de submissão na App Store e Play Store
- **[THIRD_PARTY_ONBOARDING.md](./THIRD_PARTY_ONBOARDING.md)** — Cadastros Mercado Pago, Correios, Google/Apple OAuth, Twilio (SMS 2FA), Resend, Sentry
- **[apps/mobile/STORE_TEXT.pt-BR.md](./apps/mobile/STORE_TEXT.pt-BR.md)** — Textos pt-BR prontos para App Store e Play Store
- **[apps/mobile/assets/store/README.md](./apps/mobile/assets/store/README.md)** — Especificação dos assets visuais das lojas

## Licença

Privado — todos os direitos reservados.
