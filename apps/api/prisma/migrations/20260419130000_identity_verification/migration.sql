-- User.birthDate — required input for Serpro CPF verification.
-- Nullable so legacy accounts stay valid; KYC flow prompts when null.
ALTER TABLE "User" ADD COLUMN "birthDate" DATE;

-- CpfVerificationLog — one row per KYC attempt. Stores SHA256 of CPF,
-- never the raw value (CLAUDE.md §Logging).
CREATE TABLE "CpfVerificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cpfHash" VARCHAR(64) NOT NULL,
    "provider" TEXT NOT NULL,
    "result" VARCHAR(32) NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpfVerificationLog_pkey" PRIMARY KEY ("id")
);

-- "how many attempts has this user made" — admin triage on failed KYC
CREATE INDEX "CpfVerificationLog_userId_attemptedAt_idx"
  ON "CpfVerificationLog"("userId", "attemptedAt");
-- "has CPF X been tried across multiple accounts?" — fraud pattern
CREATE INDEX "CpfVerificationLog_cpfHash_idx" ON "CpfVerificationLog"("cpfHash");
-- Retention sweep (docs/privacy/ripd.md §5)
CREATE INDEX "CpfVerificationLog_attemptedAt_idx"
  ON "CpfVerificationLog"("attemptedAt");

ALTER TABLE "CpfVerificationLog" ADD CONSTRAINT "CpfVerificationLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
