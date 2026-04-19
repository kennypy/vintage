# Local testing runbook

Fresh-clone → green end-to-end smoke test on a single laptop. Every
command below is meant to run from the **repo root** unless stated
otherwise.

If anything in this doc is wrong, fix the doc, not your setup. This
file is the contract between the codebase and a new developer's first
30 minutes.

## 1. Prerequisites

Host software:

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.x LTS | Newer may work; 20 is what CI pins |
| npm | 10.x | Bundled with Node 20 |
| Docker + Docker Compose | latest | For Postgres, Redis, Meilisearch |
| Expo Go (mobile) | latest from App Store / Play Store | Only needed to test on a physical phone |

You do **not** need:
- A global `prisma` install — the project uses `npx prisma`.
- A global `expo` install — the project uses `npx expo`.
- Postgres / Redis / Meilisearch installed natively — Docker handles all three.

## 2. Environment files

Each app has its own `.env` — the repo keeps `.env.example` files as
the source of truth. Copy each and fill in the values listed below.

```bash
cp apps/api/.env.example     apps/api/.env
cp apps/web/.env.example     apps/web/.env.local
cp apps/mobile/.env.example  apps/mobile/.env
```

### `apps/api/.env` — what to edit

For local dev, the defaults work for almost everything. The only
things you **must** set:

| Variable | Why | Value |
|---|---|---|
| `JWT_SECRET` | Startup fails otherwise | `openssl rand -hex 32` |
| `CSRF_SECRET` | Startup fails otherwise | `openssl rand -hex 32` |

Everything else can stay at its example default. Features whose env
vars are blank degrade gracefully to no-ops (Vision, PostHog,
Turnstile, Twilio, Firebase, NF-e, Mercado Pago, Google OAuth, Apple
OAuth, **Serpro Datavalid**, **Caf**) — you'll see a warning at
startup per missing integration and the feature will silently skip.

