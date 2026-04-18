# Vintage.br — Launch Checklist

Single top-to-bottom list. Items are ordered roughly by time-to-launch.
Every box has to be ticked before the one below it. Reference docs in
the repo point to deep detail; this file is the checklist itself.

Legend: 🔴 blocks launch · 🟡 blocks payment flows only · ⚪ best-effort

---

## Part 1 — T-30 days · Corporate + external service accounts

### 1.1 Corporate registration 🔴
- [ ] CNPJ active (consult, não MEI — payment processors require this).
- [ ] Contrato social and quadro societário signed digitally (ICP-Brasil cert).
- [ ] Certificado digital A1 or A3 acquired for the CNPJ (needed for NF-e).
- [ ] Business bank account open (any bank; PIX must be enabled).

### 1.2 Domain + DNS 🔴
- [ ] Domain `vintage.br` (or chosen) registered and renewed 12+ months out.
- [ ] DNS zone in **Cloudflare** with:
  - [ ] `vintage.br` → web (Vercel apex alias)
  - [ ] `www.vintage.br` → web
  - [ ] `api.vintage.br` → Fly.io A + AAAA
  - [ ] SPF / DKIM / DMARC records for the email sending domain
- [ ] All records proxied (orange cloud) where CDN applies, **except** the
  API `A/AAAA` (direct to Fly so Cloudflare doesn't terminate JWT-carrying
  requests unexpectedly).

### 1.3 External service accounts 🔴
Follow [THIRD_PARTY_ONBOARDING.md](./THIRD_PARTY_ONBOARDING.md) for the
step-by-step. Check each item when the **production** credential is in
your Fly secrets store (not just in `.env.local`):

- [ ] **Mercado Pago** — CNPJ verified, PIX + card enabled, webhook secret
      set, production access token in `MERCADOPAGO_ACCESS_TOKEN`.
- [ ] **Mercado Pago Marketplace contract** 🟡 — split/payout contract
      submitted (1–2 weeks to activate). Until active, leave
      `MERCADOPAGO_PAYOUT_ENABLED=false` and ops reconciles manually via
      `/admin/payouts` (see DEPLOYMENT §8c).
- [ ] **Twilio** — account upgraded out of trial, BR phone number bought,
      `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` in
      secrets. Test SMS delivery to a real phone before launch.
- [ ] **NF-e provider** (Enotas / NFe.io / Focus NFe) — CNPJ integrated,
      digital certificate A1 uploaded, `NFE_API_KEY` + `NFE_API_URL` in
      secrets.
- [ ] **Correios** — contrato assinado, token in `CORREIOS_TOKEN`,
      origin CEP configured.
- [ ] **Jadlog / Kangu** (optional fallback) — credentials in secrets.
- [ ] **Cloudflare R2** — bucket `vintage-br-prod` created, access key in
      `S3_ACCESS_KEY` / `S3_SECRET_KEY`, `S3_ENDPOINT` set to R2 URL,
      `S3_BUCKET` set.
- [ ] **Resend / SMTP** — sender domain verified (SPF/DKIM/DMARC), API
      key in `SMTP_*` secrets.
- [ ] **Firebase** — Android project, `google-services.json` in
      `apps/mobile/` (gitignored), `FIREBASE_SERVICE_ACCOUNT_JSON` secret.
- [ ] **Google Sign-In** — OAuth client IDs for web + iOS + Android,
      consent screen published (not in testing).
- [ ] **Apple Sign-In** — app ID + service ID + key registered, domain
      association file served from `/.well-known/apple-app-site-association`.
- [ ] **Sentry** (or Rollbar) — project created, DSN in secrets, test
      event sent from staging.

### 1.4 Database + Redis + Search 🔴
- [ ] **Postgres** — Supabase (or equivalent) production project, daily
      backups on, point-in-time-recovery enabled, `DATABASE_URL` with SSL.
- [ ] **Redis** — Upstash (or equivalent) with TLS + password,
      `REDIS_URL` embedding credentials. **The API refuses to start in
      production without `REDIS_PASSWORD` or credentials in URL.**
