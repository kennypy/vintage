# Data Protection Impact Assessment (DPIA / RIPD)

> **STATUS**: SKELETON — pending DPO completion.
>
> This is the English mirror of `docs/privacy/ripd.md`. The PT-BR
> version is the primary document and takes precedence if the two
> diverge. The English version exists for (a) auditors who don't read
> Portuguese, (b) potential GDPR-equivalence reviews, (c) vendor due
> diligence questionnaires.
>
> Structure follows LGPD Art. 38 and ANPD guidance, with section
> mapping that matches Article 35 GDPR DPIA shape for convenience.

---

## 1. Identification

| Field | Value |
|---|---|
| Controller (legal entity) | _TBD_ |
| CNPJ | _TBD_ |
| Address | _TBD_ |
| Data Protection Officer (DPO) | _TBD_ |
| DPO email | _TBD_ |
| Version date | _TBD_ |
| Version | 1.0 |

## 2. Description of processing

### 2.1 Purposes

Principal processing purposes on the Vintage.br platform:

- User registration and authentication (buyers and sellers)
- Payment processing via PIX / card / boleto (Mercado Pago)
- Electronic invoice issuance (Enotas / NFe.io)
- Shipping rate calculation (Correios, Jadlog, Kangu, Pegaki)
- Fraud prevention (velocity rules, payout anomaly detection)
- Content moderation (images via Google Vision SafeSearch)
- Transactional communications (email, SMS, push)
- Customer support (disputes, refunds)

### 2.2 Categories of personal data processed

| Category | Fields | Collected in | Processed by | Stored at |
|---|---|---|---|---|
| Identification | name, email | `auth.service.ts::register` | `users.service.ts` | `User` table |
| National ID (CPF) | 11-digit CPF | `users.service.ts::setCpf` | Modulo-11 validation in `@vintage/shared::isValidCPF` | `User` table, partial UNIQUE |
| Business ID (CNPJ) | `cnpj` | `users.service.ts` | — | `User` table |
| Contact | `phone` | account settings / SMS 2FA | `auth.service.ts::setupSms` | `User` table |
| Authentication | `passwordHash` (bcrypt) | `auth.service.ts::register` | `bcrypt.hash` rounds=12 | `User` table |
| 2FA | `twoFaSecret` (TOTP), `twoFaPhone` | `auth.service.ts::setupTotp` / `setupSms` | `otplib`, Twilio | `User` table |
| Address | postal code, street, city, state | `users.service.ts` | — | `Address` table |
| Payment details | PIX key (masked on read) | `payout-methods.service.ts::create` | — | `PayoutMethod` table |
| Product images | listing photos | `uploads.service.ts::uploadListingImage` | Sharp resize, Google Vision | S3 with SSE AES256 |
| Moderation flags | URLs flagged | `uploads.service.ts::flagIfFlagged` | — | `ListingImageFlag` table |
| Transaction history | orders, payments, disputes | `orders.service.ts`, `disputes.service.ts` | — | `Order`, `Dispute`, `Payment` |
| Transaction snapshots | frozen listing state at purchase time | `orders.service.ts::create` | — | `OrderListingSnapshot` |
| Webhooks processed | external event ID (dedup) | `payments.service.ts::handleWebhook` | — | `ProcessedWebhook` |
| Invoices (NF-e) | CPF/CNPJ, legal name, amount | `notafiscal.service.ts` | external provider (Enotas/NFe.io) | `NotaFiscal` |
| Consent | ToS acceptance, privacy policy | `consent.service.ts`, `acceptTos` | — | `Consent`, `User.tosVersion` |
| Deletion audit log | reason, timestamp | `users.service.ts::deleteAccount` | — | `DeletionAuditLog` |
| Fraud signals | evidence JSON | `fraud.service.ts::createFlag` | — | `FraudFlag` |
| Session events | IP, user-agent, timestamp | `auth.service.ts` (login) | — | `LoginEvent` |

### 2.3 Data subject categories

- Buyers (individuals)
- Sellers (individuals or legal entities — CPF or CNPJ)
- Platform administrators / moderators
- Third parties named in user reports

## 3. Legal basis (LGPD Art. 7)

To be completed by the DPO per purpose:

