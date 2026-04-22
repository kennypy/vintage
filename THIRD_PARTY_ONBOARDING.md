# Vintage.br — Onboarding de Serviços de Terceiros

Este documento lista, em ordem de execução, todos os cadastros externos
necessários para o Vintage.br operar em produção. Marque cada item como
concluído (`[x]`) antes de liberar o deploy.

---

## 1. Pagamentos — Mercado Pago

### 1.1. Criação da conta

1. https://www.mercadopago.com.br/developers → **Criar conta empresarial**.
2. Ative **PIX automático** e **PIX por Copia e Cola** no painel da conta.
3. Em **Minhas aplicações → Criar aplicação**:
   - **Nome**: Vintage.br
   - **Solução**: Pagamentos online
   - **Plataforma**: e-commerce + mobile

### 1.2. Credenciais

- **Público-chave (Client ID)**: `APP_USR-xxxx` → `MERCADOPAGO_PUBLIC_KEY`.
- **Access Token de produção**: `APP_USR-yyyy` → `MERCADOPAGO_ACCESS_TOKEN`.
- **Access Token sandbox**: `TEST-zzzz` → use no staging.

### 1.3. Webhook

1. Em **Notificações → Configurar webhooks**, adicione:
   - URL: `https://api.vintage.br/api/v1/payments/webhook`
   - Eventos: `payment.created`, `payment.updated`.
2. Copie o **Secret** → `MERCADOPAGO_WEBHOOK_SECRET` no Fly.
3. Teste com **Simulador de notificações** no painel.

### 1.4. Split / Marketplace

- O Vintage.br retém 10% de comissão. Implementado via **Split Payments**
  (Mercado Pago Marketplace). Solicite a ativação do recurso em
  developers.mercadopago.com.br → Support (leva 1–2 dias úteis).
- Durante o onboarding, o Mercado Pago pede:
  - CNPJ da Vintage.br
  - Estatuto social / Contrato social
  - Volume projetado (R$/mês)

### 1.5. Payout — chaves PIX salvas + integração MP (Wave 3C)

O vendedor cadastra previamente uma ou mais chaves PIX
(`/conta/payout-methods`) e escolhe uma na hora do saque em `/wallet`.
O backend (`apps/api/src/wallet/payout-methods.service.ts`) nunca aceita
uma chave PIX anônima no body do saque.

- Limite: 5 chaves por conta (`MAX_METHODS_PER_USER`).
- Canonicalização estrita: CPF/CNPJ → só dígitos; email → lowercase;
  telefone → `+55DDDNNNNNNNN` (rejeita +1…, +44…, qualquer foreign);
  random → UUID v4.
- Mascaramento obrigatório em todas as respostas — nenhum endpoint
  retorna a chave raw. A chave só sai do DB para chamar o Mercado Pago
  na hora de efetivar o saque.
- Débito da carteira é race-safe via `UPDATE ... WHERE balance >= amount`
  — dois saques concorrentes contra o mesmo saldo não deixam a carteira
  negativa.

**Gate `cpfVerified` (Wave 3C):** o endpoint `/wallet/payout` exige que
o vendedor tenha CPF **verificado** (não apenas cadastrado). Verificação
é feita via upload de documento em `/conta/verificacao` com aprovação
admin. Isso alinha o gate com a exigência de KYC do Mercado Pago.

**Integração MP Marketplace (Wave 3C):** `apps/api/src/wallet/payouts.service.ts`
cria uma `PayoutRequest` por saque, debita a carteira atomicamente, e
chama `POST /v1/money_requests` do MP. Para ativar:

1. `fly secrets set MERCADOPAGO_PAYOUT_ENABLED=true` apenas **depois** do
   MP Marketplace contract estar ativo (ver §1.4 acima) — antes disso o
   `sendPixPayout()` lança `MercadoPagoPayoutUnavailableError` e o
   PayoutRequest fica em status `PENDING` para o financeiro processar
   manualmente.
2. Admins marcam manualmente `COMPLETED` ou `FAILED` via
   `PATCH /wallet/admin/payouts/:id/status` (requer AdminGuard).
   `FAILED` estorna o saldo atomicamente.
