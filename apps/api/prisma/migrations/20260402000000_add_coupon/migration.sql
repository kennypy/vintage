-- Migration: add_coupon
-- Adds Coupon model, couponId/discountBrl to Order, and FREE to PaymentMethod enum

-- 1. Add FREE value to PaymentMethod enum
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'FREE';

-- 2. Create Coupon table
CREATE TABLE IF NOT EXISTS "Coupon" (
  "id"          TEXT        NOT NULL,
  "code"        TEXT        NOT NULL,
  "discountPct" INTEGER     NOT NULL,
  "maxUses"     INTEGER,
  "usedCount"   INTEGER     NOT NULL DEFAULT 0,
  "expiresAt"   TIMESTAMP(3),
  "isActive"    BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX IF NOT EXISTS "Coupon_code_idx" ON "Coupon"("code");

-- 3. Add couponId and discountBrl columns to Order
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "discountBrl" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "couponId"    TEXT;

-- 4. Foreign key: Order.couponId -> Coupon.id
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;
