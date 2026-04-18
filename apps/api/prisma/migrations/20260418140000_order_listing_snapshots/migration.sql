-- CreateTable
CREATE TABLE "OrderListingSnapshot" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "brandId" TEXT,
    "brandName" TEXT,
    "condition" "ItemCondition" NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "priceBrl" DECIMAL(10,2) NOT NULL,
    "shippingWeightG" INTEGER NOT NULL,
    "imageUrls" JSONB NOT NULL DEFAULT '[]',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderListingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — one snapshot per order (or zero, for legacy rows).
CREATE UNIQUE INDEX "OrderListingSnapshot_orderId_key" ON "OrderListingSnapshot"("orderId");

-- CreateIndex — for counting "do any active orders reference this
-- listing?" in ListingsService.remove()'s option-B freeze check.
CREATE INDEX "OrderListingSnapshot_listingId_idx" ON "OrderListingSnapshot"("listingId");

-- ON DELETE CASCADE so snapshots vanish when the order is hard-deleted
-- (rare; only the LGPD 30-day sweep does this). For the normal path,
-- service-layer code deletes the snapshot explicitly on transition to
-- COMPLETED / CANCELLED / REFUNDED.
ALTER TABLE "OrderListingSnapshot" ADD CONSTRAINT "OrderListingSnapshot_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
