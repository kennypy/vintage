# Legal Data Retention Notes

This document records the **data retention schedule** applied by the Vintage.br
API. It is the operational counterpart of the user-facing Privacy Policy at
`/privacidade` and is written in English for engineering reference. If you change
retention behavior, update both this document and the Privacy Policy.

All retention values should be represented in the Prisma schema either as
scheduled jobs, lifecycle rules on object storage, or soft-delete policies — not
encoded in migration files directly.

## 1. Account data

- **Soft delete on request**: when a user requests account deletion, the account
  is marked `deletedAt = now()` and immediately hidden from the product surface.
- **Hard delete after 30 days**: a scheduled job permanently erases personal
  data (name, email, phone, CPF, addresses, password hash, device tokens,
  messages, avatar) from the primary DB after 30 days. This window allows
  recovery of accidental deletions and gives time to close in-flight disputes.
- **Anonymized record retained 5 years**: transaction records (purchases,
  sales, payouts) are retained for **5 years** in anonymized form (UUID only,
  no PII), to satisfy Brazilian fiscal and tributary obligations (Art. 173 of
  the CTN, Art. 37 of Lei 9.430/1996, and NF-e electronic invoicing rules).

## 2. Marco Civil access logs

- **Retention: 6 months**, per Art. 15 of Lei 12.965/2014 (Marco Civil da
  Internet). These are application access logs: request IP, timestamp, user
  agent, endpoint, response status. They are rotated from hot storage to cold
  storage at 30 days and purged at 180 days.
- Logs never contain request bodies, PII, secrets, or payment data.

## 3. Payment records

- **Retention: 5 years** from the transaction date. This covers:
  - Mercado Pago payment IDs, order IDs, and PIX identifiers.
  - Ledger entries (wallet balance changes, payouts, refunds).
  - NF-e (electronic invoice) records and Codificação Fiscal.
- Retained in compliance with CTN Art. 173 and NF-e legislation.
- Retained even if the associated user account is deleted — anonymized to a
  synthetic customer ID that cannot be correlated back to the person.

## 4. Messages

- **Retention: while account is active**. Messages between buyer and seller are
  visible to the participants and to the moderation team for dispute review.
- **Purged on account deletion**: messages authored by the deleted user are
  removed from the thread along with their account, 30 days after the deletion
  request (aligned with account hard-delete).
- **Exception — active disputes**: if a dispute is open, messages relevant to
  that dispute are retained until the dispute is closed plus a 90-day cool-off
  window, then purged.

## 5. Attachments in object storage

- **Storage backend**: Cloudflare R2 (bucket `vintage-attachments`).
- **Lifecycle rule**: objects whose referencing DB row has been deleted are
  purged by the **nightly lifecycle rule** (Cloudflare R2 object expiry with
  TTL of 7 days after soft-delete flag).
- Object uploads always use `ServerSideEncryption: AES256`.

## 6. Audit trail

Each retention-related job writes a structured log line with:

- `jobName`
- `runId`
- `rowsPurged`
- `durationMs`

These audit logs themselves follow the Marco Civil 6-month retention.

## 7. Right to export (LGPD Art. 18, V — portability)

User calls `POST /users/me/export` at any time while the account is active.
The API streams a ZIP containing: user profile, addresses, listings (with
imageUrls inlined), orders (buyer + seller, including `OrderListingSnapshot`
rows), offers, messages, masked payout methods, disputes, notifications,
reviews, and fraud flags. A `receipt.json` file includes a SHA256 over the
other JSON files so the user can later prove what was exported.

Throttle: 5/hour per user. Raw PIX keys are NEVER included — always masked
via `maskPixKey`.

## 8. Right to erasure (LGPD Art. 18, VI)

When a user exercises erasure, the 30-day soft-delete window described in §1
applies. Data retained for fiscal obligations (§3) cannot be erased earlier —
this exception is documented in the Privacy Policy and communicated to the user
at the moment of the request.

## 9. Operational audit tables

