# Vintage.br — Runbook de Deploy

Este documento descreve como publicar o Vintage.br em produção usando a stack
recomendada:

| Camada | Serviço | Alternativa |
|---|---|---|
| Banco Postgres | Supabase (managed) | AWS RDS, Neon |
| Redis | Upstash (serverless) | Elasticache |
| Busca | Meilisearch Cloud | Meilisearch self-hosted em Fly.io |
| API (NestJS) | Fly.io | Railway, Render, AWS Fargate |
| Storage S3 | Cloudflare R2 | AWS S3 |
| Web (Next.js) | Vercel | Netlify, Cloudflare Pages |
| Email | Resend | SendGrid, AWS SES |
| Mobile | EAS Build → App Store / Play Store | — |
| DNS | Cloudflare | Route 53 |

A ordem recomendada é: **DB → Redis → Storage → Email → API → Web → Mobile**.

---

## 0. Pré-requisitos

- Conta no GitHub com permissão de push em `kennypy/vintage`.
- Node.js 20+ e npm 10+ localmente.
- `npx eas-cli@latest` autenticado (`npx eas login`) para builds mobile.
- `npx vercel login`, `flyctl auth login`, `supabase login`.

Antes de qualquer deploy, execute localmente o checklist pré-push em
`CLAUDE.md` e garanta que todos os testes passam.

---

## 1. Postgres — Supabase

1. Crie um projeto em https://supabase.com → região `São Paulo (sa-east-1)`.
2. Em **Project Settings → Database → Connection Pooling**, copie a *connection
   string* com pool (`pgbouncer`). Anote também a *direct connection* (porta
   5432) — o Prisma usa a primeira para a aplicação e a segunda para as
   migrações.
3. Variáveis de ambiente:
   - `DATABASE_URL` — pooled connection
   - `DIRECT_URL` — direct connection (usada por `prisma migrate deploy`)
4. Rode as migrações:
   ```bash
   cd apps/api
   DATABASE_URL=... DIRECT_URL=... npx prisma migrate deploy
   ```
5. **IMPORTANTE:** Habilite *Row Level Security* nas tabelas expostas pela API
   pública Supabase apenas se você quiser consumir o Supabase como BaaS;
   quando a API NestJS é a única consumidora, você pode manter RLS desligado e
   apenas garantir que a string de conexão nunca vaze fora do servidor.
6. Ative **Point-In-Time Recovery** (plano Pro) e configure alertas de quota
   de disco.

### Pool sizing

- Fly.io com 2 máquinas = 2 processos → `max_connections ≈ 20` por instância
  é suficiente. Configure `DATABASE_URL` com `?connection_limit=10` para
  evitar saturar o pool Supabase.

---

## 2. Redis — Upstash

1. Crie um Redis em https://upstash.com, região mais próxima do Fly (p. ex.
   `sa-east-1 / São Paulo` se disponível, senão `us-east-1`).
2. Copie a **Redis URL** (formato `rediss://...`). O `rediss://` implica TLS
   nativo — nenhum certificado extra.
3. Variáveis de ambiente:
   - `REDIS_URL` — URL completa
4. Verifique após o deploy com `redis-cli -u $REDIS_URL ping`.

Upstash free tier dá 10 000 comandos/dia — suficiente para desenvolvimento.
Para produção use o plano Pay-as-you-go (sem limite de conexões TCP
simultâneas).

---

## 3. Busca — Meilisearch