3. Webhook `POST /payments/webhook` já reconhece o payload — consumir o
   `external_reference` (PayoutRequest.id) para promover PROCESSING →
   COMPLETED.

**Lifecycle da PayoutRequest:**
```
PENDING  → chamada MP recusada (contrato ainda não ativo, ou limitação)
PROCESSING  → MP aceitou, aguardando confirmação do banco destinatário
COMPLETED  → MP confirmou; saldo já debitado
FAILED  → erro terminal; saldo estornado (REFUND no ledger)
```

O vendedor vê este histórico em `/wallet` (seção "Saques") no web e
mobile.

### 1.5. Homologação

Antes de ir para produção, execute o fluxo E2E em sandbox:
- [ ] Criar preferência de pagamento.
- [ ] Receber webhook de `payment.approved`.
- [ ] Simular refund.
- [ ] Verificar que o saldo do vendedor cresce e a comissão fica na conta
      master.

---

## 2. Correios

### 2.1. Contrato Correios (recomendado para volumes >100 envios/mês)

1. Acesse https://www.correios.com.br → **Para sua empresa**.
2. Contrate um **Cliente Contrato** (ex.: SEDEX + PAC) — requer CNPJ e
   histórico bancário.
3. Anote:
   - **Código administrativo** → `CORREIOS_ADMIN_CODE`
   - **Contrato** → `CORREIOS_CONTRACT`
   - **Cartão de postagem** → `CORREIOS_POSTING_CARD`
   - **Usuário/senha SIGEP Web** → `CORREIOS_USER`, `CORREIOS_PASSWORD`

### 2.2. API CWS (Correios Web Services)

- API de cálculo de preço/prazo e rastreio: https://cws.correios.com.br
- OAuth2: solicite `client_id` e `client_secret` pelo SIGEP.
- Endpoint base: `https://api.correios.com.br` → `CORREIOS_API_URL`.

### 2.3. Teste

```bash
curl -X POST "$API_URL/shipping/rates" \
  -H 'Content-Type: application/json' \
  -d '{"originCep":"01310-100","destinationCep":"20040-020","weightG":500}'
```

---

## 3. Jadlog (alternativa / backup aos Correios)

1. https://www.jadlog.com.br/JadlogEcommerce → Cadastrar.
2. Solicite token API em `integracao@jadlog.com.br`.
3. Variáveis:
   - `JADLOG_TOKEN`
   - `JADLOG_CONTRACT_NUMBER`
4. Teste: `POST /shipping/rates?carrier=jadlog` retorna cotação.

---

## 4. Google Sign In (OAuth)

### 4.1. Google Cloud Console

1. https://console.cloud.google.com → Criar projeto **Vintage.br**.
2. **APIs & Services → OAuth consent screen**:
   - User Type: **External**
   - App name: Vintage.br
   - Support email: `suporte@vintage.br`
   - Authorized domains: `vintage.br`
   - Scopes: `email`, `profile`, `openid`.
3. **Credentials → Create OAuth client ID**:
   - **Web application**:
     - Origins: `https://vintage.br`, `https://www.vintage.br`
     - Redirect URIs: `https://api.vintage.br/api/v1/auth/google/callback`
     - Guarde como `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.
   - **iOS**:
     - Bundle ID: `br.vintage.app`
     - Guarde como `GOOGLE_CLIENT_ID_IOS`.
   - **Android**:
     - Package: `br.vintage.app`
     - SHA-1: rode `npx eas-cli@latest credentials` → pegue fingerprint Android → colar.
     - Guarde como `GOOGLE_CLIENT_ID_ANDROID`.

### 4.2. Publicar

Para liberar mais de 100 usuários de teste, envie o app para verificação.
Prazo: 2–6 semanas; até lá, é possível operar em modo *Testing* com
usuários convidados.

---

## 5. Apple Sign In

### 5.1. Apple Developer

1. https://developer.apple.com → Certificates, IDs & Profiles.
2. **Identifiers → App ID**: já criado (`br.vintage.app`). Habilite
   **Sign In with Apple** na aba Capabilities.
3. **Identifiers → Services ID**: crie um Service ID para o web flow, ex.
   `br.vintage.web`. Configure *Domains and Subdomains*:
   - `vintage.br`
   - Return URL: `https://api.vintage.br/api/v1/auth/apple/callback`
