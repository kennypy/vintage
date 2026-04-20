-- Add per-user notification preferences. 2 channel toggles + 7 category
-- toggles, all default true so existing rows keep receiving everything
-- until the user opts out.
ALTER TABLE "User"
  ADD COLUMN "pushEnabled"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailEnabled"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifOrders"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifMessages"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifOffers"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifFollowers"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifPriceDrops" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifPromotions" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifNews"       BOOLEAN NOT NULL DEFAULT true;
