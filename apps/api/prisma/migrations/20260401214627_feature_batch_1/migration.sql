-- DropForeignKey
ALTER TABLE "AuthenticityRequest" DROP CONSTRAINT "AuthenticityRequest_sellerId_fkey";

-- DropForeignKey
ALTER TABLE "LoginEvent" DROP CONSTRAINT "LoginEvent_userId_fkey";

-- DropIndex
DROP INDEX "LoginEvent_userId_idx";

-- AlterTable
ALTER TABLE "AuthenticityRequest" ALTER COLUMN "proofImageUrls" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LoginEvent" ALTER COLUMN "ipHash" SET DATA TYPE VARCHAR(64),
ALTER COLUMN "deviceIdHash" SET DATA TYPE VARCHAR(64),
ALTER COLUMN "success" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "ListingVideo_listingId_idx" ON "ListingVideo"("listingId");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_success_idx" ON "LoginEvent"("userId", "success");

-- AddForeignKey
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthenticityRequest" ADD CONSTRAINT "AuthenticityRequest_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