- [ ] **Meilisearch** — managed instance, master key in
      `MEILI_MASTER_KEY`, indexes primed from `prisma/seed.ts`.

---

## Part 2 — T-7 days · Staging validation

### 2.1 Staging deployment dry-run 🔴
- [ ] Deploy the current main to a **staging** environment with
      production-like env (but staging MP sandbox credentials).
- [ ] Run the full end-to-end smoke test from
      [LOCAL_TEST_PLAN.md](./LOCAL_TEST_PLAN.md) against staging —
      every item ticked, including:
  - [ ] Email+password signup + login (§1)
  - [ ] Google OAuth signup (§2)
  - [ ] Apple OAuth signup on a physical iOS device (§2)
  - [ ] TOTP 2FA setup → logout → login challenge (§3)
  - [ ] SMS 2FA setup with a real phone number → login challenge (§4)
  - [ ] Create listing, buy listing, accept offer (§5–7)
  - [ ] Block user on seller page + unblock via `/conta/blocked-users` (§8)
  - [ ] Add CPF via `/conta/cpf`; verify uniform error on duplicate (§9)
  - [ ] Checkout PIX + wallet credit (§10)
  - [ ] Register a PIX key + request payout (§11)
  - [ ] Email change request + confirm + notify old email (§12)

### 2.2 Load test 🟡
- [ ] Run `wrk` / `k6` against staging at 10× expected launch-day peak:
  - [ ] `GET /listings` — 95p < 300 ms
  - [ ] `POST /auth/login` — 95p < 1 s (includes bcrypt)
  - [ ] `GET /users/me` — 95p < 150 ms
- [ ] Concurrent-withdraw race test: kick off 10 simultaneous
      `POST /wallet/payout` for R$80 each against a wallet with R$100.
      **Exactly one must succeed**; the rest return 400 "Saldo
      insuficiente". Balance ends at R$20, not negative.
- [ ] Concurrent SMS 2FA send test: 10 simultaneous logins for the
      same 2FA-SMS user. Only one SMS goes out; the rest return 429.

### 2.3 Security audit 🔴
- [ ] `./scripts/ci-parity.sh` green on main locally — exit 0 with
      `npm audit --audit-level=high`.
- [ ] Manual review of every secret in Fly — no `CHANGE_ME_IN_PRODUCTION`,
      no placeholder values, no dev-tier keys.
- [ ] HTTPS-only enforced (HSTS preload filed if possible).
- [ ] CORS origin is the exact production domain list; no `*`.
- [ ] Rate limits confirmed active (Redis-backed throttler per 3B) —
      check `redis.isAvailable()` logs at startup.
- [ ] CSRF middleware active on every mutating non-pre-auth endpoint.

### 2.4 Legal 🔴
- [ ] Terms of Service published at `/termos` — covers fees, returns,
      disputes, prohibited items, buyer/seller obligations.
- [ ] Privacy Policy at `/privacidade` — LGPD compliant, lists every
      data processor (MP, Twilio, Resend, Sentry, Firebase, etc.).
- [ ] Data Protection Officer (DPO) email published (LGPD requirement).
- [ ] Cookie banner with opt-in for non-essential cookies.
- [ ] Account-deletion flow tested end-to-end (LGPD + App Store / Play
      Store requirement). Confirm `PayoutMethod` PII is wiped on soft
      delete (Wave 2E fix).

### 2.5 Mobile app store submission 🔴
Following [STORE_SUBMISSION.md](./STORE_SUBMISSION.md):

- [ ] iOS — production build uploaded to App Store Connect, screenshots
      uploaded, privacy labels filled in, submitted for review.
      **Plan 2–3 day review window.**
- [ ] Android — production AAB uploaded to Play Console, rollout
      started at 0% (staged).
- [ ] Apple Sign-In capability checked on the app.
- [ ] Push notifications capability + APNs key linked in EAS.
- [ ] `google-services.json` in the Android build.

---

