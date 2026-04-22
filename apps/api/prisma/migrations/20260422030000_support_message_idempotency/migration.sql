-- Idempotency for CRM partner endpoints. Adds an optional, globally
-- unique idempotencyKey on SupportTicketMessage so a retry-after-
-- response-side-timeout from the CRM outbound worker is a no-op
-- instead of a duplicate user-visible message.
ALTER TABLE "SupportTicketMessage"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicketMessage_idempotencyKey_key"
  ON "SupportTicketMessage" ("idempotencyKey");
