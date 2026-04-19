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
   Below is the launch-day set. Source of truth is
   `apps/api/.env.example` — any var you see there that's not below is
   optional (feature degrades gracefully).

   **Core runtime + auth**
   ```bash
   fly secrets set \
     NODE_ENV=production \
     JWT_SECRET=$(openssl rand -base64 64) \
     JWT_REFRESH_EXPIRY=7d \
     JWT_EXPIRY=15m \
     CSRF_SECRET=$(openssl rand -hex 32) \
     DATABASE_URL="postgresql://..." \
     DIRECT_URL="postgresql://..." \
     REDIS_URL="rediss://..." \
     CORS_ORIGIN="https://vintage.br,https://www.vintage.br" \
     TOS_VERSION="2026-01-01" \
     ADMIN_SETUP_KEY=$(openssl rand -hex 32) \
     WEBHOOK_BASE_URL="https://api.vintage.br"
   ```

   **Search + storage**
   ```bash
   fly secrets set \
     MEILISEARCH_HOST="https://..." \
     MEILISEARCH_API_KEY="..." \
     S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com" \
     S3_REGION="auto" \
     S3_BUCKET="vintage-listings" \
     S3_ACCESS_KEY="..." \
     S3_SECRET_KEY="..."
   # UploadsService auto-detects R2 from the endpoint hostname and
   # defaults S3_REGION='auto'. AWS S3 users can omit S3_REGION
   # (defaults us-east-1) or set their real region explicitly.
   ```

   **Payments + shipping + NF-e + email**
   ```bash
   fly secrets set \
     MERCADOPAGO_ACCESS_TOKEN="APP_USR-..." \
     MERCADOPAGO_WEBHOOK_SECRET=$(openssl rand -hex 32) \
     MERCADOPAGO_PAYOUT_ENABLED="false" \
     CORREIOS_TOKEN="..." \
     NFE_API_KEY="..." \
     RESEND_API_KEY="re_..." \
     EMAIL_FROM="Vintage.br <noreply@vintage.br>" \
     SMTP_HOST="smtp.resend.com" SMTP_PORT=465 \
     SMTP_USER="resend" SMTP_PASS="re_..."
   ```

   **OAuth + image moderation + SMS 2FA**
   ```bash
   fly secrets set \
     GOOGLE_CLIENT_ID="..." \
     GOOGLE_CLIENT_SECRET="..." \
     APPLE_CLIENT_ID="br.vintage.app" \
     APPLE_TEAM_ID="..." \
     APPLE_KEY_ID="..." \
     APPLE_PRIVATE_KEY="$(cat AuthKey_XXX.p8)" \
     GOOGLE_VISION_API_KEY="..." \
     TWILIO_ACCOUNT_SID="..." \
     TWILIO_AUTH_TOKEN="..." \
     TWILIO_FROM_NUMBER="+55..."
   # APPLE_TEAM_ID is also consumed by the web host's
   # /.well-known/apple-app-site-association route — set it there too.
   ```

   **Captcha (Turnstile) — flip CAPTCHA_ENFORCE=true only after the
   mobile release with captchaToken support hits ≥95% adoption.**
   ```bash
   fly secrets set \
     TURNSTILE_SECRET_KEY="..." \
     CAPTCHA_ENFORCE="false"
   ```

   **Analytics (PostHog, EU region)**
   ```bash
   fly secrets set \
     POSTHOG_API_KEY="phc_..." \
     POSTHOG_HOST="https://eu.i.posthog.com"
   ```

   **Identity verification — Track B (Serpro) + Track C (Caf).** Both
   flags default off. Flip only after the respective contract is
   active and the credentials are provisioned.
   ```bash
   fly secrets set \
     IDENTITY_VERIFICATION_ENABLED="false" \
     SERPRO_BASE_URL="" \
     SERPRO_TOKEN_PATH="/token" \
     SERPRO_VALIDATE_PATH="/datavalid/v3/validate" \
     SERPRO_CLIENT_ID="" \
     SERPRO_CLIENT_SECRET="" \
     IDENTITY_DOCUMENT_ENABLED="false" \
     CAF_BASE_URL="" \
     CAF_CREATE_SESSION_PATH="/v1/verifications" \
     CAF_API_KEY="" \
     CAF_WEBHOOK_SECRET=""
   ```

   **Retention + cron tuning (defaults are production-sane)**
   ```bash
   # Override only if the DPO's RIPD signoff lands on different values.
   fly secrets set \
     RETENTION_LOGIN_EVENT_DAYS="90" \
     RETENTION_PROCESSED_WEBHOOK_DAYS="30" \
     RETENTION_LISTING_IMAGE_FLAG_DAYS="365" \
     RETENTION_FRAUD_FLAG_DAYS="365" \
     RETENTION_CPF_VERIFICATION_LOG_DAYS="365" \
     RETENTION_CAF_SESSION_DAYS="365" \
     ORPHAN_IMAGE_SWEEP_DAYS="30" \
     STALE_LISTING_DAYS="90" \
     PAUSED_CLEANUP_DAYS="180" \
     TRACKING_POLL_LOOKBACK_DAYS="30" \
     TRACKING_POLL_BATCH_SIZE="200"
   ```

   For the **web host** (Vercel): see §7 below — the web consumes
   `APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`,
   `ANDROID_CERT_SHA256` at `/.well-known/*` request time, plus the
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `NEXT_PUBLIC_POSTHOG_*` vars.
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

