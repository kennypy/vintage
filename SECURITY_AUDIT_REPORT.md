# Pre-launch Security Audit Report

**Branch:** `claude/security-audit-codebase-ZrcbJ`
**Audit date:** 2026-04-19
**Scope:** Full repo — API (apps/api), web (apps/web), mobile (apps/mobile), infra, deps.
**CI gate:** All 11 commits land with `./scripts/ci-parity.sh` 9/9 green.

This report is the launch-readiness output of a baby-step, line-by-line security review of the Vintage.br codebase. Each commit corresponds to one module's findings and contains the fix + tests; the commits are individually reviewable.

---

## Posture changes shipped (11 commits)

| # | Module | Top finding fixed | Severity |
|---|--------|---|---|
| 1 | Core infra (`main.ts`, `prisma`, `csrf`, `redis`) | `trust proxy` set, Postgres SSL hard-required in prod, CSRF dev-secret literal removed (per-process random instead), CSRF refuses to start in non-dev without secret, Redis `setNx` fails closed in prod | HIGH |
| 2 | Auth | Apple identity-token verification rewrites: full JWKS RS256 signature check, pinned issuer, strict aud, refuses if APPLE_CLIENT_ID unset (was silently skipping every check). OAuth silent-merge refusal — closes the email-takeover path. Login: per-email progressive lockout (10/h → 30 min lock), CaptchaGuard, dedicated 10/15min throttle, timing-constant bcrypt against a dummy hash for unknown emails, X-Forwarded-For removed. Google `verifyIdToken` gains 3s AbortController timeout + email_verified check + refuses without GOOGLE_CLIENT_ID. New `/auth/link-social` authenticated, password-gated link flow. | **CRITICAL** |
| 3 | Email verification | New `EmailVerificationToken` model + migration backfilling existing users to `emailVerifiedAt = createdAt`. `register()` overwrites unverified squatters so the real email owner can claim. `login()` refuses unverified password accounts. New `/auth/request-email-verification` (rate-limited per-user) + `/auth/verify-email` (single-use, bumps tokenVersion). OAuth signups eagerly set `emailVerifiedAt`. Web `/auth/verify-email` page consumes the deep-link token. | HIGH |
| 4 | Web cookie migration | JWT moved to HttpOnly + Secure + SameSite=Strict cookies. New `cookie.constants.ts` module. `jwt.strategy` accepts cookie OR Authorization header (mobile unaffected). New `/auth/logout` clears cookies. Web client uses `credentials: 'include'`, drops `Authorization` header, scrubs leftover localStorage. Admin layout no longer decodes JWT client-side; calls `/users/me` via cookie. | HIGH |
| 5 | Uploads + moderation | DELETE `/uploads/:key` ownership check by prefix (avatars/listings/videos) — closes a destructive IDOR. `uploadAvatar` ties the new key to `User.avatarUrl` atomically. `uploadListingVideo` plumbs `userId` for future ownership-tracked deletes. ModerationController writes the real admin id on every audit row (was hardcoded `'admin'`). Vision API key moves from `?key=` query string to `X-goog-api-key` header. | HIGH |
| 6 | Payments | **Webhook HMAC now verified against the raw bytes**, not `JSON.stringify(parsed)`. `main.ts` opts into NestFactory `rawBody`. Service refuses if rawBody is missing (defence in depth). Float epsilon amount comparison replaced with integer-centavo equality. Card installment math switched to integer centavos. Removed dev fail-open in `verifyWebhookSignature` — empty secret now rejects in every environment. | **CRITICAL** |
| 7 | Identity + fraud | Production-only assertion that `WEBHOOK_BASE_URL` is https + non-private — closes a SSRF vector that could let a poisoned env redirect Caf KYC webhooks at internal services. Fraud scoring no longer writes `NaN` into evidence JSON when `accountAgeDays` / `payoutMethodAgeMinutes` overflows. | MEDIUM |
| 8 | Commerce | `POST /shipping/label` now resolves the order and refuses unless caller is the seller (was a HIGH IDOR letting any user burn the seller's carrier credits). `markDelivered` requires buyer or seller; tracking-poller cron uses a separate `markDeliveredInternal(id, null)` for system calls. Offer expiry boundary tightened from `<` to `<=`. | HIGH |
| 9 | Users + LGPD | `ConsentRecord.deleteMany` runs inside the same `$transaction` that anonymises the User row — closes an LGPD-erasure gap where consent evidence kept pointing at the deleted user. Admin `/admin/users` search emits a privacy-audit log line for every query containing `@`. | MEDIUM |
| 10 | Misc API modules | `GET /feature-flags` projects to `{key, enabled}` only (was leaking internal description / metadata / updatedAt — planned-feature reconnaissance surface). Coupon `/validate` gets a 20/15min throttle (brute-force resistance). Ads bot-detection IP via `req.ip` instead of raw X-Forwarded-For. NF-e `calculateTax` rejects non-UF strings + non-finite prices at the boundary. Promotions balance check uses integer centavos. | HIGH |
| 11 | Web + mobile | Checkout page validates URL search params against shape regexes + image-host allowlist before rendering. CSP `img-src` no longer permits `blob:`. Mobile API client throws at module-load if production build somehow ships an `http://` API URL. | MEDIUM |

---

## Audit-clean modules (no fix commit needed)

| Module | Strengths confirmed |
|---|---|
| Comms (email, SMS, notifications, messages gateway, push) | `escapeHtml` on every user-supplied template value, `crypto.randomInt` OTPs (single-use via atomic GETDEL, timing-safe compare), Twilio creds never logged, Firebase service account parsed safely, WebSocket gateway JWT-validated on connect + participant-checked on join. |
| Identity webhooks | Caf HMAC-SHA256 with constant-time comparison, replay-protected via ProcessedWebhook dedup, secrets never logged, transactional `cpfIdentityVerified` flip. |
| Payments idempotency | `ProcessedWebhook` UNIQUE constraint dedupes redeliveries, atomic order/wallet update inside `$transaction`, race-safe wallet debit via conditional `updateMany`. |
| Deployment & infra | Production startup fails on missing critical secrets, Postgres SSL enforced, health endpoint returns no internal state, CI runs `npm audit --audit-level=high` and `--fast`-resistant cache nuke, .gitignore covers all `.env*` patterns, fly.toml binds DB/Redis to loopback only. |

---

## Deferred items (not launch-blocking — tracked separately)

These were flagged as MEDIUM or LOW and left for a follow-up because they require schema changes, product decisions, or operational coordination beyond a code patch:

| Area | Item | Why deferred |
|---|---|---|
| Wallet | `payoutMethod.deleteMany` during account deletion has no audit log row | Needs a new `PayoutMethodAuditLog` table; not LGPD-compliance critical (the keys themselves are gone, just the deletion event isn't recorded). |
| Data export | `/users/me/data-export` includes message rows where the other party may be a deleted user; identity could be reconstructed | Needs anonymisation logic + a companion `consentRecords` export field; non-trivial schema/DTO work. |
| Reports | Per-listing rate limit (DoS via spam reports from multiple accounts) | Product decision on threshold; current 24h dedupe + admin queue is the launch-day mitigation. |
| Reviews | Per-user review rate limit | Same — needs product-level thresholds. |
| Authenticity | Proof image URL must be a presigned URL into our S3 bucket (not arbitrary) | Schema-level validation — would require migrating existing rows. |
| Web | `conta` layout flicker between presence-marker check and API redirect | Needs a server component wrapper; cookie migration changed the available primitives. |
| Mobile | Autofill attributes on a couple of password fields | Cosmetic correctness; dev-only logs already stripped by `__DEV__`. |
| Mobile | EAS staging shares production database | Operational decision; consider separate staging DB or strict feature-flag gating. |

---

## Open dependency CVEs

`npm audit --audit-level=high` (the CI gate) is **green**.

| Severity | Count | Action |
|---|---|---|
| critical | 0 | — |
| high | 0 | — |
| moderate | 3 | Investigate post-launch — all are transitive (`@hono/node-server` slash bypass, `firebase-admin → google-gax`, `firebase-admin → @google-cloud/storage`). None ship in our public attack surface. |
| low | 11 | Dependabot will surface these as upgrades land. |

---

## Operational checklist (set these before flipping the prod switch)

These are env / config items the code now requires; setting them is part of going live:

1. **`TRUSTED_PROXY_HOPS=1`** (Fly.io single proxy). Set to `2` if Cloudflare is in front.
2. **`COOKIE_DOMAIN`** — leave blank unless web and API are on the same registrable domain and you want the cookie shared across subdomains (`.vintage.br`).
3. **`MERCADOPAGO_WEBHOOK_SECRET`** — must be set in *every* environment (dev included). The dev fail-open path is gone; set a known fixture value (e.g. `test-secret-dev`) for local dev so signed fixture payloads verify.
4. **`APPLE_CLIENT_ID`** — required if Apple Sign In is exposed; verification refuses to run without it. Android-only launch may leave it unset (Apple endpoint will return 500 with a clear ops message).
5. **`GOOGLE_CLIENT_ID`** — required if Google Sign In is exposed.
6. **`WEBHOOK_BASE_URL`** — production must be `https://api.vintage.br` (or your real public origin); private/localhost values are refused at boot in production.
7. **`CAPTCHA_ENFORCE=true`** — flip on once mobile + web releases that send `captchaToken` are >=95% of traffic. The DTOs accept the field today; flipping the flag enables enforcement.
8. **`DATABASE_URL`** — must include `?sslmode=require` (or stricter) in production. Boot fails otherwise.
9. **`DATABASE_POOL_MAX`** × api_instances must stay below your Postgres `max_connections` (Supabase free = 60).
10. **Privacy-audit log forwarding** — admin email-substring searches now emit `[privacy-audit]` log lines; ensure they're shipped to your SIEM / alerting pipeline so a compromised admin can't silently bulk-enumerate.
11. **Swagger `/docs` must 404 in production.** Code gates the mount on `NODE_ENV !== 'production'` (see `apps/api/src/main.ts`); the pre-launch smoke test is `curl -sS -o /dev/null -w "%{http_code}\n" https://api.vintage.br/docs` → expect `404`. Any other response means `NODE_ENV` is wrong in Fly and the OpenAPI schema (including every route + DTO shape) is being served publicly.
12. **`ALLOWED_IMAGE_HOSTS`** — comma-separated allowlist of hostnames that may appear in listing photos + authenticity proof URLs. Auto-includes the configured `S3_BUCKET`+`S3_REGION` virtual-hosted and path-style hostnames. Add your CDN host here when you put one in front of S3; if you leave it blank in prod the service falls back to defaults that include `picsum.photos` (dev placeholder), which is wrong for a production deploy.

---

## What the audit specifically did NOT cover

- Performance / load testing (out of scope).
- Penetration testing of the deployed environment (next phase).
- Mobile app store policy review (covered by `STORE_SUBMISSION.md`).
- LGPD legal review (covered by `docs/privacy/`).
- Receita Federal / NF-e contractual compliance (vendor-side).
