# Wallet Ledger — Double-Entry Design Proposal

**Status:** Proposal (not yet implemented)
**Author:** Red-team review follow-up
**Scope:** `apps/api` — `Wallet`, `WalletTransaction`, and every service that mutates a wallet balance.

---

## 1. Problem

The wallet today exposes two money columns:

- `Wallet.balanceBrl` — withdrawable funds
- `Wallet.pendingBrl` — funds held in escrow

Every balance change is performed as a **direct column mutation** (`balanceBrl: { increment }` / `pendingBrl: { decrement }`) and, alongside it, a `WalletTransaction` "activity" row is written. The activity row carries a single signed `amountBrl` plus a `type` enum (`CREDIT | DEBIT | PAYOUT | REFUND | ESCROW_HOLD | ESCROW_RELEASE`).

**There is no enforced invariant linking the ledger to the balances.** The `WalletTransaction` table is an append-only *activity feed*, not a double-entry ledger. Two concrete defects make it impossible to derive (and therefore to reconcile) the balances from the ledger:

### 1.1 A single ledger row cannot say which column it moved

`amountBrl` is one signed number. It does not record whether it affected `balanceBrl`, `pendingBrl`, or moved value between them. So neither `balanceBrl` nor `pendingBrl` is derivable from the ledger.

### 1.2 The same `type` is written with opposite signs and opposite meanings

`ESCROW_RELEASE` is used two different ways:

| Call site | `amountBrl` | `balanceBrl` | `pendingBrl` | Real meaning |
|---|---|---|---|---|
| `orders.service.ts:845`, `disputes.service.ts:347` | **+**amount | +amount | −amount | Escrow **moves** pending → balance (seller paid) |
| `orders-cron.service.ts:174`, `disputes.service.ts:310`, `returns.service.ts:342` | **−**amount | — | −amount | Escrow **clawed back** (buyer being refunded) |

The `+` form is a *transfer* (net change to total funds = 0) but is recorded as a positive row, so `Σ(ledger.amountBrl)` **overcounts** total funds by every seller payout. The `−` form is a true reduction. Same enum, contradictory semantics.

### 1.3 Consequence

Because the ledger can't reproduce the balances, **silent drift is undetectable**. If any of the ~16 mutation sites ever updates a column without writing the matching row (or with the wrong sign), nothing catches it — not a test, not a cron, not an alert. For a marketplace that custodies buyer funds, an undetectable-drift ledger is the single most dangerous data-integrity gap in the system.

---

## 2. Current-state sign audit (authoritative)

Every wallet mutation in the codebase, paired with its ledger row. This is the input to the migration backfill.

| # | Site | `type` | ledger `amountBrl` | `balanceBrl` | `pendingBrl` |
|---|---|---|---|---|---|
| 1 | `referrals.service.ts:145` | `CREDIT` | +reward | +reward | — |
| 2 | `payments.service.ts:659` | `ESCROW_HOLD` | +amount | — | +amount |
| 3 | `orders.service.ts:283` | `ESCROW_HOLD` | +amount | — | +amount |
| 4 | `orders.service.ts:845` | `ESCROW_RELEASE` | +amount | +amount | −amount |
| 5 | `orders-cron.service.ts:174` | `ESCROW_RELEASE` | −amount | — | −amount |
| 6 | `orders-cron.service.ts:197` | `REFUND` | +amount | +amount | — |
| 7 | `disputes.service.ts:310` | `ESCROW_RELEASE` | −amount | — | −amount |
| 8 | `disputes.service.ts:347` | `ESCROW_RELEASE` | +amount | +amount | −amount |
| 9 | `disputes.service.ts:470` | `REFUND` | +amount | +amount | — |
| 10 | `payouts.service.ts:128` | `PAYOUT` | −amount | −amount | — |
| 11 | `payouts.service.ts:420` | `REFUND` | +amount | +amount | — |
| 12 | `payouts.service.ts:479` | `REFUND` | +amount | +amount | — |
| 13 | `returns.service.ts:342` | `ESCROW_RELEASE` | −amount | — | −amount |
| 14 | `returns.service.ts:374` | `REFUND` | +amount | +amount | — |
| 15 | `promotions.service.ts:183` | `DEBIT` | −amount | −amount | — |
| 16 | `promotions.service.ts:255` | `DEBIT` | −amount | −amount | — |

> Note: `admin-analytics/admin-orders.controller.ts` also moves `balanceBrl`/`pendingBrl` for manual order adjustments and must be included in the migration (verify whether it writes a ledger row at all — if it does not, it is already a drift source).

---

## 3. Target model

Make `WalletTransaction` a true double-entry record by giving each row an **explicit signed delta per column**, and route every mutation through one posting primitive.

### 3.1 Schema change

