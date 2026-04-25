-- Composite indexes for the two hottest Listing query shapes.
-- Both are equality-on-leading + ORDER BY on trailing, which lets Postgres
-- skip the sort step on the heap and serve directly from the index.

CREATE INDEX "Listing_status_createdAt_idx"
  ON "Listing" ("status", "createdAt" DESC);

CREATE INDEX "Listing_sellerId_status_createdAt_idx"
  ON "Listing" ("sellerId", "status", "createdAt" DESC);
