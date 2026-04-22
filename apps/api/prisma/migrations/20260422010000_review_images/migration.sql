-- ReviewImage: optional photos attached to buyer reviews.
-- Limited at the service layer to 4 images per review, 5 MB each.

CREATE TABLE IF NOT EXISTS "ReviewImage" (
  "id"        TEXT        NOT NULL,
  "reviewId"  TEXT        NOT NULL,
  "url"       TEXT        NOT NULL,
  "position"  INTEGER     NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReviewImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReviewImage_reviewId_idx" ON "ReviewImage" ("reviewId");

ALTER TABLE "ReviewImage"
  ADD CONSTRAINT "ReviewImage_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "Review"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
