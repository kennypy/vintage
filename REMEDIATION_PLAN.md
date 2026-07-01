# Vintage.br — Launch Remediation Tracker

> Source: external red-team pre-launch readiness review (2026). This file turns that
> review into a **sequenced, dependency-aware, owner-assigned tracker**. It is the single
> source of truth for "what's left before we can take real money." Check items off (`[x]`)
> as they land. When a code item ships, link the PR next to it.
>
> **This is not a list of failures.** Almost every item is one of two kinds:
> (a) *connect the real vendor* to code that already exists behind a mock/flag, or
> (b) *register the legal entity*. That is exactly where an 8-month build is supposed to be
> at pre-launch. The review cites our own file paths and line numbers because the logic is
> all there and reviewable.

---

## Legend

| Symbol | Owner | Meaning |
|---|---|---|
| 🧑 | **Founder** | Business / legal / procurement / a decision only you can make. Claude cannot do these. |
| 🤖 | **Claude** | Code change I can make now, in-repo, no external dependency. |
| 🏢 | **Vendor-blocked** | Code is ready or scaffoldable, but flipping it on needs credentials/contract with an external lead time. |

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped (with reason)

---

## The one decision that gates everything: §0

**Nothing in the payment/wallet/payout surface should be touched until §0 is decided.**
Whether `sendPixPayout` is deleted vs. replaced, whether `apps/api/src/wallet/` custody
survives, and half the escrow flow all hang off this. Decide it first.

```
§0  Money architecture (🧑 DECISION)
 │
 ├─ Option A: PSP-custody split (MP Marketplace / Pagar.me / Asaas) — RECOMMENDED
 │    → funds never on our books, PSP does seller KYC (may DELETE §4 entirely)
 │    → §1 deletes sendPixPayout, wallet becomes audit-only
 │
 └─ Option B: keep internal ledger
      → payments lawyer, BACEN Res. 80/2021, AML/COAF, capital reqs. Months. Not recommended.

§0 unblocks → §1 (payout code) → §7 split-rule math → §10 payment integration tests
§0 (if Option A) → may DELETE → §4 (Serpro/CAF KYC)  ← check before signing those contracts
```

---

## Critical path (longest lead times — start the 🧑/🏢 items TODAY, in parallel with code)

These have multi-week external lead times. Kicking them off is more urgent than any code fix,
because code merges in hours and contracts take weeks.

| Lead time | Item | Owner | Blocks |
|---|---|---|---|
| Decide now | §0 money architecture ADR | 🧑 | §1, §7 split math, §10 |
| 1–3 wk | §3 CNPJ (sociedade limitada, **not** MEI) | 🧑 | MP prod, Correios, NF-e, registro.br-as-company |
| 6–12 wk | §4 Serpro Datavalid contract | 🧑🏢 | withdrawals (unless §0-A deletes it) |
| 2–4 wk | §4 CAF sandbox→contract | 🧑🏢 | doc verification |
| 1–2 wk | §3 ICP-Brasil A1 cert (e-CNPJ) | 🧑 | NF-e/NFS-e issuance (§6) |
| 1–2 wk | §8 Apple Developer + D-U-N-S | 🧑 | iOS store submission |
| 1–2 wk | §8 Twilio WhatsApp (Meta Business verify) | 🧑 | WhatsApp notifications |
| Instant–1 wk | §2 domain @ registro.br | 🧑 | rename sweep, all CORS/cookie/email config |

---

## §0 — Money architecture (🧑 decision, then 🤖 ADR)

- [ ] 🧑 **DECIDE**: PSP-custody split (Option A) vs. internal ledger (Option B).
- [ ] 🧑 If Option A, pick the PSP: MP Marketplace (keeps our MP client) / Pagar.me / Asaas (most self-serve subcontas).
- [ ] 🤖 Write `docs/adr/0001-money-architecture.md` recording the choice + rationale.
- [ ] 🤖 Write the migration plan for `Wallet`, `PayoutRequest`, `PayoutMethod` models under the chosen model.
- [ ] 🤖 Add a one-page "money flow" diagram (buyer → PSP → seller) to `docs/`.

**Recommendation on record:** Option A. Removes BACEN/AML burden, and the PSP KYCing sellers
may let us delete the entire §4 Serpro dependency (the 6–12 week long pole). Verify that before
signing any KYC contract.

---

## §1 — Kill the fictional payout endpoint (🤖 code, gated by §0)

Verified in-repo: `sendPixPayout()` at `apps/api/src/payments/mercadopago.client.ts:410`, hitting
the non-public `/v1/money_requests` (`:462`); called from `apps/api/src/wallet/payouts.service.ts:156`.

