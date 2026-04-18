-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "action" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — UNIQUE is the actual dedup guard; INSERT trips P2002
-- on a re-delivered event and the handler returns 200 silently.
CREATE UNIQUE INDEX "ProcessedWebhook_provider_externalEventId_key" ON "ProcessedWebhook"("provider", "externalEventId");

-- CreateIndex — for the 60-day sweep cron.
CREATE INDEX "ProcessedWebhook_receivedAt_idx" ON "ProcessedWebhook"("receivedAt");