| Purpose | Proposed legal basis | Justification |
|---|---|---|
| Registration and authentication | Contract performance (Art. 7(V)) | _DPO to assess_ |
| Payments / PIX | Contract performance; legal obligation (Art. 7(II) — NF-e issuance) | _DPO to assess_ |
| Fraud prevention | Legitimate interests (Art. 7(IX)) | _LIA required_ |
| Image moderation | Legitimate interests | _LIA required_ |
| Optional marketing | Consent (Art. 7(I)) | _DPO to assess_ |
| Dispute handling | Contract performance; legitimate interests | _DPO to assess_ |

**DPO note**: each "legitimate interests" basis requires its own
Legitimate Interests Assessment (LIA).

## 4. Data flows

### 4.1 Sources

- User registration (`POST /auth/register`)
- OAuth login (Google, Apple) (`auth.service.ts::socialLogin`)
- Image uploads (`POST /uploads/listing-image`)
- Mercado Pago payment webhooks (`POST /payments/webhook`)
- Carrier tracking events (pending — today via polling only, `tracking-poller.service.ts`)

### 4.2 Processors (third-party sub-processors)

| Processor | Data shared | Purpose | Processing location | DPA in place? |
|---|---|---|---|---|
| Mercado Pago | name, email, CPF, amount, PIX key | Payment processing + payouts | Brazil | _TBD_ |
| Google Cloud (Vision API) | product images | Listing autofill + SafeSearch moderation | USA (global region) | _TBD — TIA required_ |
| Twilio | phone, 2FA code | SMS delivery | USA | _TBD — TIA required_ |
| AWS S3 | images, videos | AES256 SSE storage | _TBD — confirm region_ | _TBD_ |
| Meilisearch | title, description, category, price | Listing search | Hosted at _TBD_ | _TBD_ |
| Correios (SRO), Jadlog, Kangu, Pegaki | origin/destination postal codes, tracking code | Shipping + tracking | Brazil | _TBD_ |
| Enotas / NFe.io | CPF/CNPJ, name, amount | NF-e issuance | Brazil | _TBD_ |
| Cloudflare Turnstile | IP, UA, opaque token | Anti-bot challenge | USA / EU (edge) | _TBD — IP retained ~5 min_ |
| PostHog (planned) | pseudonymised events, internal user ID | Funnel analytics | EU (app.eu.posthog.com) | _To formalise on activation_ |

**International transfer**: yes (Google, Twilio, possibly AWS,
PostHog). LGPD Art. 33 analysis required with contractual clauses or
adequate safeguards.

### 4.3 Internal recipients

- Customer support team (disputes, suspensions)
- Ops team (moderation and fraud triage)

## 5. Retention

| Data | Period | Basis | Code |
|---|---|---|---|
| Active accounts | for the duration of the contract | Contract | — |
| Deleted accounts (soft-delete) | 30 days for reversal | LGPD Art. 18 | `users.service.ts::hardDeleteExpiredAccounts` (3am cron) |
| Fiscal records (NF-e) | 5 years | Legal obligation | `NotaFiscal` |
| Login events | _TBD_ (suggested: 6 months) | Legitimate interests (security) | `LoginEvent` |
| Processed webhooks | _TBD_ (suggested: 60 days) | Legitimate interests (dedup) | `ProcessedWebhook` + `receivedAt` index |
| Listing snapshots | until order terminates + dispute window (5 + ~10 transit + 5 days) | Contract | `OrderListingSnapshot` purged in `releaseEscrow` / `cancelByBuyer` / `autoCancelUnshippedOrders` / `disputes.resolve` |
| Image moderation flags | _TBD_ | Legitimate interests | `ListingImageFlag` |
| Fraud flags | _TBD_ | Legitimate interests | `FraudFlag` |
| S3 images after listing deletion | _TBD — currently retained indefinitely_ | — | **GAP: S3 orphan sweep not implemented** |

## 6. Risk analysis

5×5 matrix (likelihood × impact) to be filled in by DPO. Risks to
assess explicitly:

### 6.1 Data leakage

- Photo upload containing personal document
- Pre-signed S3 URL exposure (mitigation: bounded expiry via `PRESIGNED_URL_EXPIRY`)
- Logs exposure (mitigation: CLAUDE.md §Logging forbids secrets/PIX/CPF in logs)

### 6.2 Unauthorised access

- Cross-tenant access (mitigation: every query filters by `userId`; see `jwt-auth.guard.ts`)
- Compromised session (mitigation: `tokenVersion` enables global revocation via `moderation.service.ts::forceLogout`)

### 6.3 Loss / destruction