- [ ] 🤖 Per §0 outcome: delete `sendPixPayout` (Option A/MP) **or** replace with the PSP's real
      documented `POST /transfers` (Option A/Pagar.me or Asaas). Keep `PayoutRequest` as audit record if useful.
- [ ] 🤖 Update `apps/api/src/wallet/payouts.service.spec.ts` to match (it currently mocks `sendPixPayout`).
- [ ] 🧑 **Resolve the revenue-model contradiction** (PLAN.md says zero commission + buyer-protection fee;
      THIRD_PARTY_ONBOARDING.md §1.4 says 10% commission). Pick one.
- [ ] 🤖 Encode it: `PLATFORM_FEE` constant in `packages/shared/src/constants.ts` (does not exist yet),
      applied in `apps/api/src/orders/orders.service.ts` order math + the PSP split rule.
- [ ] 🤖 Fix the docs (§11) to agree.
- [ ] 🤖 Fix fee tax treatment (see §6).

---

## §2 — Domain + rename sweep (🧑 register, then 🤖 sweep)

`vintage.br` is not a registrable product domain. ~149 occurrences across ~40 files.

- [ ] 🧑 Register a real domain @ registro.br under the CNPJ (usevintage.com.br / vintagebr.com.br / rebrand). R$40/yr.
- [ ] 🧑 **Decide bundle IDs before first store upload** — `br.vintage.app` can stay (bundle IDs aren't domains) but is immutable after upload.
- [ ] 🤖 Sweep: `apps/mobile/eas.json`, `apps/mobile/app.json`, `apps/api/.env.example`, `apps/web/.env.example`,
      `cookie.constants.ts`, CORS examples, `SMTP_FROM`/`EMAIL_FROM`, mock label URLs in the 4 shipping clients,
      `sitemap.ts`, `layout.tsx` metadata, all legal pages, `STORE_SUBMISSION.md`, `STORE_URLS.md`, `.well-known` routes.
- [ ] 🤖 Add a CI grep gate that fails on the literal `vintage.br` (minus the chosen real domain) so it can't creep back.

---

## §3 — Corporate + regulatory prerequisites (🧑 — start now, longest legal lead times)

- [ ] 🧑 CNPJ via contador / Redesim — **sociedade limitada, not MEI** (PSPs reject MEI for marketplace). 1–3 wk.
- [ ] 🧑 Business bank account with PIX (Inter/BTG/Itaú).
- [ ] 🧑 ICP-Brasil A1 cert (e-CNPJ) from Serasa/Certisign/Soluti, ~R$200–400/yr → upload to Focus NFe. 1–2 wk.
- [ ] 🧑 LGPD: appoint DPO email (dpo@domain), publish on `/privacidade`, fill the processor list.

---

## §4 — KYC to unblock withdrawals (🧑🏢 — the long pole; may be DELETED by §0)

- [ ] 🧑 **First: confirm §0.** If Option A PSP KYCs sellers, evaluate deleting Serpro entirely before signing.
- [ ] 🧑🏢 Serpro Datavalid contract @ loja.serpro.gov.br (CNPJ + signed contract + LGPD use-case). **6–12 wk.**
- [ ] 🏢 On activation: set `SERPRO_CLIENT_ID/SECRET/BASE_URL` (fields already stubbed in `.env.example:281`),
      flip `IDENTITY_VERIFICATION_ENABLED=true`. Smoke-test homologation first.
- [ ] 🧑🏢 CAF (caf.io) sandbox → contract 2–4 wk. Set `CAF_API_KEY/WEBHOOK_SECRET/BASE_URL`, `WEBHOOK_BASE_URL`,
      then `IDENTITY_DOCUMENT_ENABLED=true`. Ask CAF whether their CPF-basic check replaces Serpro (one vendor not two).
- [ ] 🧑 Interim: until one is live, either don't launch OR staff the manual `/conta/verificacao` doc-review path.

---

## §5 — Shipping: aggregator + safe fallbacks (🤖 code + 🏢 token)

Verified: mock fallbacks live in `jadlog.client.ts`, `pegaki.client.ts`, `correios.client.ts` (`mockRates`/`mockLabel`),
all behind the `shipping.service.ts` interface.

**🤖 Do these NOW (§0-independent, high-value safety fix):**
- [ ] 🤖 Invert mock-fallback: when `NODE_ENV=production` and a real call fails, **throw** — never return
      `mockRates()`/`mockLabel()` (jadlog `:82,:116`; pegaki `:42,:63,:84`; kangu; correios `:83,:122`).
      Mocks only when *unconfigured and not production*.
- [ ] 🤖 Checkout shows "frete indisponível no momento" instead of the hardcoded R$16.90 fantasy rate.
- [ ] 🤖 CEP validation: ViaCEP lookup (`GET https://viacep.com.br/ws/{cep}/json/`, free) in address creation;
      reject `erro:true`, cross-check city/state, cache in Redis, fall back to regex if ViaCEP down.

**🏢 Aggregator (scaffold now, token later):**
- [ ] 🧑🏢 Register Melhor Envio (or SuperFrete); generate API token (sandbox available same-day).
- [ ] 🤖 Add `melhorenvio.client.ts` behind existing `shipping.service.ts`; delete `jadlog.client.ts`,
      `kangu.client.ts`, `pegaki.client.ts`. Keep `correios.client.ts` only if a direct contract is later signed
      (and then fix its auth: CWS mints short-lived JWTs via `POST /token`, not the static `CORREIOS_TOKEN` model).

---

## §6 — Tax: point NF-e at the real obligation (🧑 ruling + 🤖 code + 🏢 cert)

Verified: `apps/api/src/notafiscal/notafiscal.service.ts` + `nfe.client.ts` exist.

- [ ] 🧑 Get accountant's ruling. Actual obligation: **NFS-e** (municipal service invoice) on the platform fee, with ISS 2–5%.
- [ ] 🤖 Wire `calculatePlatformIssBrl` into the real flow instead of `issRate = 0` (`notafiscal.service.ts:249`).
- [ ] 🤖 Gate the seller-NF-e flow to CNPJ sellers only (add `sellerType` check) — CPF individuals needn't issue NF-e for used goods.
- [ ] 🧑🏢 Focus NFe: create account, add CNPJ, upload A1 cert (§3), get prod+homolog tokens → `NFE_API_KEY`, `NFE_PROVIDER=focus`.

---

## §7 — Payment-path code fixes (🤖 — survive regardless of §0; do the reconciliation cron first)

Verified: `orders/orders-cron.service.ts`, `payments/payments.service.ts` exist.

- [ ] 🤖 **Reconciliation cron for lost webhooks (highest-value single fix).** Every 5 min: find `Payment`
      rows `PENDING` >15 min with a `providerPaymentId`; call `GET /v1/payments/{id}`
      (`mercadopago.client.ts:342`); if approved, run the webhook's settlement path (reuse the txn block in
      `payments.service.ts:609-677`, keyed on the same `ProcessedWebhook` dedup so webhook + poller can't double-settle);
      if rejected/expired, mark `FAILED`.
- [ ] 🤖 Auto-cancel `Order` rows stuck `PENDING` >24h with all attempts failed (today only PAID auto-cancel, `orders-cron.service.ts:117`) — a dead PENDING order locks the listing forever.
- [ ] 🤖 429/5xx backoff in `MercadoPagoClient.request()` — exp backoff 2/4/8s max 3, reuse same idempotency key; typed `RateLimitedError` otherwise.
- [ ] 🤖 Refund to original method, not wallet credit: `autoCancelUnshippedOrders` (`orders-cron.service.ts:138-206`)
      should try `refundPayment()` first, wallet credit only as fallback, record which path (CDC/Decreto 7.962 expects money back).
- [ ] 🤖 DELIVERED-but-never-confirmed timeout: cron rule escalating `SHIPPED` orders with no tracking movement for ~20d to dispute.

---

## §8 — Service registrations (🧑 sign-up-and-paste; code already degrades gracefully)

All 🧑. Code is ready; these are credentials. Grouped for a single procurement sprint.

- [ ] 🧑 Mercado Pago production creds + webhook (`MERCADOPAGO_ACCESS_TOKEN/PUBLIC_KEY/WEBHOOK_SECRET`).
- [ ] 🧑 Google OAuth (`GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL`) — **paired-platform: web + mobile same PR** per CLAUDE.md.
- [ ] 🧑 Apple Sign-In ($99/yr) — mandatory for iOS review; `apple.strategy.ts:84` 500s without `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY`.
- [ ] 🧑 Firebase (Android push) — `google-services.json` + `FIREBASE_SERVICE_ACCOUNT_JSON`.
- [ ] 🧑 APNs key → upload to EAS (`pushNotifications.ts` swallows token errors otherwise).
- [ ] 🧑 Twilio (upgrade trial, BR number) `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER`; WhatsApp needs Meta verify (1–2 wk).
- [ ] 🧑 Resend email + SPF/DKIM/DMARC DNS → `SMTP_HOST/PORT/USER/PASS`.
- [ ] 🧑 Cloudflare (DNS + R2 + Turnstile) — `S3_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET`, `TURNSTILE_SECRET_KEY` +
      site keys; keep `CAPTCHA_ENFORCE=false` until mobile token adoption ~95%.
- [ ] 🧑 Google Vision (`GOOGLE_VISION_API_KEY`, restricted) + billing budget alert — SafeSearch per photo (per CLAUDE.md, moderation goes through Vision, **not** Rekognition).
- [ ] 🧑 Meilisearch cloud/self-host → `MEILISEARCH_HOST/API_KEY` + seed.
- [ ] 🧑 **Sentry — currently not wired at all.** 3 projects, add `@sentry/nestjs|nextjs` + `sentry-expo`, DSNs. Cheap, high-value.
- [ ] 🧑 PostHog (EU region for LGPD) — `POSTHOG_API_KEY` + web/mobile public keys.
- [ ] 🧑 Supabase / Upstash / Fly / Vercel — already documented in DEPLOYMENT.md §1–2; just execute (São Paulo: sa-east-1, Fly gru).
- [ ] 🧑 App stores: Apple Developer + D-U-N-S (1–2 wk), Google Play ($25). Fill `eas.json:57`, create `review@domain` demo account.

---

## §9 — Resilience fixes (🤖 — small, known, §0-independent)

- [ ] 🤖 Email failure visibility: `email.service.ts:268-289` swallows send errors → metric + `AuditLog` row; better, an outbox+retry table for critical templates.
- [ ] 🤖 Rate limiter **fail-closed for auth**: `common/throttler/redis-throttler.storage.ts` (⚠️ red-team doc said
      `auth/…` — real path is `common/throttler/…`) fails open on Redis down. Keep fail-open for browse; fail-closed
      (503) for login/register/forgot-password.
- [ ] 🤖 Fraud evaluator: `fraud.service.ts:59-101` returns ALLOW on error. For **payout** eval, fail to REVIEW (queue), not ALLOW.
- [ ] 🤖 Search fallback: wrap `search.service.ts` in try/catch → Postgres ILIKE/trigram on `Listing.title` so a Meili outage degrades relevance instead of 500ing browse.
- [ ] 🤖 Dev SMS OTP leak: `sms.service.ts:42-46` prints OTPs to stdout → mask (last-2 digits only).
- [ ] 🤖 Deep-link association files: set `APPLE_TEAM_ID` + `ANDROID_CERT_SHA256` so `.well-known` routes stop 503ing.

---

## §10 — Testing that decides launch (🤖 scaffold + 🏢 sandbox creds)

- [ ] 🤖🏢 New `test:integration` job (separate from ci-parity), sandbox creds in CI secrets: MP PIX→webhook→PAID→refund; Melhor Envio quote→label; Focus NFe NFS-e R$3.50→AUTHORIZED; Serpro/CAF homolog once contracts exist.
- [ ] 🧑 One real R$1 end-to-end transaction on staging before launch — **the actual gate**, not ci-parity green.
- [ ] 🤖 Authenticated Playwright flows (login→list→buy with MP sandbox), not just page-render smoke.
- [ ] 🤖 Load-test the two named races: 10 concurrent payouts vs R$100 (exactly one wins); concurrent SMS 2FA sends.

---

## §11 — Documentation corrections (🤖)

- [ ] 🤖 Fix THIRD_PARTY_ONBOARDING.md ↔ PLAN.md commission contradiction (§1).
- [ ] 🤖 Remove/rewrite the `sendPixPayout` section of THIRD_PARTY_ONBOARDING.md §1.5 once §0 is decided.
- [ ] 🤖 Update LAUNCH_CHECKLIST.md: category-domain reality, aggregator decision, Sentry env vars, reconciliation cron in go-live smoke.
- [ ] 🤖 Add the §0 ADR + money-flow diagram.

---

## Suggested execution order (what to actually do, in order)

1. **Today, 🧑 in parallel:** decide §0 · kick off §3 CNPJ · kick off §4 Serpro+CAF (contingent on §0) · register §2 domain · start §8 Apple D-U-N-S. *(These are the multi-week clocks — start them before any code.)*
2. **This week, 🤖 (all §0-independent, ship as small PRs):** §5 mock-fallback inversion + ViaCEP · §7 reconciliation cron + PENDING auto-cancel + backoff + refund-to-source · §9 all six resilience fixes · §11 doc contradiction fixes.
3. **After §0 decided, 🤖:** §1 payout rework + `PLATFORM_FEE` · wallet migration · §0 ADR.
4. **As vendors come online, 🤖🏢:** §5 aggregator client · §6 NFS-e wiring · §10 integration suite · §8 credential paste + flag flips.
5. **Launch gate:** the real R$1 staging transaction (§10), not CI-green.

> When you're ready, tell me to start on step 2 — it's roughly a dozen scoped PRs I can begin
> immediately, none of which depend on the §0 decision or any vendor contract.
