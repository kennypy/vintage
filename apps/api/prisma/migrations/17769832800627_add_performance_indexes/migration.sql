-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_listing_seller_status ON "Listing"("sellerId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_order_buyer ON "Order"("buyerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_order_seller ON "Order"("sellerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_order_status ON "Order"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_message_conversation ON "Message"("conversationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_review_listing ON "Review"("listingId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_review_seller ON "Review"("ratedUserId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_user_rating ON "User"("ratingAvg" DESC);

-- Add missing columns for order tracking
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "inTransitAt" TIMESTAMP;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "estimatedDelivery" TIMESTAMP;

-- Add helpful voting for reviews
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "helpfulCount" INT DEFAULT 0;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "unhelpfulCount" INT DEFAULT 0;

-- Add device tokens table for FCM
CREATE TABLE IF NOT EXISTS "UserDeviceToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "platform" TEXT,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_token_user ON "UserDeviceToken"("userId");