## Part 3 — T-1 day · Go/no-go

- [ ] Pager rotation set for the next 72 hours with two people covered.
- [ ] Incident response runbook reviewed (see `DEPLOYMENT.md §10`
      rollback procedure).
- [ ] Support team briefed on:
  - [ ] Session force-logout on deploy (DEPLOYMENT §8b) — **every
        existing user will be re-prompted to sign in once**.
  - [ ] `cpfVerified` gate on withdrawals (DEPLOYMENT §8c) — sellers
        must upload a doc at `/conta/verificacao` and wait for admin
        approval.
  - [ ] `MERCADOPAGO_PAYOUT_ENABLED=false` for launch — ops reconciles
        payouts manually via `/admin/payouts`.
- [ ] Admin verification queue owner assigned (doc review throughput:
      budget 5× normal for launch week).
- [ ] 🔴 First production admin user promoted via the one-shot CLI:
      the chosen operator signs up through the normal flow, then ops
      runs from the API server (or locally with prod `DATABASE_URL`):
      ```bash
      npm run admin:promote -- ops@vintage.br --workspace @vintage/api
      ```
      (The `prisma/seed.ts` script refuses to run with
      `NODE_ENV=production` — it creates a known-password admin for
      local dev only.)
- [ ] Communications drafted:
  - [ ] In-app banner: "Confirme seu acesso — você pode ser solicitado
        a entrar novamente após nossa atualização".
  - [ ] Email to beta users announcing go-live + expectation to re-login.
  - [ ] Social post / press release on launch hour.

---

## Part 4 — Launch day · Sequence

Run in order. Do not skip ahead.

1. [ ] 🔴 Final `./scripts/ci-parity.sh` on the deploy commit — exit 0.
2. [ ] 🔴 Database migration dry-run against a staging clone of the
      prod DB, then on prod itself. Check no failing migrations.
3. [ ] 🔴 Deploy API to Fly (`fly deploy`). Confirm startup logs show:
      - Redis connected
      - Every required secret present (no `CHANGE_ME` warnings)
      - All modules loaded
4. [ ] 🔴 Deploy web to Vercel (production branch promote).
5. [ ] 🟡 Promote mobile builds: iOS "Release to App Store", Android
      "Promote to production" (start with 10% rollout).
6. [ ] 🔴 Point DNS to production. Verify `dig +short api.vintage.br`
      and `dig +short vintage.br` resolve to the right targets.
7. [ ] 🔴 Smoke-test production by repeating §2.1 — but live, not
      staging — minimum: signup, login, browse, listing create, checkout
      (with a real R$1 PIX you refund). If any step fails, **rollback
      per DEPLOYMENT §10**.
8. [ ] Send launch comms (email, social, in-app banner).
9. [ ] Announce internal pager rotation started.

---

## Part 5 — Post-launch · Day 0–7

### 5.1 Monitoring cadence
- [ ] Sentry reviewed every 4 hours for the first 24h, then daily.
- [ ] Admin `/admin/disputes` reviewed twice daily; SLA is 2 days.
- [ ] Admin `/admin/authenticity` reviewed daily.
- [ ] Admin `/admin/payouts` reviewed daily while
      `MERCADOPAGO_PAYOUT_ENABLED=false`.
- [ ] Admin `/admin/verification` (CPF/identity uploads) reviewed at
      least twice daily for week 1 — launch-day sellers can't withdraw
      until they're approved.

### 5.2 Operational watch items
- [ ] Watch NFe poll-cron logs (`notafiscal.service.ts pollPendingNFeStatus`)
      — flag if the PENDING backlog grows past 100.
- [ ] Watch Twilio cost dashboard — SMS 2FA sends should be < 3× DAU.
      Anomaly = potential abuse despite per-user rate limit.
- [ ] Watch Mercado Pago webhook logs — every `payment.approved` should
      map to a confirmed order in our DB within 30 seconds.
- [ ] Watch Redis memory — throttler keys + SMS OTP hashes + CSRF
      tokens add up; expected < 50 MB at 10k DAU.

