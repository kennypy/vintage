-- CronLock (@@map "cron_locks") and FeatureFlag (@@map "feature_flags") were
-- added to schema.prisma without a corresponding migration, so environments
-- provisioned via `prisma migrate deploy` (production, dev-setup, the boot-time
-- runMigrations() in main.ts) never get these tables: every cron-lock acquire
-- and every feature-flag query fails with "relation does not exist".
-- IF NOT EXISTS because environments bootstrapped with `prisma db push`
-- already have both tables (same precedent as 20260401000000_feature_batch_1).

-- CreateTable
CREATE TABLE IF NOT EXISTS "cron_locks" (
    "id" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_key_key" ON "feature_flags"("key");
