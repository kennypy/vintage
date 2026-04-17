-- Phase 1 API security hardening
-- 1. Order idempotencyKey + partial unique index (prevents concurrent duplicate orders)
-- 2. PaymentFlag table (flagged for manual review)

ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;

-- Partial unique index: enforce uniqueness only when idempotencyKey is provided.
-- Allows many orders per buyer with NULL keys while blocking duplicate submissions
-- when a key is supplied.
CREATE UNIQUE INDEX "Order_buyerId_idempotencyKey_key"
  ON "Order"("buyerId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- PaymentFlag — records payments that need manual review (amount mismatch, suspicious activity).
CREATE TABLE "PaymentFlag" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "reason" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentFlag_orderId_idx" ON "PaymentFlag"("orderId");
CREATE INDEX "PaymentFlag_resolvedAt_idx" ON "PaymentFlag"("resolvedAt");

ALTER TABLE "PaymentFlag" ADD CONSTRAINT "PaymentFlag_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
