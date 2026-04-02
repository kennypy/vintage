-- Migration: Sync User table to match schema.prisma
-- Adds 8 fields present in schema but never included in migrations,
-- makes cpf nullable for social login users, and adds social login index.

-- 1. Create UserRole enum
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Add missing columns to User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "cpfVerified"      BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "socialProvider"   TEXT,
  ADD COLUMN IF NOT EXISTS "socialProviderId" TEXT,
  ADD COLUMN IF NOT EXISTS "coverPhotoUrl"    TEXT,
  ADD COLUMN IF NOT EXISTS "role"             "UserRole"   NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS "isBanned"         BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "bannedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bannedReason"     TEXT;

-- 3. Make cpf nullable (initial migration had NOT NULL; schema.prisma has String? for social login)
ALTER TABLE "User" ALTER COLUMN "cpf" DROP NOT NULL;

-- 4. Index for social login lookups used by socialLogin() in auth.service.ts
CREATE INDEX IF NOT EXISTS "User_socialProvider_socialProviderId_idx"
  ON "User"("socialProvider", "socialProviderId");