4. **Keys → Create a Key**: habilite Sign In with Apple.
   - Baixe o arquivo `.p8` e **guarde em local seguro** (não commita).
   - Anote:
     - `APPLE_TEAM_ID` (10 chars)
     - `APPLE_KEY_ID` (10 chars)
     - `APPLE_CLIENT_ID` — `br.vintage.app` para iOS nativo, `br.vintage.web`
       para o web flow.
     - `APPLE_PRIVATE_KEY` — conteúdo do `.p8` (inclua `\n`).

### 5.2. Testes

- iOS simulador: Sign In with Apple só funciona em device físico ou
  simulador logado com uma conta Apple de teste.

---

## 6. Email transacional — Resend

1. https://resend.com → Sign up com conta empresarial.
2. **Domains → Add domain** `vintage.br`. Copie os registros DKIM/SPF/DMARC
   para o Cloudflare DNS.
3. Aguarde verificação (~10 min).
4. **API Keys → Create API Key** com permissão `Send emails`.
   - Nome: `vintage-api-prod`
   - Guarde como `RESEND_API_KEY`.

### Templates

Os templates transacionais vivem em `apps/api/src/email/*.ts`. O fluxo de
reset de senha usa o template `sendPasswordResetEmail`.

### Limites

- Plano free: 100 emails/dia, domínio único.
- Plano Pro (US$ 20/mês): 50 000/mês, múltiplos domínios, dedicado IP
  opcional.

---

## 6b. SMS / 2FA — Twilio

Necessário porque a Wave 2A introduziu **2FA por SMS** além do TOTP
tradicional. O app recusa subir em `NODE_ENV=production` sem estas
credenciais (ver `apps/api/src/main.ts` — `requiredSecrets`).

### 6b.1. Conta

1. https://www.twilio.com/ → criar conta empresarial.
2. Verificar domínio do email corporativo para tirar o selo "trial"
   (Upgrade → Add Funds).
3. Em **Phone Numbers → Manage → Buy a number**:
   - País: Brasil
   - Capacidades: **SMS** (obrigatório), Voice opcional
   - Formato E.164 (ex: `+5511999998888`) — esse é o `TWILIO_FROM_NUMBER`.
4. Toll-free / shortcode no BR não é possível para contas novas; o
   número local funciona para 2FA.

### 6b.2. Credenciais

- Dashboard → **Account Info**:
  - **Account SID** → `TWILIO_ACCOUNT_SID`
  - **Auth Token** → `TWILIO_AUTH_TOKEN` (clique em "View" + Copy)
- Número comprado → `TWILIO_FROM_NUMBER` (E.164).

Armazenar no Fly secrets:
```bash
fly secrets set \
  TWILIO_ACCOUNT_SID=AC... \
  TWILIO_AUTH_TOKEN=... \
  TWILIO_FROM_NUMBER=+5511999998888
```

### 6b.3. Compliance BR

- **LGPD**: Twilio não retém o conteúdo do SMS por default (apenas
  metadados de entrega). Confirmar em **Console → Settings → Messaging
  Service → Content retention** que está OFF.
- **Opt-out**: o nosso SMS de 2FA é transacional (pedido pelo usuário
  ao tentar login), então STOP/CANCEL são suportados pelo Twilio
  automaticamente; o código de recebimento nunca sai disso.

### 6b.4. Rate limit

O backend limita 5 envios/hora/usuário e cooldown de 30s entre tentativas
(`apps/api/src/auth/auth.service.ts` — `SMS_MAX_SENDS_PER_HOUR`,
`SMS_RESEND_COOLDOWN_SECONDS`). **Não aumente sem revisar o custo de
Twilio** — cada SMS BR custa ~R$0,30.

### 6b.5. Homologação

- [ ] Registrar conta com TOTP, deslogar, logar → digitar TOTP → sessão ok.
- [ ] Migrar para SMS 2FA via `/conta/seguranca` → **Configurar por SMS**.
- [ ] Logout → login → recebe SMS real (Twilio console → Logs → Messaging).
- [ ] Testar reenvio (cooldown 30s).
- [ ] Desativar SMS 2FA pelo mesmo fluxo.

