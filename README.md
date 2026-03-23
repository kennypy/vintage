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
| API | NestJS + Prisma + PostgreSQL | Backend com 9 módulos |
| Shared | TypeScript package | Tipos, constantes, validação CPF/CEP |
| Infra | Docker Compose | Postgres 16, Redis 7, Meilisearch |
| CI | GitHub Actions | Lint, type-check, test, build |

## Estrutura do Monorepo

```
vintage/
├── apps/
│   ├── mobile/           # React Native (Expo) — iOS + Android
│   │   ├── app/          # Expo Router screens (tabs: Home, Search, Sell, Inbox, Profile)
│   │   └── src/          # Services, theme, hooks
│   ├── web/              # Next.js 14 + Tailwind CSS
│   │   └── src/app/      # App Router pages
│   └── api/              # NestJS backend
│       ├── prisma/       # Schema (20 models) + seed
│       └── src/          # 9 modules + auth + health
├── packages/
│   └── shared/           # Types, constants, CPF/CEP validation
├── docker-compose.yml    # Postgres, Redis, Meilisearch
├── CLAUDE.md             # Project guidelines + security standards
└── PLAN.md               # Full project plan + company setup guide
```

## Módulos da API

| Módulo | Endpoints | Funcionalidade |
|--------|-----------|---------------|
| **Auth** | register, login, refresh | CPF validation, bcrypt, JWT tokens |
| **Users** | profile, addresses, follow, vacation | CEP autocomplete, follow counts, vacation mode |
| **Listings** | CRUD, search, favorites, categories | Filtros por categoria/marca/tamanho/cor/preço, paginação |
| **Orders** | create, ship, confirm | Escrow, taxa de proteção (R$3,50 + 5%), crédito na carteira |
| **Offers** | create, accept, reject | Mínimo 50% do preço, expiração em 48h |
| **Wallet** | balance, transactions, payout | Saque via PIX, mínimo R$10 |
| **Messages** | conversations, send | Chat em tempo real, marcar como lido |
| **Reviews** | create, list | Avaliação binária (1 ou 5 estrelas) |
| **Notifications** | list, read, read-all | Contagem de não lidas |

## Database

20 modelos Prisma: User, Listing, ListingImage, Category, Brand, Order, Offer, Bundle, BundleItem, Wallet, WalletTransaction, Favorite, Follow, Conversation, Message, Review, Dispute, Notification, Address, Promotion, SavedSearch, PriceSuggestion, PriceDropAlert.

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
