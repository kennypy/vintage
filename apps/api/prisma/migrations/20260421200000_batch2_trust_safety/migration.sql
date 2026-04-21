-- Batch 2: Trust & Safety — seed new FraudRule rows for the three
-- new detection heuristics. Thresholds picked conservatively so the
-- first week on production generates flags, not blocks; ops can tune
-- up/down by UPDATE FraudRule SET threshold=... WHERE code=... without
-- a code deploy.
--
-- LISTING_VELOCITY  — 10 listings in 60 minutes from the same seller
-- PAYMENT_FAILURE_VELOCITY — 5 failed payments from the same buyer in 30 minutes
-- DUPLICATE_PHONE — evaluated at registration, always FLAG (never BLOCK)

INSERT INTO "FraudRule" ("id", "code", "description", "threshold", "windowMinutes", "action", "enabled", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'LISTING_VELOCITY',
   'Seller created an unusually high number of listings in a short window', 10, 60, 'FLAG', true, NOW()),
  (gen_random_uuid()::text, 'PAYMENT_FAILURE_VELOCITY',
   'Buyer accumulated multiple failed payment attempts in a short window', 5, 30, 'FLAG', true, NOW()),
  (gen_random_uuid()::text, 'DUPLICATE_PHONE',
   'Phone number already registered to another active account', 1, 0, 'FLAG', true, NOW())
ON CONFLICT ("code") DO NOTHING;