### 6b.6. Dev mode

Com `TWILIO_*` em branco e `NODE_ENV != production`, o `SmsService` loga
o corpo do SMS no stdout do API:

```
[SmsService] SMS (dev) for +5511999998888: seu código de verificação é 123456
```

Nunca deixe essa configuração em staging público — qualquer pessoa com
acesso a logs vê o código.

---

## 7. Push notifications

### 7.1. iOS — APNs via Expo

1. https://developer.apple.com → Keys → Create Key com **Apple Push
   Notifications service (APNs)**.
2. Baixe o `.p8`.
3. No EAS:
   ```bash
   npx eas-cli@latest credentials
   # → iOS → Push Notifications: Add a new key
   ```
   Ele guarda o `.p8` criptografado nos servers Expo.

### 7.2. Android — FCM

1. https://console.firebase.google.com → Criar projeto **vintage-br**.
2. Adicione um app Android com package `br.vintage.app`.
3. Baixe `google-services.json` e **coloque em `apps/mobile/`**, nunca
   commitando (já está no `.gitignore`).
4. Em **Project Settings → Cloud Messaging**, copie a **Server Key (legacy)
   OU Service Account (v1)** para o EAS:
   ```bash
   npx eas-cli@latest credentials
   # → Android → FCM V1 service account
   ```

### 7.3. Envio do servidor

Usamos o **Expo Push API** (apps/api → `push/` module). Tokens são salvos na
tabela `DeviceToken`. Crie a env `EXPO_ACCESS_TOKEN` no Fly para evitar
rate limit do endpoint anônimo.

### 7.4. Submissão automática nas lojas — EAS Submit (pendente)

`apps/mobile/eas.json` já tem o bloco `submit.production` mas os três
campos iOS estão em branco:

```json
"ios": {
  "appleId": "",
  "ascAppId": "",
  "appleTeamId": ""
}
```

Enquanto estiverem vazios, `eas submit --platform ios` falha sem prompt
interativo — não bloqueia build, bloqueia **apenas** a submissão
automática para o App Store Connect. Se o fluxo de release iOS hoje é
"build via EAS + upload manual pelo Transporter/Xcode", dá para ignorar.

Para habilitar submissão headless (ex.: em CI antes do primeiro
lançamento), preencher:

- `appleId` — email da conta Apple Developer (ex.: `ops@vintage.br`).
- `ascAppId` — App Store Connect App ID numérico. Encontrado em
  **App Store Connect → My Apps → Vintage.br → App Information →
  General → Apple ID**.
- `appleTeamId` — Apple Developer Team ID (10 chars, mesmo valor de
  `APPLE_TEAM_ID` da §5). **Developer Portal → Membership**.

Android já está com `./play-store-service-account.json` no mesmo
arquivo; gerar esse JSON seguindo
https://docs.expo.dev/submit/android/#creating-a-google-service-account-key.

> **Status**: deferido até o primeiro release iOS real. Ver PR
> `claude/codebase-audit-repair-6AucW` para contexto.

---

## 8. Busca — Meilisearch

Detalhado em `DEPLOYMENT.md` §3. Requer apenas:

- `MEILISEARCH_HOST`
- `MEILISEARCH_API_KEY` (master key — uso apenas server-side; gere uma
  Search Key específica para front-end se/quando implementarmos busca
  client-side).

---

## 9. Storage S3 — Cloudflare R2

Detalhado em `DEPLOYMENT.md` §4. Variáveis:

- `S3_ENDPOINT`
- `S3_REGION=auto`
- `S3_BUCKET=vintage-listings`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_PUBLIC_URL=https://cdn.vintage.br`
- `PRESIGNED_URL_EXPIRY=900`

---

## 10. DNS e CDN — Cloudflare

1. Crie conta em https://cloudflare.com, adicione `vintage.br`.
2. Aponte os nameservers do registro .br (registro.br) para os NS do
   Cloudflare.
