-- Migration: Feature Batch 1
-- Two-sided reviews, Authentic badge, Kangu/Pegaki shipping,
-- Video listings, Seller insights, CO2 impact, Conta Protegida (2FA)

-- 1. Extend Carrier enum
ALTER TYPE "Carrier" ADD VALUE IF NOT EXISTS 'KANGU';
ALTER TYPE "Carrier" ADD VALUE IF NOT EXISTS 'PEGAKI';

-- 2. New enum: AuthenticityStatus
DO $$ BEGIN
  CREATE TYPE "AuthenticityStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Seller reply on Review
ALTER TABLE "Review"
  ADD COLUMN IF NOT EXISTS "sellerReply"   TEXT,
  ADD COLUMN IF NOT EXISTS "sellerReplyAt" TIMESTAMP(3);

-- 4. isAuthentic on Listing
ALTER TABLE "Listing"
  ADD COLUMN IF NOT EXISTS "isAuthentic" BOOLEAN NOT NULL DEFAULT FALSE;

-- 5. 2FA fields on User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "twoFaEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "twoFaSecret"  TEXT;

-- 6. ListingVideo model (one per listing)
CREATE TABLE IF NOT EXISTS "ListingVideo" (
  "id"              TEXT NOT NULL,
  "listingId"       TEXT NOT NULL,
  "url"             TEXT NOT NULL,
  "thumbnailUrl"    TEXT,
  "durationSeconds" INTEGER,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingVideo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ListingVideo_listingId_key" ON "ListingVideo"("listingId");
ALTER TABLE "ListingVideo"
  ADD CONSTRAINT "ListingVideo_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

-- 7. LoginEvent model
CREATE TABLE IF NOT EXISTS "LoginEvent" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "ipHash"       CHAR(64) NOT NULL,
  "deviceIdHash" CHAR(64),
  "platform"     TEXT,
  "success"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoginEvent_userId_idx" ON "LoginEvent"("userId");
ALTER TABLE "LoginEvent"
  ADD CONSTRAINT "LoginEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

-- 8. AuthenticityRequest model
CREATE TABLE IF NOT EXISTS "AuthenticityRequest" (
  "id"             TEXT NOT NULL,
  "listingId"      TEXT NOT NULL,
  "sellerId"       TEXT NOT NULL,
  "proofImageUrls" TEXT[] NOT NULL DEFAULT '{}',
  "status"         "AuthenticityStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote"     TEXT,
  "reviewedBy"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthenticityRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthenticityRequest_listingId_key" ON "AuthenticityRequest"("listingId");
CREATE INDEX IF NOT EXISTS "AuthenticityRequest_sellerId_idx" ON "AuthenticityRequest"("sellerId");
CREATE INDEX IF NOT EXISTS "AuthenticityRequest_status_idx" ON "AuthenticityRequest"("status");
ALTER TABLE "AuthenticityRequest"
  ADD CONSTRAINT "AuthenticityRequest_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;
ALTER TABLE "AuthenticityRequest"
  ADD CONSTRAINT "AuthenticityRequest_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;