```prisma
model WalletTransaction {
  id              String                @id @default(cuid())
  walletId        String
  type            WalletTransactionType
  // NEW: explicit signed deltas. Exactly one row per money movement.
  balanceDeltaBrl Decimal               @default(0) @db.Decimal(10, 2)
  pendingDeltaBrl Decimal               @default(0) @db.Decimal(10, 2)
  // KEPT for back-compat / display. Defined as balanceDeltaBrl + pendingDeltaBrl
  // for non-transfer rows; for transfers it is 0 (net movement). Stop reading it
  // for any balance math.
  amountBrl       Decimal               @db.Decimal(10, 2)
  referenceId     String?
  description     String
  createdAt       DateTime              @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id])

  @@index([walletId])
  @@index([createdAt])
}
```

### 3.2 The enforced invariant

For every wallet:

```
balanceBrl == Σ(balanceDeltaBrl)   over all of its WalletTransaction rows
pendingBrl == Σ(pendingDeltaBrl)   over all of its WalletTransaction rows
```

A seller payout (escrow release) becomes **one row** with `pendingDeltaBrl = −X, balanceDeltaBrl = +X` — a real double-entry transfer, no overcounting, no ambiguity.

### 3.3 The posting primitive

A single sanctioned mutation path. No service touches `balanceBrl`/`pendingBrl` directly anymore.

```ts
// WalletLedgerService.post(tx, { walletId, type, balanceDelta, pendingDelta, referenceId, description })
// - applies the two column increments AND writes the matching row, atomically,
//   inside the caller's Prisma transaction
// - asserts the row's deltas equal the column increments (defence in depth)
// - keeps the existing anti-overdraft guard: when balanceDelta < 0 it must run
//   as `updateMany ... where balanceBrl >= -balanceDelta` and throw on count=0
```

Each of the 16 sites in §2 is rewritten from `{ wallet.update + walletTransaction.create }` into a single `ledger.post(...)`. The `type` enum is preserved for display/reporting; it is no longer load-bearing for arithmetic.

### 3.4 Reconciliation (now trivial and correct)

Once the invariant holds by construction, the reconciliation that §1.3 made impossible becomes a cheap, bulletproof check:

```sql
SELECT w.id
FROM "Wallet" w
LEFT JOIN (
  SELECT "walletId",
         SUM("balanceDeltaBrl") AS b,
         SUM("pendingDeltaBrl") AS p
  FROM "WalletTransaction" GROUP BY "walletId"
) t ON t."walletId" = w.id
WHERE w."balanceBrl" <> COALESCE(t.b, 0)
   OR w."pendingBrl" <> COALESCE(t.p, 0);
```

Ship this as: (a) a daily `ReconciliationCron` that emits a `prom-client` gauge `wallet_ledger_drift_total` and a structured-log + `AuditLog` entry per drifted wallet, and (b) an admin endpoint for on-demand checks. Any non-empty result is a P1.

---

## 4. Migration & backfill

1. **Add columns** `balanceDeltaBrl`, `pendingDeltaBrl` (default 0), non-breaking.
2. **Backfill existing rows** from the §2 sign map, keyed by `type` **and** the sign of the legacy `amountBrl` (needed to disambiguate the two `ESCROW_RELEASE` forms):
   - `CREDIT`, `REFUND` → `balanceDelta = amountBrl`, `pendingDelta = 0`
   - `DEBIT`, `PAYOUT` → `balanceDelta = amountBrl` (already negative), `pendingDelta = 0`
   - `ESCROW_HOLD` → `pendingDelta = amountBrl`, `balanceDelta = 0`
   - `ESCROW_RELEASE` with `amountBrl > 0` (transfer) → `pendingDelta = −amountBrl`, `balanceDelta = +amountBrl`
   - `ESCROW_RELEASE` with `amountBrl < 0` (clawback) → `pendingDelta = amountBrl`, `balanceDelta = 0`
3. **Verify** the §3.4 query returns zero rows on production data **before** flipping any code to read the new columns. A non-empty result here means there is pre-existing drift in production today — which is itself a finding and must be triaged, not papered over.
4. **Cut over** the 16 sites to `ledger.post(...)` in one PR (behavior-preserving; existing money-path tests must stay green).
5. **Enable** the reconciliation cron + alert.
6. Optionally add a CHECK/trigger or a periodic assertion; do not rely on app-layer discipline alone long-term.

---

## 5. Risk & sequencing

- **Why this is not a single mechanical commit:** it rewrites 16 money-mutation sites and migrates historical data. It MUST be developed where the full `apps/api` test suite (`npx turbo test`) can run locally and iterate — the money-path specs (`payouts.service.spec.ts`, `payments.service.spec.ts`, dispute/return specs) are the safety net.
- **Order:** schema + backfill + verification (steps 1–3) can land first and are read-only with respect to behavior. The cutover (step 4) is the behavior-sensitive part and should be its own reviewed PR.
- **Do not** ship a reconciliation built on the *current* schema: without per-column deltas the only "invariant" available is a fragile per-`type` re-derivation that double-counts the `+ESCROW_RELEASE` transfers (see §1.2) and would cry wolf on every healthy wallet. The schema change is the prerequisite, not optional.

---

## 6. Out of scope

This document does not change behavior. It specifies the model so the migration can be implemented and reviewed as a discrete, test-backed change.