3. Zona DNS:

   | Tipo  | Nome  | Valor                          | Proxy |
   |------|------|---------------------------------|-------|
   | A    | `@`   | → IP da Vercel                   | ✅     |
   | CNAME| `www` | `vintage.br`                    | ✅     |
   | CNAME| `api` | `vintage-api.fly.dev`           | ✅     |
   | CNAME| `cdn` | `<account>.r2.cloudflarestorage.com` | ✅ |
   | TXT  | `@`   | SPF + DMARC + DKIM Resend       | —     |

4. **SSL/TLS → Full (strict)**.
5. **Rules → Page Rules**:
   - `vintage.br/api/*` → Cache: Bypass.
   - `cdn.vintage.br/*` → Cache: Cache everything (Edge TTL 30 dias).
6. **WAF → Managed Rules**: ligar OWASP Core Ruleset.
7. **Bot Management → Super Bot Fight Mode** (plano Pro).

---

## 11. Monitoramento e observabilidade

### 11.1. Sentry

1. https://sentry.io → Create project `vintage-api` (platform Node.js).
2. Copie **DSN** → `SENTRY_DSN_API`.
3. Repita para `vintage-web` (Next.js) e `vintage-mobile` (React Native).
4. Configure `SENTRY_ENV=production` e `SENTRY_RELEASE=$(git rev-parse HEAD)`.

### 11.2. Logtail / Axiom (logs centralizados)

Opcional; útil para auditoria LGPD. Exporte logs estruturados JSON do Fly
via Log Shipping.

### 11.3. Uptime

- **Better Stack Uptime** (gratuito para 10 monitores):
  - `GET https://api.vintage.br/api/v1/health` a cada 1 min.
  - `GET https://vintage.br/` a cada 5 min.
- PagerDuty → Slack `#alerts`.

---

## 12. Fiscal e legal (Brasil)

### 12.1. CNPJ e MEI/ME/LTDA

- Para emitir nota fiscal de comissão, é necessário CNPJ.
- Categoria sugerida: **CNAE 6311-9/00 — Tratamento de dados, serviços de
  aplicações e outros serviços de informação**.

### 12.2. Emissão de Nota Fiscal de Serviço (NFS-e)

