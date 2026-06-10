-- Payment idempotency key: app-side uniqueness backstop.
-- Deterministic SHA-256(method:orderId:amount:attemptNumber) is the same key
-- sent to Mercado Pago as X-Idempotency-Key. Persisting it here lets the DB
-- reject any second Payment row that tries to claim the same logical attempt,
-- defending against double-charge if the MP-side dedup ever misfires.

ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Payment_orderId_idempotencyKey_key"
  ON "Payment" ("orderId", "idempotencyKey");
