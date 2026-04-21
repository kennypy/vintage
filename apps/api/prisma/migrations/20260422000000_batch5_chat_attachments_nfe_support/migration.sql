-- Batch 5: Chat image attachments + Support ticketing

-- ── Message.imageUrl ──────────────────────────────────────────────────
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- ── SupportTicket ─────────────────────────────────────────────────────
-- Internal help-desk tickets. Feeds the kennypy/CRM project via
-- outbound webhook (SUPPORT_CRM_WEBHOOK_URL); falls back to storing
-- in-house when the webhook is absent. See apps/api/src/support/.
DO $$ BEGIN
  CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SupportTicketCategory" AS ENUM (
    'ORDER_ISSUE', 'PAYMENT', 'SHIPPING', 'REFUND', 'ACCOUNT', 'LISTING', 'FRAUD', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "category" "SupportTicketCategory" NOT NULL DEFAULT 'OTHER',
  "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "orderId" TEXT,
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "externalTicketId" TEXT,
  "assignedToUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupportTicket_userId_idx" ON "SupportTicket"("userId");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX IF NOT EXISTS "SupportTicket_category_idx" ON "SupportTicket"("category");
CREATE INDEX IF NOT EXISTS "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

DO $$ BEGIN
  ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SupportTicketMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "senderRole" VARCHAR(16) NOT NULL, -- 'user' | 'agent'
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupportTicketMessage_ticketId_idx" ON "SupportTicketMessage"("ticketId");

DO $$ BEGIN
  ALTER TABLE "SupportTicketMessage"
    ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