## 8c. Breaking change — CPF identity verification (Tracks A/B/C)

The old `User.cpfVerified` column was renamed to `cpfChecksumValid` and
a NEW column `cpfIdentityVerified` was added. Payout and NF-e gates now
check `cpfIdentityVerified` — which only flips true after a Tier-2 KYC
provider (Serpro Datavalid on `/users/me/verify-identity`, or Caf
document + liveness via `/users/me/verify-identity-document` + the
`/webhooks/caf` callback) confirms the CPF at Receita Federal AND the
name matches.

**Effect at deploy:** **nobody can withdraw** until they complete
`/conta/verificacao` and the server flips `cpfIdentityVerified = true`.
This is deliberate — launching without real KYC was already unsafe.

**Mitigations:**
- Ship the verification screens (web + mobile) in the same release
  (shipped — `/conta/verificacao` on both platforms).
- The wallet error path routes the user directly to the verification
  screen instead of dead-ending on a toast.
- Track B (Serpro) is cheap (~R$0.06-0.25/check) and handles the
  straightforward case. Track C (Caf, ~R$5-10/session) only fires when
  the user clicks "Verificar por documento" after a Track-B
  NAME_MISMATCH / CPF_SUSPENDED.
- `IDENTITY_VERIFICATION_ENABLED=false` AND `IDENTITY_DOCUMENT_ENABLED
  =false` are the defaults — **nobody** can verify until you flip
  them. Plan the flip alongside the vendor contract go-live date.

**Flip checklist when Serpro is live:**
1. Set `SERPRO_BASE_URL` / `SERPRO_CLIENT_ID` / `SERPRO_CLIENT_SECRET`.
2. Confirm `SERPRO_TOKEN_PATH` + `SERPRO_VALIDATE_PATH` against the
   contract PDF; override the env if divergent.
3. Flip `IDENTITY_VERIFICATION_ENABLED=true`.
4. Smoke via staging with a known-good CPF + name + DOB.

**Flip checklist when Caf is live:**
1. Set `CAF_BASE_URL` / `CAF_API_KEY` / `CAF_WEBHOOK_SECRET`.
2. Set `WEBHOOK_BASE_URL` to the api's public origin
   (`https://api.vintage.br`).
3. Flip `IDENTITY_DOCUMENT_ENABLED=true`.
4. Smoke: force a Serpro NAME_MISMATCH → click escalation button →
   confirm Caf session → complete the flow → verify the webhook lands
   and `cpfIdentityVerified` flips.

**MP Marketplace contract not yet active:** also set
`MERCADOPAGO_PAYOUT_ENABLED=false` in Fly secrets until the B2B contract
is live. Wallet debits still succeed, but `PayoutRequest` rows stay
`PENDING` and finance/ops processes PIX out-of-band via the admin
endpoint `PATCH /wallet/admin/payouts/:id/status`. Once the contract is
active, flip the flag and the same code path calls MP directly.

## 8b. Breaking change — Wave 3B session invalidation

A Wave 3B rollout adds a `tokenVersion` claim (`ver`) to every JWT. The
JWT auth guard + refresh handler both reject tokens whose `ver` doesn't
match the user's current `tokenVersion`. Existing users' in-flight
tokens were minted **before** this commit and therefore have no `ver`
claim — the guard treats that as "stale" and returns 401 on the next
request.

**Effect at deploy:** every logged-in user is signed out and prompted to
re-authenticate. This is intentional (the whole point of the feature
was to make session invalidation possible), but it will spike the login
endpoint and may confuse users who haven't seen a "please sign in again"
message before.

**Mitigations:**
- Announce the re-login in the mobile/web app (one-time banner) the day
  before deploy.
- Stagger the deploy off-peak.
- Warm Mercado Pago/Twilio quotas in advance in case every returning
  user redoes 2FA SMS (for 2FA-SMS accounts).
- There is a new admin endpoint `POST /moderation/users/:id/force-logout`
  that bumps `tokenVersion` without banning — useful for support tickets
  reporting "I think my account is compromised."

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