- PostgreSQL backups (_TBD: provider snapshot policy_)
- S3 backups (_TBD: versioning enabled?_)

### 6.4 Financial fraud

- Payout drain after method creation (mitigation: `fraud.service.ts::evaluatePayout`, rule `PAYOUT_DRAIN`)
- Card testing (mitigation: `fraud.service.ts::evaluatePurchase`, rule `NEW_ACCOUNT_VELOCITY`)
- Webhook replay (mitigation: `payments.service.ts::handleWebhook`, `ProcessedWebhook` table, UNIQUE(provider, externalEventId))

### 6.5 SSRF / injection

- Uploads pointing at internal hosts (mitigation: `url-validator.ts::assertSafeS3Endpoint`)
- Arbitrary image hosts (mitigation: `listings.service.ts::validateImageUrl`, allowlist)

## 7. Security measures

| Measure | Control | Code reference |
|---|---|---|
| TLS in transit | TLS 1.2+, HSTS | infrastructure |
| Encryption at rest (S3) | SSE AES256 on every upload | `uploads.service.ts::uploadListingImage` |
| Encryption at rest (Postgres) | Provider-side | infrastructure |
| Password hashing | bcrypt cost 12 | `auth.service.ts` |
| Webhook signature | HMAC SHA256 (Mercado Pago) | `mercadopago.client.ts::verifyWebhookSignature` |
| CSRF | Per-session token; bypass only via `X-API-Key` | `common/middleware/csrf.middleware.ts` |
| Content Security Policy | script-src 'self' without unsafe-inline | `apps/web/next.config.mjs` |
| Rate limiting | Redis-backed; SHA256 hash of API keys | `common/throttler/` |
| Captcha on sensitive endpoints | Cloudflare Turnstile (enforcement gated) | `auth/captcha.service.ts` |
| Image moderation | Google Vision SafeSearch; REJECT VERY_LIKELY, FLAG LIKELY | `uploads/image-analysis.service.ts::classifyModeration` |
| CPF validation | Modulo-11 before persist | `@vintage/shared::isValidCPF` |
| Upload validation | magic-byte MIME; max 10MB; max 20 per listing | `uploads.service.ts::validateMimeType` |
| Webhook dedup | UNIQUE (provider, externalEventId) | `ProcessedWebhook` |
| Evidence snapshot | listing state frozen at purchase | `OrderListingSnapshot` |
| Universal Links + App Links | apps/mobile + /.well-known/* | commit f1dd98b |
| Session invalidation | `tokenVersion` bump on ban / force-logout | `moderation.service.ts` |
| Structured logging | JSON; secrets/PII redacted; request-id | `common/logger` |

## 8. Data subject rights

Endpoints currently exposed:

| Right (LGPD Art. 18) | Implementation | Endpoint |
|---|---|---|
| Confirmation of processing | `getMyProfile` returns full profile | `GET /users/me` |
| Access | idem | `GET /users/me` |
| Correction | `updateProfile` | `PATCH /users/me` |
| Anonymisation / erasure | soft-delete with anonymisation + 30-day hard-delete | `DELETE /users/me` → `users.service.ts::deleteAccount` |
| Portability | _GAP — not implemented_ | _To implement_ |
| Information on sharing | this document + privacy policy at `/privacidade` | — |
| Withdrawal of consent | profile flag toggles / marketing opt-out | `PATCH /users/me` |

**Identified gap**: data export (portability) not implemented.
Recommendation: `POST /users/me/export` producing ZIP (JSON + images).

## 9. Review cadence

Review triggers:
- Annually
- On addition of any new processor
- On a change to the purpose of a data category
- After any security incident with potential impact on data subjects

Last review: _TBD_
Next review: _TBD_

---

## DPO compliance checklist

- [ ] Fill controller identification (§1)
- [ ] Validate legal basis for each purpose (§3), with separate LIAs where needed
- [ ] Formalise DPAs with every sub-processor (§4.2)
- [ ] Run TIAs for Google, Twilio, PostHog
- [ ] Set retention periods marked _TBD_ (§5) and implement purge crons
- [ ] Complete the 5×5 risk matrix (§6)
- [ ] Implement portability endpoint (§8)
- [ ] Implement S3 orphan sweep after listing soft-delete (§5)
- [ ] Publish final version at `/privacidade/ripd` (PDF for ANPD audit)
- [ ] Keep PT-BR primary (`docs/privacy/ripd.md`) and EN mirror in sync
