# Vintage.br

Marketplace de moda de segunda mão para o Brasil — inspirado no Vinted.
**Sem taxas para vendedores. Proteção ao comprador. PIX como pagamento principal.**

## O que é

Vintage.br é uma plataforma peer-to-peer onde pessoas compram e vendem roupas, calçados, acessórios e itens de segunda mão. O modelo de negócio cobra uma taxa de proteção ao comprador (R$3,50 + 5%) em vez de comissão do vendedor — tornando a plataforma gratuita para quem vende.

## Tech Stack

| Camada | Tecnologia | Descrição |
|--------|-----------|-----------|
| Mobile (P1) | React Native (Expo) | App iOS + Android — plataforma principal |
| Web (P2) | Next.js 14 + Tailwind CSS | Site secundário |
| API | NestJS + Prisma + PostgreSQL | Backend com 20+ módulos |
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
│   ├── web/              # Next.js 14 + Tailwind CSS
│   │   └── src/          # 8 páginas (home, listings, sell, auth, profile) + componentes + testes
│   └── api/              # NestJS backend
│       ├── prisma/       # Schema (25+ models) + seed
│       └── src/          # 20+ módulos + 111 testes unitários
├── packages/
│   └── shared/           # Types, constants, CPF/CEP validation
├── docker-compose.yml    # Postgres, Redis, Meilisearch
├── CLAUDE.md             # Project guidelines + security standards
└── PLAN.md               # Full project plan + company setup guide
```

## Módulos da API

| Módulo | Endpoints | Funcionalidade |
|--------|-----------|---------------|
| **Auth** | register, login, refresh, Google OAuth, Apple Sign In | CPF validation, bcrypt, JWT, social login |
| **Users** | profile, addresses, follow, vacation, storefront | CEP autocomplete, follow counts, vacation mode, public storefront |
| **Listings** | CRUD, search, favorites, categories, feed, saved searches, price suggestion | Filtros, paginação, social feed, preço sugerido por IA |
| **Orders** | create, ship, confirm | Escrow, taxa de proteção (R$3,50 + 5%), crédito na carteira |
| **Offers** | create, accept, reject | Mínimo 50% do preço, expiração em 48h |
| **Wallet** | balance, transactions, payout | Saque via PIX, mínimo R$10 |
| **Messages** | conversations, send, WebSocket gateway | Chat em tempo real (Socket.io), typing, read receipts, online status |
| **Reviews** | create, list | Avaliação binária (1 ou 5 estrelas) |
| **Notifications** | list, read, read-all | Contagem de não lidas |
| **Search** | full-text search | Meilisearch: filtros, ordenação, atributos pesquisáveis |
| **Payments** | PIX, cartão, boleto, webhook | QR code PIX, parcelamento 12x, boleto |
| **Shipping** | rates, labels, tracking, drop-off | Correios PAC/SEDEX, Jadlog, rastreamento |
| **Disputes** | open, resolve | Janela de 2 dias, reembolso ou liberação |
| **Bundles** | create, checkout | Pacotes com frete combinado, múltiplos itens |
| **Promotions** | megafone, bump, spotlight | Boost grátis 7 dias, impulsionar R$4,90, destaque R$29,90 |
| **Reports** | file, list | Denúncia de anúncios e usuários (Prisma-backed) |
| **Nota Fiscal** | generate, preview tax | NF-e mock, cálculo ICMS/ISS |
| **Uploads** | presigned URLs, file upload | S3 com criptografia AES256, validação MIME |
| **Email** | transactional emails | Boas-vindas, confirmação de pedido, envio, pagamento |
| **Push** | device tokens, send | Push notifications via Expo (iOS + Android) |

## Database

25+ modelos Prisma: User, Listing, ListingImage, Category, Brand, Order, Offer, Bundle, BundleItem, Wallet, WalletTransaction, Favorite, Follow, Conversation, Message, Review, Dispute, Notification, Address, Promotion, SavedSearch, PriceSuggestion, PriceDropAlert, Report, DeviceToken.

**Seed**: 10 categorias com 55 subcategorias + 55 marcas brasileiras e internacionais.

## Como rodar

### Pré-requisitos
- Node.js >= 20
- Docker + Docker Compose

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
- CPF: validação Módulo 11
- Marcas brasileiras: Farm, Animale, Osklen, Colcci, Reserva, Havaianas, Melissa, Arezzo, etc.

## Scripts

```bash
npm run dev          # Rodar todos os apps em desenvolvimento
npm run build        # Build de produção
npm run lint         # Lint em todos os pacotes
npm run test         # Rodar testes
npm run format       # Formatar código com Prettier
```

## Documentação

- **[PLAN.md](./PLAN.md)** — Plano completo do projeto, análise de concorrentes (Vinted, Enjoei), fases de implementação, guia de abertura de empresa no Brasil
- **[CLAUDE.md](./CLAUDE.md)** — Guidelines de desenvolvimento, checklist pre-push, padrões de segurança

## Licença

Privado — todos os direitos reservados.