**Feature flags worth knowing about** (all default off — flip only
when you're ready to test the flow end-to-end):

- `CAPTCHA_ENFORCE` — on, all register/forgot-password/SMS-resend
  calls require a Turnstile `captchaToken`. Mobile + web already
  send it; only flip on after provisioning `TURNSTILE_SECRET_KEY`.
- `IDENTITY_VERIFICATION_ENABLED` — on, `/users/me/verify-identity`
  calls Serpro. Requires `SERPRO_CLIENT_ID` + `SERPRO_CLIENT_SECRET`.
- `IDENTITY_DOCUMENT_ENABLED` — on, `/users/me/verify-identity-
  document` opens a Caf session. Requires `CAF_API_KEY`,
  `CAF_WEBHOOK_SECRET`, `WEBHOOK_BASE_URL` (dev tip: use a
  cloudflared/ngrok tunnel so Caf's webhook can reach you).
- `MERCADOPAGO_PAYOUT_ENABLED` — on, payouts actually call MP.
  Leave off until the Marketplace contract is active; ops
  processes PIX out-of-band in the meantime.

**Cloudflare R2** (optional, for image upload testing):

```env
S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
S3_REGION="auto"          # R2 requires 'auto' — service warns if not
S3_ACCESS_KEY="<from R2 API token>"
S3_SECRET_KEY="<from R2 API token>"
S3_BUCKET="<your bucket name>"
```

When creating the R2 API token, grant it **Object Read & Write** on
the specific bucket. Also set CORS on the bucket in the Cloudflare
dashboard to allow `http://localhost:3000` for dev + your production
origin for prod.

### `apps/web/.env.local` — what to edit

Defaults are fine for local dev. You only need to touch this file if
you want to test Turnstile (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) or
client-side PostHog (`NEXT_PUBLIC_POSTHOG_KEY`).

### `apps/mobile/.env` — what to edit

```bash
# Find your LAN IP:
#   macOS/Linux:  ifconfig | grep "inet " | grep -v 127.0.0.1
#   Windows:      ipconfig | findstr /i "IPv4"
```

Set `EXPO_PUBLIC_API_URL` to `http://<LAN_IP>:3001/api/v1` so your
phone on Expo Go can reach the API. `localhost` doesn't resolve on a
physical device.

## 3. Docker infrastructure

```bash
# Start Postgres (5434), Redis (6380), Meilisearch (7700)
docker compose up -d

# Confirm all three are healthy
docker compose ps
```

Expected: three services, all `healthy`. If Redis fails to start,
check that `REDIS_PASSWORD` (from `.env.docker` or your shell env) is
set — the compose file refuses to run Redis without one.

## 4. Install + migrate + seed

```bash
# Install all workspaces from lockfile (NEVER `npm install` — CI uses
# `npm ci` and needs the lockfile to stay stable)
npm ci

# Generate Prisma client — do this after ANY schema.prisma edit
cd apps/api && npx prisma generate && cd ../..

# Apply migrations to the local database
cd apps/api && npx prisma migrate deploy && cd ../..

# Seed dev-only data (categories, brands, a known admin user).
# Refuses to run with NODE_ENV=production — that's intentional.
cd apps/api && npx ts-node prisma/seed.ts && cd ../..
```

## 5. Run the three apps

Open three terminals.

```bash
# Terminal 1 — API on :3001
cd apps/api && npm run dev

# Terminal 2 — Web on :3000
cd apps/web && npm run dev

# Terminal 3 — Mobile via Expo
cd apps/mobile && npx expo start
# Scan the QR code with Expo Go (iOS/Android).
# Or press 'w' in the Expo CLI for the web preview.
```

Healthy boot indicators:

- API: logs `Application is running on: http://[::1]:3001` plus one
  `warn` line per unconfigured integration (Twilio, PostHog, Vision,
  Turnstile, etc. — expected in dev).
- Web: `✓ Ready in …ms`.
- Expo: `Metro waiting on exp://<LAN_IP>:8081`.

## 6. End-to-end smoke test

The reference scenario: two users, one listing, one order, escrow
release. Do it on **web** first (faster feedback), then repeat on
mobile once web is clean.

### Seed two test users

The seed script creates `admin@vintage.br` (password `admin123`). For
the two-user scenario you'll register them through the UI below.

### Register the buyer

1. `http://localhost:3000/auth/register`
2. Email: `buyer@local.test`, CPF: `529.982.247-25` (Modulo-11 valid),
   password: anything ≥8 chars.
3. You should be logged in and redirected to the feed.

### Register the seller (new incognito window)

1. Email: `seller@local.test`, CPF: `111.444.777-35`.
2. Logged in.

### Seller creates a listing

1. Seller window → top-right → "Vender" / `/sell`.
2. Upload 1-3 images.  If R2 isn't configured, the dev path returns a
   `picsum.photos` placeholder URL — you'll see the placeholder on the
   listing detail page. Expected.
3. Fill title, description, R$ 100.00, category, condition.
4. Submit. Listing is ACTIVE.

### Buyer finds and buys the listing

1. Buyer window → search for the listing title.
2. Open detail → "Comprar agora" → address → PIX.
3. Back end creates the order (PENDING), the listing flips to SOLD,
   and the buyer sees a PIX copy-paste payload (mocked when
   `MERCADOPAGO_ACCESS_TOKEN` is blank — the order stays PENDING
   forever in dev without a real MP webhook).

### Simulate the payment webhook (dev only)

Because there's no real MP traffic in dev, trigger the
`processApprovedPayment` path manually:

```bash
# psql into the dev DB
docker compose exec postgres psql -U vintage -d vintage_dev

# Inside psql:
UPDATE "Order" SET status = 'PAID' WHERE id = '<order id from the URL>';
-- Then, in your API terminal, the wallet escrow won't auto-hold because
-- we skipped the webhook. For a full escrow simulation, hit the webhook
-- directly with a signed payload — or just use this UPDATE as a stub.
```

### Mark shipped / delivered / release

Seller window: "Meus pedidos" → "Marcar como enviado" (fill a fake
tracking code, any carrier).

Buyer window: "Meus pedidos" → "Marcar como recebido" → release escrow.

Verify on seller's wallet: the item price has moved from `pendingBrl`
to `balanceBrl`, a `walletTransaction` row of type `ESCROW_RELEASE`
exists, and the order is `COMPLETED`.

## 7. Integration verification checklist

Run through these after the smoke test. Each is a one-line check.

### Meilisearch

End-to-end indexing smoke test. Run this after creating the seller's
listing in the smoke scenario (step 7-8 of §6).

1. **Is the daemon reachable?**
   ```bash
   curl -s http://localhost:7700/health
   # → {"status":"available"}
   ```

2. **Does the `listings` index exist and respond to auth?**
   ```bash
   curl -sH "Authorization: Bearer vintage_dev_key" \
     "http://localhost:7700/indexes/listings/settings" | head -30
   ```
   Expected: a JSON blob showing `searchableAttributes`
   (title, description, category, brand, color, size),
   `filterableAttributes`, `sortableAttributes`. If 401/403,
   the Meilisearch key in `apps/api/.env` doesn't match the
   one the container was started with.

3. **Is the listing you created indexed?**
   ```bash
   curl -sH "Authorization: Bearer vintage_dev_key" \
     "http://localhost:7700/indexes/listings/documents?limit=5" | head
   ```
   Should return the listing as a JSON array. If empty, the
   server-side sync in `listings.service.ts::syncSearchIndex`
   logged a warning — check the API terminal.

4. **Does search actually return it?**
   ```bash
   curl -sH "Authorization: Bearer vintage_dev_key" \
     -X POST http://localhost:7700/indexes/listings/search \
     -H 'Content-Type: application/json' \
     -d '{"q":"<first word of listing title>"}'
   ```
   Expected: `hits` contains the listing.

5. **Lifecycle check (most fragile part of the sync).**
   - Edit the listing's title in the web UI. Step 4 should now
     return it under the new title within a few seconds.
   - Mark the listing as SOLD (place an order against it). Step 3
     should stop returning it — only ACTIVE listings live in the
     index (see `listings.service.ts::syncSearchIndex` contract).

6. **Recovery from drift.** If the index doesn't match Postgres —
   e.g. Meilisearch was down when a sync fired — full rebuild:
   ```bash
   cd apps/api && npm run search:reindex
   ```
   The script keyset-paginates every ACTIVE listing and batches
   writes to Meilisearch. Idempotent; safe to re-run.

### Google Vision (image moderation)

Only runs when `GOOGLE_VISION_API_KEY` is set. With a key:

1. Upload a standard product photo — API logs
   `Labels: …` and `safeSearchAnnotation` fields inside the service,
   upload succeeds.
2. Upload an obviously explicit image — API returns 400 with
   "rejeitada pela moderação automática" and no S3 write happens.

### PostHog (server-side analytics)

`POSTHOG_API_KEY` set → register a user, then check the PostHog
dashboard under Events. You should see `user_registered` within ~10s
(flush interval).

### Turnstile

Web: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set → register page shows the
widget. Flip `CAPTCHA_ENFORCE=true` on the API, try to register
without solving — API returns 403. Solve the widget → register
succeeds.

Mobile: see apps/mobile/src/components/TurnstileWidget.tsx — renders
a WebView. Same flip behaviour.

### R2 upload

```bash
# With S3_ENDPOINT pointing at R2:
# Upload a listing image through the web UI.
# Then:
aws s3 --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com ls s3://<BUCKET>/listings/
```

Should show your uploaded key. If the upload 403s, check that the R2
API token has Object Read & Write on that bucket and `S3_REGION=auto`.

### Twilio (SMS 2FA)

Without Twilio creds, the SMS code is logged to the API stdout
instead of sent. Look for `[DEV] SMS to +55...: 123456` in the API
log. Enable SMS 2FA in Settings → you'll see the code in the API
terminal and can paste it into the UI.

## 8. Running CI locally

Before every push, run:

```bash
./scripts/ci-parity.sh
```

This nukes every cache, runs `npm ci`, regenerates Prisma, lints,
type-checks, runs tests, builds both apps, and runs `npm audit
--audit-level=high`. Exit 0 = safe to push.

If you only changed a few files and want a faster loop:

```bash
./scripts/ci-parity.sh --fast
```

`--fast` keeps `node_modules` but still clears turbo caches and
`.next`. NEVER trust `--fast` as the pre-push gate — CI doesn't have
a fast mode.

## 9. Troubleshooting

| Symptom | Usual cause | Fix |
|---|---|---|
| `Cannot find module '@prisma/client'` | Prisma not generated | `cd apps/api && npx prisma generate` |
| `Cannot find module '@vintage/shared'` | shared package not built | `npx turbo build --filter=@vintage/shared` |
| Expo Go: "Something went wrong" | API URL points at localhost | Set `EXPO_PUBLIC_API_URL` to your LAN IP |
| Web "Connection refused" on API calls | API not running on :3001 | Start the API terminal |
| `ECONNREFUSED 127.0.0.1:5434` | Docker Postgres not started | `docker compose up -d` |
| Prisma migrate says "drift detected" | Schema edited without migrating | `npx prisma migrate dev --name describe_change` |
| ESLint "Definition for rule not found" | Suppressed a rule the config doesn't register | Remove the suppression or register the plugin |
| CI green locally, red on CI | Cached turbo result / stale Prisma / fast-mode parity | Full `./scripts/ci-parity.sh` (no `--fast`) |

## 10. What's intentionally deferred in dev

These features need real credentials and are skipped locally — none
of them break the core flows:

- **Mercado Pago PIX payments** — without `MERCADOPAGO_ACCESS_TOKEN`,
  payment creation returns a mock payload and the order stays PENDING
  until you flip it to PAID in the DB.
- **NF-e issuance** — without `NFE_API_KEY`, the NFe row is created
  locally but never transmitted.
- **Push notifications** — without `FIREBASE_SERVICE_ACCOUNT_JSON`,
  push calls log and skip.
- **Correios tracking** — `CORREIOS_TOKEN` unset → mock tracking
  events. The `TrackingPollerService` cron will still run, but it
  won't detect real deliveries.
- **Apple Sign In** — requires a paid Apple Developer account.

Everything else (auth, listings, orders, wallet, disputes, escrow,
fraud rules, moderation, search, RIPD scaffolding) works end-to-end
on a bare laptop.
