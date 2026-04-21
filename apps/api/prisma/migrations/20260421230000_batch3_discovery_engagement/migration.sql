-- Batch 3: Discovery & Engagement
-- - FavoriteCollection model + Favorite.collectionId for named wishlists
-- - Referral model + User.referralCode for invite/reward loop

-- ── User.referralCode ─────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

-- ── FavoriteCollection ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FavoriteCollection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(64) NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FavoriteCollection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FavoriteCollection_userId_name_key"
  ON "FavoriteCollection"("userId", "name");
CREATE INDEX IF NOT EXISTS "FavoriteCollection_userId_idx" ON "FavoriteCollection"("userId");

DO $$ BEGIN
  ALTER TABLE "FavoriteCollection"
    ADD CONSTRAINT "FavoriteCollection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Favorite.collectionId ─────────────────────────────────────────────
ALTER TABLE "Favorite" ADD COLUMN IF NOT EXISTS "collectionId" TEXT;
CREATE INDEX IF NOT EXISTS "Favorite_collectionId_idx" ON "Favorite"("collectionId");

DO $$ BEGIN
  ALTER TABLE "Favorite"
    ADD CONSTRAINT "Favorite_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "FavoriteCollection"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Referral ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Referral" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "refereeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "rewardCreditedAt" TIMESTAMP(3),
  "rewardAmountBrl" DECIMAL(10,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Referral_refereeId_key" ON "Referral"("refereeId");
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_referrerId_refereeId_key" ON "Referral"("referrerId", "refereeId");
CREATE INDEX IF NOT EXISTS "Referral_referrerId_idx" ON "Referral"("referrerId");
CREATE INDEX IF NOT EXISTS "Referral_code_idx" ON "Referral"("code");

DO $$ BEGIN
  ALTER TABLE "Referral"
    ADD CONSTRAINT "Referral_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Referral"
    ADD CONSTRAINT "Referral_refereeId_fkey"
    FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