- Integração via **Focus NFe** (https://focusnfe.com.br) é a opção mais
  prática — ver `apps/api/src/notafiscal/` para o connector.
- Variáveis:
  - `FOCUS_NFE_TOKEN`
  - `FOCUS_NFE_COMPANY_ID`
- Em cada venda concluída, emitimos NFS-e de serviço (comissão) para o
  vendedor.

### 12.3. LGPD

- **DPO**: indique um responsável (pode ser o CTO). Email público:
  `dpo@vintage.br`.
- **Relatório de Impacto (RIPD)**: obrigatório; documente em
  `docs/lgpd/RIPD.md`.
- **Portal de direitos do titular**: já implementado em `/conta/privacidade`
  (acesso, retificação, exclusão).

### 12.4. Termo de Serviço e Política de Privacidade

- Mantidos em `https://vintage.br/termos` e `https://vintage.br/privacidade`.
- Versionados via `TOS_VERSION` (yyyy-mm-dd); sempre que mudar, o usuário
  precisa re-aceitar no próximo login (implementado em `auth.service.ts`).

---

## 13. Identidade + KYC (Tracks B e C)

### 13.1 Serpro Datavalid (Track B — primária)
- **Registro**: https://www.loja.serpro.gov.br/datavalid — CNPJ
  obrigatório. Onboarding oficial leva 6–12 semanas; iniciar
  IMEDIATAMENTE, em paralelo ao registro do CNPJ.
- **Produto**: Datavalid CPF — consulta autoritativa à Receita.
  Retorna situação cadastral + match de nome + match de DOB.
  Preço: R$0.06–0.25/consulta.
- **Env**:
  ```
  SERPRO_BASE_URL=<URL do contrato>
  SERPRO_TOKEN_PATH=/token
  SERPRO_VALIDATE_PATH=/datavalid/v3/validate
  SERPRO_CLIENT_ID=...
  SERPRO_CLIENT_SECRET=...
  IDENTITY_VERIFICATION_ENABLED=false   # true quando contrato ativo
  ```
- **Compliance**: Brazil→Brazil, sem transferência internacional.
  Incluir DPA no RIPD §4.2.

### 13.2 Caf (Track C — documento + liveness)
- **Registro**: https://combateafraude.com — 2–4 semanas.
- **Produto**: Selfie + RG/CNH com liveness. Escalonamento quando
  Serpro retorna NAME_MISMATCH / CPF_SUSPENDED. R$5–10/sessão.
- **Env**:
  ```
  CAF_BASE_URL=<URL do contrato>
  CAF_CREATE_SESSION_PATH=/v1/verifications
  CAF_API_KEY=...
  CAF_WEBHOOK_SECRET=...                # HMAC-SHA256, obrigatório
  WEBHOOK_BASE_URL=https://api.vintage.br
  IDENTITY_DOCUMENT_ENABLED=false       # true quando contrato ativo
  ```
- **Webhook**: Caf → `POST /webhooks/caf` (público, HMAC-verified,
  dedup via `ProcessedWebhook`). Em dev, expor via ngrok/cloudflared.
- **Compliance**: BR-HQ, ISO 27001 + SOC 2 Type II. RIPD §4.2 com
  base legal "legítimo interesse" + LIA (biometria = dado sensível).

### 13.3 Google Vision (moderação de imagens)
- Já integrado (`GOOGLE_VISION_API_KEY`) para autofill de listings.
  Commit 09cada2 adicionou `SAFE_SEARCH_DETECTION` à mesma chamada —
  sem custo adicional. Rejeita VERY_LIKELY; sinaliza LIKELY para o
  admin em `/admin/image-flags`.
- **Compliance**: Google Cloud EUA — transferência internacional
  requer TIA no RIPD §4.2.

### 13.4 Cloudflare Turnstile (captcha)
- **Registro**: https://dash.cloudflare.com → Turnstile. Grátis até
  1M verificações/mês.
- **Env**:
  ```
  TURNSTILE_SECRET_KEY=...              # backend
  CAPTCHA_ENFORCE=false                 # true quando mobile >=95% adoção
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=...    # web
  EXPO_PUBLIC_TURNSTILE_SITE_KEY=...    # mobile (WebView)
  ```

### 13.5 PostHog (analytics)
- **Registro**: https://app.posthog.com → EU region (LGPD).
  Grátis até 1M eventos/mês.
- **Env**:
  ```
  POSTHOG_API_KEY=phc_...               # backend
  POSTHOG_HOST=https://eu.i.posthog.com
  NEXT_PUBLIC_POSTHOG_KEY=phc_...       # web
  NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
  EXPO_PUBLIC_POSTHOG_KEY=phc_...       # mobile
  EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
  ```

---

## 14. Checklist final — antes do lançamento

- [ ] Mercado Pago em produção e webhook recebendo.
- [ ] Correios + Jadlog respondendo cálculos reais.
- [ ] Google OAuth aprovado para produção.
- [ ] Apple Sign In testado em device físico.
- [ ] Resend DKIM verificado.
- [ ] APNs e FCM configurados no EAS.
- [ ] Sentry capturando erros em staging.
- [ ] Uptime monitor ativo e alertando.
- [ ] CNPJ ativo e integrado ao Focus NFe.
- [ ] Política de privacidade aprovada pelo jurídico.
- [ ] 3 usuários beta completaram uma compra real.
- [ ] `npm audit --production` sem HIGH/CRITICAL.
- [ ] Serpro Datavalid: contrato, credenciais, smoke em staging.
- [ ] Caf: contrato, webhook secret, `/webhooks/caf` alcançável,
      smoke end-to-end.
- [ ] Google Vision: API key + teste de upload normal + borderline
      (ListingImageFlag criado).
- [ ] Turnstile: chaves nas 3 plataformas, `CAPTCHA_ENFORCE=false`
      até adoção mobile atingir limiar.
- [ ] PostHog: API keys nas 3 plataformas, evento `user_registered`
      no dashboard.
- [ ] Deep linking: `APPLE_TEAM_ID` + `ANDROID_CERT_SHA256` no host
      web; `/.well-known/*` retornando JSON válido.
