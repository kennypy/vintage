-- CreateEnum
CREATE TYPE "FraudAction" AS ENUM ('FLAG', 'BLOCK');

-- CreateEnum
CREATE TYPE "FraudFlagStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED');

-- CreateTable
CREATE TABLE "FraudRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "windowMinutes" INTEGER NOT NULL,
    "action" "FraudAction" NOT NULL DEFAULT 'FLAG',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FraudRule_code_key" ON "FraudRule"("code");

-- CreateTable
CREATE TABLE "FraudFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" "FraudFlagStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudFlag_pkey" PRIMARY KEY ("id")
);

-- Admin triage queue reads WHERE status='PENDING' ORDER BY createdAt ASC.
CREATE INDEX "FraudFlag_status_idx" ON "FraudFlag"("status");
CREATE INDEX "FraudFlag_userId_idx" ON "FraudFlag"("userId");
CREATE INDEX "FraudFlag_createdAt_idx" ON "FraudFlag"("createdAt");

ALTER TABLE "FraudFlag" ADD CONSTRAINT "FraudFlag_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FraudFlag" ADD CONSTRAINT "FraudFlag_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the two launch rules. Ops can tune thresholds with plain UPDATEs;
-- a disable is just UPDATE ... SET enabled = false WHERE code = '...'.
--
-- NEW_ACCOUNT_VELOCITY — flag buyers <7 days old making 5+ orders in
-- one hour. New accounts with sudden bursts are the most common card-
-- testing signal on Brazilian marketplaces.
INSERT INTO "FraudRule" ("id", "code", "description", "threshold", "windowMinutes", "action", "enabled", "updatedAt") VALUES
  ('fr_new_account_velocity',
   'NEW_ACCOUNT_VELOCITY',
   'Contas criadas há menos de 7 dias com 5+ pedidos em 1 hora',
   5,
   60,
   'FLAG',
   true,
   CURRENT_TIMESTAMP);

-- PAYOUT_DRAIN — payout requested within 60 minutes of a payout
-- method being created. Classic "compromised account empties
-- wallet via freshly-added PIX" pattern.
INSERT INTO "FraudRule" ("id", "code", "description", "threshold", "windowMinutes", "action", "enabled", "updatedAt") VALUES
  ('fr_payout_drain',
   'PAYOUT_DRAIN',
   'Saque solicitado em até 60 min após método de pagamento recém-cadastrado',
   1,
   60,
   'FLAG',
   true,
   CURRENT_TIMESTAMP);
