-- CafVerificationSession — one row per document+liveness session
-- opened against Caf. Track C of the KYC plan (escalation path when
-- Serpro returns NAME_MISMATCH or CPF_SUSPENDED). Webhook arrives
-- asynchronously with the session result.
CREATE TABLE "CafVerificationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalSessionId" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "redirectUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CafVerificationSession_pkey" PRIMARY KEY ("id")
);

-- Webhook arrives keyed on externalSessionId — UNIQUE ensures we can
-- resolve it to our row without ambiguity (and dedupes on retry).
CREATE UNIQUE INDEX "CafVerificationSession_externalSessionId_key"
  ON "CafVerificationSession"("externalSessionId");

-- "most recent Caf session for this user" + "how many pending
-- sessions are there total" — both powered by these two indexes.
CREATE INDEX "CafVerificationSession_userId_createdAt_idx"
  ON "CafVerificationSession"("userId", "createdAt");
CREATE INDEX "CafVerificationSession_status_idx"
  ON "CafVerificationSession"("status");

ALTER TABLE "CafVerificationSession" ADD CONSTRAINT "CafVerificationSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
