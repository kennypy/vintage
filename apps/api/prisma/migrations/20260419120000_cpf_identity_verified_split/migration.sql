-- Rename User.cpfVerified → User.cpfChecksumValid to make the
-- semantics honest (the old column only ever held "Modulo-11 passed",
-- never "proven identity"). Existing rows keep their current value.
ALTER TABLE "User" RENAME COLUMN "cpfVerified" TO "cpfChecksumValid";

-- New column: true only after a KYC provider confirms CPF+name at
-- Receita Federal AND, ideally, face-match on a document. Defaults
-- false; payouts + NF-e gate on this going forward.
ALTER TABLE "User" ADD COLUMN "cpfIdentityVerified" BOOLEAN NOT NULL DEFAULT false;

-- Seeded admin / test users in dev seed.ts will be re-promoted to
-- cpfChecksumValid=true on the next seed run. Production has no
-- backfill need — every existing user's old cpfVerified value (now
-- cpfChecksumValid) is preserved byte-for-byte by the rename.
