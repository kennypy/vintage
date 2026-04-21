-- Vinted-parity notification preferences: review + favourite category
-- toggles, plus a per-category daily push cap. Defaults match the pattern
-- set by the earlier notification_preferences migration — every existing
-- user keeps receiving everything, opts out from the settings UI.
ALTER TABLE "User"
  ADD COLUMN "notifReviews"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifFavorites" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifDailyCap"  INTEGER NOT NULL DEFAULT 0;
