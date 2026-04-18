-- CreateEnum
CREATE TYPE "ListingImageFlagStatus" AS ENUM ('PENDING', 'DISMISSED', 'REJECTED');

-- CreateTable
CREATE TABLE "ListingImageFlag" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ListingImageFlagStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingImageFlag_pkey" PRIMARY KEY ("id")
);

-- Admin triage queue reads WHERE status='PENDING' ORDER BY createdAt ASC.
CREATE INDEX "ListingImageFlag_status_idx" ON "ListingImageFlag"("status");
CREATE INDEX "ListingImageFlag_createdAt_idx" ON "ListingImageFlag"("createdAt");
-- For "recent flags on this uploader" rate-limiting / repeat-offender
-- detection later.
CREATE INDEX "ListingImageFlag_uploaderId_idx" ON "ListingImageFlag"("uploaderId");

ALTER TABLE "ListingImageFlag" ADD CONSTRAINT "ListingImageFlag_uploaderId_fkey"
  FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListingImageFlag" ADD CONSTRAINT "ListingImageFlag_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