1. Opção A (recomendada): Meilisearch Cloud (https://cloud.meilisearch.com).
2. Opção B: self-host em uma máquina Fly.io dedicada:
   ```bash
   fly launch --image getmeili/meilisearch:latest --name vintage-search --region gru
   fly secrets set MEILI_MASTER_KEY=$(openssl rand -hex 32)
   fly deploy
   ```
3. Variáveis de ambiente:
   - `MEILISEARCH_HOST` — ex. `https://vintage-search.fly.dev`
   - `MEILISEARCH_API_KEY` — master key
4. Inicialize os índices:
   ```bash
   cd apps/api
   npm run meilisearch:seed
   ```
5. Habilite **Search Analytics** (cloud) ou monitore via `/metrics` do
   Meilisearch self-hosted.

---

## 4. Storage — Cloudflare R2

1. Em Cloudflare → R2 → **Create bucket**: `vintage-listings` (produção) e
   `vintage-listings-dev` (staging).
2. **R2 → Manage R2 API Tokens** → crie um token com `Object Read & Write`
   escopo apenas nesses buckets.
3. Habilite *Public Access* apenas via domínio custom (ex.
   `cdn.vintage.br`) — NUNCA exponha o bucket público direto.
4. Variáveis de ambiente:
   - `S3_ENDPOINT` — `https://<account>.r2.cloudflarestorage.com`
   - `S3_REGION` — `auto`
   - `S3_BUCKET` — `vintage-listings`
   - `S3_ACCESS_KEY_ID`
   - `S3_SECRET_ACCESS_KEY`
   - `S3_PUBLIC_URL` — `https://cdn.vintage.br`
   - `PRESIGNED_URL_EXPIRY` — `900` (15 min)
5. Configure CORS no bucket para aceitar apenas `https://vintage.br`,
   `https://www.vintage.br` e os schemes do app (`vintagebr://`).
6. R2 já criptografa em repouso (AES-256); todo upload continua enviando
   `ServerSideEncryption: AES256` por compatibilidade.

---

## 5. Email — Resend

1. Crie conta em https://resend.com e **verifique o domínio** `vintage.br`
   (DKIM + SPF + DMARC).
2. Gere uma API Key em **API Keys → Create API Key** com permissão `Send
   emails`.
3. Variáveis de ambiente:
   - `EMAIL_PROVIDER` — `resend`
   - `RESEND_API_KEY`
   - `EMAIL_FROM` — `Vintage.br <noreply@vintage.br>`
   - `EMAIL_REPLY_TO` — `suporte@vintage.br`
4. Templates transacionais estão em `apps/api/src/email/*.ts`. Teste o envio
   antes de publicar:
   ```bash
   curl -X POST $API_URL/auth/forgot-password \
     -H 'Content-Type: application/json' \
     -d '{"email":"seu-email@dominio.com"}'
   ```

---

## 6. API NestJS — Fly.io

1. Instale a CLI: `curl -L https://fly.io/install.sh | sh`.
2. Na raiz do monorepo:
   ```bash
   cd apps/api
   fly launch --name vintage-api --region gru --no-deploy
   ```
3. **Segredos** — nunca coloque em `fly.toml`:
   ```bash
   fly secrets set \
     NODE_ENV=production \
     JWT_SECRET=$(openssl rand -base64 64) \
     JWT_REFRESH_EXPIRY=7d \
     JWT_EXPIRY=15m \
     DATABASE_URL="postgresql://..." \
     DIRECT_URL="postgresql://..." \
     REDIS_URL="rediss://..." \
     MEILISEARCH_HOST="https://..." \
     MEILISEARCH_API_KEY="..." \
     S3_ENDPOINT="https://..." \
     S3_BUCKET="vintage-listings" \
     S3_ACCESS_KEY_ID="..." \
     S3_SECRET_ACCESS_KEY="..." \
     S3_PUBLIC_URL="https://cdn.vintage.br" \
     RESEND_API_KEY="re_..." \
     EMAIL_FROM="Vintage.br <noreply@vintage.br>" \
     MERCADOPAGO_ACCESS_TOKEN="APP_USR-..." \
     MERCADOPAGO_WEBHOOK_SECRET=$(openssl rand -hex 32) \
     CORS_ORIGIN="https://vintage.br,https://www.vintage.br" \
     TOS_VERSION="2026-01-01" \
     ADMIN_SETUP_KEY=$(openssl rand -hex 32) \
     GOOGLE_CLIENT_ID="..." \
     APPLE_CLIENT_ID="br.vintage.app" \
     APPLE_TEAM_ID="..." \
     APPLE_KEY_ID="..." \
     APPLE_PRIVATE_KEY="$(cat AuthKey_XXX.p8)"
   ```
4. Configure *scaling*:
   ```bash
   fly scale count 2 --region gru
   fly scale memory 1024
   ```
   Duas máquinas em GRU garantem HA. `cron_locks` (tabela Prisma) impede
   execuções duplicadas de tarefas agendadas.
5. Health check: a API expõe `/api/v1/health`. Confirme no `fly.toml`:
   ```toml
   [[services.http_checks]]
     grace_period = "10s"
     interval = "30s"
     path = "/api/v1/health"
     timeout = "5s"
   ```
6. Deploy:
   ```bash
   fly deploy
   ```
7. Migrações em produção são executadas a cada deploy pelo
   `release_command` do `fly.toml`:
   ```toml
   [deploy]
     release_command = "npx prisma migrate deploy"
   ```

### Domínio custom

1. Adicione `api.vintage.br` no Cloudflare apontando para o hostname do Fly
   (`vintage-api.fly.dev`), em modo **Proxied (laranja)** com SSL=Full (strict).
2. `fly certs create api.vintage.br`.

---

## 7. Web Next.js — Vercel

1. Importe o repositório em https://vercel.com/new.
2. **Root directory**: `apps/web`.
3. **Build command**: `cd ../.. && npx turbo build --filter=@vintage/web`.
4. **Install command**: `cd ../.. && npm install`.
5. **Output directory**: `apps/web/.next`.
6. Variáveis de ambiente (produção + preview):
   - `NEXT_PUBLIC_API_URL` — `https://api.vintage.br/api/v1`
   - `NEXT_PUBLIC_APP_URL` — `https://vintage.br`
7. Domínio: adicione `vintage.br` e `www.vintage.br` em **Domains**. Configure
   o redirect `www → root` no Cloudflare.
8. **Deploy Protection**: mantenha *Preview Deployments* com senha para não
   indexar previews no Google.

---

## 8. Mobile — EAS Build + App Store / Play Store

A parte de submissão está detalhada em `STORE_SUBMISSION.md`. Resumo:

1. `cd apps/mobile && npx eas-cli@latest build --profile production --platform all`.
2. Secrets do EAS:
   ```bash
   npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_API_URL --value "https://api.vintage.br/api/v1"
   npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_ENV --value "production"
   ```
3. Submissão:
   ```bash
   npx eas-cli@latest submit --platform ios
   npx eas-cli@latest submit --platform android
   ```

---

## 9. Pós-deploy

1. **Smoke tests em produção** (pode ser um script cURL em `scripts/smoke.sh`):
   - `GET /api/v1/health` → `{"status":"ok"}`
   - `GET /api/v1/listings` → 200
   - `POST /api/v1/auth/csrf-token` → retorna token
   - `GET /` na web → 200 com título “Vintage.br”
2. Configure **Sentry** (ou Logtail/Datadog) tanto no backend quanto no
   Next.js e no Expo para capturar exceções.
3. **Backups**: Supabase PITR já ativo; configure export diário do R2 via
   `rclone` para um bucket S3 de cold storage (glaciar).
4. **Monitoramento de custos**: configure alerta em Cloudflare + Fly + Vercel
   para `> R$ 500/mês`.

---

## 10. Rollback

- **Web**: no dashboard da Vercel, clique em *Promote to Production* em um
  deploy anterior.
- **API**: `fly releases --app vintage-api`, depois `fly releases rollback <id>`.
- **DB**: use o PITR do Supabase (até 7 dias no plano Pro). Migrações são
  unidirecionais; para desfazer, gere uma migração corretiva e aplique.
- **Mobile**: o App Store Connect permite rebaixar uma versão aprovada para a
  anterior no *Phased Release*. Na Play Store, use *Halt rollout*.

---

## 11. Checklist de segurança pré-lançamento

- [ ] `JWT_SECRET` tem 64 bytes aleatórios (não o default).
- [ ] `ADMIN_SETUP_KEY` configurado e consumido apenas uma vez.
- [ ] Webhook do Mercado Pago validado (`MERCADOPAGO_WEBHOOK_SECRET`).
- [ ] CORS com allowlist explícita (não `*`).
- [ ] CSP sem `unsafe-inline` em `script-src`.
- [ ] Presigned URLs com `PRESIGNED_URL_EXPIRY <= 900s`.
- [ ] Rate limit no gateway (Cloudflare WAF) para `/auth/*` — 20 req/min/IP.
- [ ] Fail2ban via rate limit do NestJS + Redis (já implementado).
- [ ] `npm audit --production` sem vulnerabilidades *high* ou *critical*.
- [ ] Varredura de secrets com `gitleaks` passou.

Se algum item não estiver marcado, **não publique**.
