-- CPF at rest: never plaintext. Pre-launch migration — no real CPFs
-- in the DB yet, so we drop the plaintext `cpf` column and add the
-- two new encrypted-side columns in one go. Any dev/test row that
-- had a CPF is cleared (intentional — it was a fixture, not user
-- data we can recover or need to preserve).
--
-- cpfEncrypted       : AES-256-GCM ciphertext (v1 format) emitted by
--                      CpfVaultService.encrypt(). Opaque text column.
-- cpfLookupHash      : HMAC-SHA256 index for collision checks at
--                      registration. Unique; null for users without
--                      a CPF (OAuth signups pre-first-purchase).

-- Drop the plaintext column + its unique index.
ALTER TABLE "User" DROP COLUMN IF EXISTS "cpf";

-- Add the new columns.
ALTER TABLE "User" ADD COLUMN "cpfEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN "cpfLookupHash" TEXT;

-- Unique index on the lookup hash — same role the old cpf_unique
-- played. Null-safe: Postgres treats NULL as distinct, so multiple
-- users without CPFs don't collide here.
CREATE UNIQUE INDEX "User_cpfLookupHash_key" ON "User"("cpfLookupHash");
