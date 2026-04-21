-- Batch 1: Escrow hold window + Returns + Payment attempts + Counter-offers

-- ── OrderStatus: add HELD variant ──────────────────────────────────────
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'HELD';

-- ── Order: escrowReleasesAt ────────────────────────────────────────────
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "escrowReleasesAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Order_escrowReleasesAt_idx" ON "Order"("escrowReleasesAt");

-- ── Payment model ──────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Payment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "parentPaymentId" TEXT,
  "providerPaymentId" TEXT,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amountBrl" DECIMAL(10,2) NOT NULL,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_orderId_attemptNumber_key"
  ON "Payment"("orderId", "attemptNumber");
CREATE INDEX IF NOT EXISTS "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX IF NOT EXISTS "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId");
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");

DO $$ BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_parentPaymentId_fkey"
    FOREIGN KEY ("parentPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── OrderReturn model ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'SHIPPED', 'RECEIVED', 'REFUNDED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "OrderReturn" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" "DisputeReason" NOT NULL,
  "description" TEXT NOT NULL,
  "returnTrackingCode" TEXT,
  "returnCarrier" "Carrier",
  "returnLabelUrl" TEXT,
  "rejectionReason" TEXT,
  "shippedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "inspectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderReturn_orderId_key" ON "OrderReturn"("orderId");
CREATE INDEX IF NOT EXISTS "OrderReturn_status_idx" ON "OrderReturn"("status");
CREATE INDEX IF NOT EXISTS "OrderReturn_returnTrackingCode_idx" ON "OrderReturn"("returnTrackingCode");
CREATE INDEX IF NOT EXISTS "OrderReturn_createdAt_idx" ON "OrderReturn"("createdAt");

DO $$ BEGIN
  ALTER TABLE "OrderReturn"
    ADD CONSTRAINT "OrderReturn_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Offer: counter-offer chain fields ──────────────────────────────────
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "parentOfferId" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "counterCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "counteredById" TEXT;
CREATE INDEX IF NOT EXISTS "Offer_parentOfferId_idx" ON "Offer"("parentOfferId");

DO $$ BEGIN
  ALTER TABLE "Offer"
    ADD CONSTRAINT "Offer_parentOfferId_fkey"
    FOREIGN KEY ("parentOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