### 5.3 Comms follow-up
- [ ] Day 1 post-launch email thanking early users.
- [ ] Day 3: first-purchase report to internal channel.
- [ ] Week 1: summary — DAU, GMV, withdrawal queue depth, Sentry rate.

---

## Part 6 — Post-launch · Week 2–4

### 6.1 MP Marketplace contract activation
- [ ] Confirm MP approved the Marketplace contract.
- [ ] In staging: `fly secrets set MERCADOPAGO_PAYOUT_ENABLED=true`,
      run a real R$1 payout end-to-end, verify the webhook promotes
      the `PayoutRequest` from `PROCESSING` → `COMPLETED`.
- [ ] In production: same flip. Announce to sellers: "PIX payouts are
      now automatic; manual queue retired".
- [ ] Drain the remaining `PENDING` queue manually one more pass.

### 6.2 Tighten and sweep
- [ ] Review the PENDING payout backlog. Any rows > 48 hours old without
      MP `externalId` → admin `FAILED` with a clear reason + refund.
- [ ] Review open disputes. Any > 5 days should have been force-closed
      by admin by now.
- [ ] Check the NFe `pollPendingNFeStatus` cron hit rate. Tune
      `take:` from 25 back up to 50 if provider rate-limit headroom
      allows (per `notafiscal.service.ts` comment).

### 6.3 Dependency hygiene
- [ ] Run `npm audit --audit-level=moderate`. Triage the 3 moderate
      findings tracked in
      [DEPENDENCY_UPGRADE_PLAN.md](./DEPENDENCY_UPGRADE_PLAN.md).
- [ ] One PR per upgrade. Every PR runs `./scripts/ci-parity.sh`
      before merge.

---

## Part 7 — Ongoing operational cadence

### Daily
- [ ] `/admin/disputes`, `/admin/authenticity`, `/admin/payouts` queues
      reviewed.
- [ ] Sentry digest email scanned.
- [ ] Uptime monitors (health check `GET /api/v1/health` + web TTFB) green.

### Weekly
- [ ] Redis / Postgres disk usage trend.
- [ ] Support queue aging report.
- [ ] `npm audit` — flag any new `high`.
- [ ] Cloudflare WAF events review.

### Monthly
- [ ] Backup restore drill — pick last night's Postgres snapshot, restore
      into staging, run the smoke test.
- [ ] Rotate any secrets due: JWT_SECRET, CSRF_SECRET (every 90 days).
- [ ] Certificate expiry review (domain, NF-e A1, Apple APNs).
- [ ] Dependency upgrade PR (if any P0/P1 backlog in the upgrade plan).
- [ ] LGPD — review data-deletion requests served within the month.

### Quarterly
- [ ] Full security audit — external scan (OWASP ZAP or similar) + code
      review of newly added modules.
- [ ] Load test against current traffic × 5.
- [ ] Review feature flags — retire flags older than 6 months.
- [ ] SOC-2 / LGPD attestation refresh if required by customers.

---

## Roll-up of existing reference docs

| Need | Doc |
|---|---|
| Setup external accounts | [THIRD_PARTY_ONBOARDING.md](./THIRD_PARTY_ONBOARDING.md) |
| Deploy procedure | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| End-to-end smoke test | [LOCAL_TEST_PLAN.md](./LOCAL_TEST_PLAN.md) |
| App Store / Play Store submission | [STORE_SUBMISSION.md](./STORE_SUBMISSION.md) |
| Post-launch dep upgrade queue | [DEPENDENCY_UPGRADE_PLAN.md](./DEPENDENCY_UPGRADE_PLAN.md) |
| Pre-push gate (every commit) | [CLAUDE.md § MANDATORY: Pre-Push Gate](./CLAUDE.md) |
| Business plan / company setup | [PLAN.md](./PLAN.md) |

---

## Maintaining this list

After every wave of changes that adds a new external service, schema
migration, or operational concern, **amend this file in the same PR**.
The launch list is only useful if it reflects the code actually shipping.
