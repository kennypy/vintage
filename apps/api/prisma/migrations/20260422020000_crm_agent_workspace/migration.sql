-- CRM agent workspace integration:
--   * senderDisplayName   — agent display name ("Ana do Suporte") on replies
--                           posted through the partner endpoint. Null for user
--                           messages.
--   * attachmentUrls      — agent attachments are hosted on the CRM side;
--                           we just store URLs.
ALTER TABLE "SupportTicketMessage"
  ADD COLUMN IF NOT EXISTS "senderDisplayName" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "attachmentUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
