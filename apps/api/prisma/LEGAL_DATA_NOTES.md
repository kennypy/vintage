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

Independent of retention schedules, a user can export all their data at any
time while the account is active, via `Perfil > Privacidade > Exportar dados`.
The export is produced asynchronously and delivered to the registered email as
a signed URL valid for 24 hours.

## 8. Right to erasure (LGPD Art. 18, VI)

When a user exercises erasure, the 30-day soft-delete window described in §1
applies. Data retained for fiscal obligations (§3) cannot be erased earlier —
this exception is documented in the Privacy Policy and communicated to the user
at the moment of the request.

---

Review this document when:

- A new data category is introduced in the schema.
- A new sub-processor is added or removed.
- A regulatory change affects retention (e.g., ANPD or CTN update).
- The Privacy Policy is revised.
