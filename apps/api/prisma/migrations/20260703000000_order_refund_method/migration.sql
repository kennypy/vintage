-- Records how an auto-cancelled order's buyer was reimbursed: back to the
-- original payment method (PIX / card via Mercado Pago) or, as a fallback
-- when the provider refund fails, as wallet credit. Null until the
-- autoCancelUnshippedOrders refund path runs. CDC / Decreto 7.962 expect
-- the money returned to the original method rather than store credit
-- imposed unilaterally, so ORIGINAL_PAYMENT is the preferred path.

DO $$ BEGIN
  CREATE TYPE "RefundMethod" AS ENUM ('ORIGINAL_PAYMENT', 'WALLET_CREDIT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "refundMethod" "RefundMethod";