Added alongside the KYC / moderation / fraud features. Retention windows are
env-driven (`RETENTION_*_DAYS`) and enforced by `RetentionCronService`
(02:00 UTC daily). Defaults below.

| Table                     | Retention | Rationale                                   | Purge scope                  |
|---------------------------|-----------|---------------------------------------------|------------------------------|
| `LoginEvent`              | 90 days   | Marco Civil §2 already covers access logs; this table only holds auth outcomes (login success/fail), so 90d is enough for security triage without duplicating Marco Civil scope. | All rows past cutoff. |
| `ProcessedWebhook`        | 30 days   | Dedup guard for MP + Caf retries. A replay after 30 days is almost certainly a provider bug; we'd rather surface it than silently dedupe. | All rows past cutoff. |
| `ListingImageFlag`        | 365 days  | Moderation queue + audit of SafeSearch outcomes. PENDING rows never expire — they're a signal ops hasn't reviewed yet; losing them would hide a moderation backlog. | Non-PENDING only. |
| `FraudFlag`               | 365 days  | Fraud-pattern analysis (repeat offenders, cross-account signals). PENDING rows exempt for the same reason as image flags. | Non-PENDING only. |
| `CpfVerificationLog`      | 365 days  | Audit of every KYC attempt (Serpro + Caf). Stores SHA256(cpf) only, never the raw value. Fraud-pattern value decays past a year. | All rows past cutoff. |
| `CafVerificationSession`  | 365 days  | Track C session map. PENDING rows exempt — an open session past a year likely means the webhook never arrived; ops triages manually. | Non-PENDING only. |
| `OrderListingSnapshot`    | Order lifecycle | Snapshot of listing at purchase time. Purged when the owning order reaches COMPLETED / CANCELLED / REFUNDED (see `OrdersService.releaseEscrow`, `cancelByBuyer`, `autoCancelUnshippedOrders`, `DisputesService.resolve`). | Service-layer cleanup, not cron. |
| S3 orphan images          | 30 days after listing soft-delete | Once a listing has been `DELETED` for 30 days AND no `OrderListingSnapshot` references it, `RetentionCronService.sweepOrphanImages` issues `DeleteObject` on every `ListingImage.url` then hard-deletes the Listing row (cascading the image rows). | Listings with active snapshot refs are skipped — they become eligible after the snapshot is purged. |

## 10. New data categories introduced 2026-04

For each new Prisma model, sub-processor, or retention rule added, update
this table. Order: newest first.

| Date       | Change                                                             | Why |
|------------|--------------------------------------------------------------------|-----|
| 2026-04-19 | `CafVerificationSession` + `/webhooks/caf` (Track C, document + liveness) | User escalation path when Serpro returns NAME_MISMATCH. Biometric data (selfie + doc photo) is processed by Caf and NOT persisted locally — we store only the session id + status. |
| 2026-04-19 | `CpfVerificationLog` + Serpro Datavalid (Track B)                   | Receita Federal validation at first payout attempt. SHA256(cpf) only — never raw. |
| 2026-04-19 | `User.cpfChecksumValid` / `User.cpfIdentityVerified` split          | Old `cpfVerified` column was misleading (Modulo-11 only, not identity). Payout + NF-e gate now enforces real KYC via `cpfIdentityVerified`. |
| 2026-04-18 | `FraudRule` + `FraudFlag`                                          | Rule-based velocity + drain detection. Rule thresholds in DB so DPO/ops can retune without a deploy. |
| 2026-04-18 | `ListingImageFlag`                                                 | Google Vision SafeSearch LIKELY → admin queue. VERY_LIKELY rejected at upload boundary (never persisted). |
| 2026-04-18 | `OrderListingSnapshot`                                             | Freeze of listing state at purchase time for dispute evidence. Purged on order terminal state. |
| 2026-04-18 | `ProcessedWebhook`                                                 | MP + Caf webhook dedup. 30d retention. |

---

Review this document when:

- A new data category is introduced in the schema.
- A new sub-processor is added or removed.
- A regulatory change affects retention (e.g., ANPD or CTN update).
- The Privacy Policy is revised.
