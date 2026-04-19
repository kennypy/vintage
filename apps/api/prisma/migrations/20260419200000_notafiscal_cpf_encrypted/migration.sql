-- NotaFiscal.buyerCpf at rest. The XML blob on the same row still
-- carries the plaintext CPF per tax law — that's the actual fiscal
-- record. This column was a convenience duplicate for admin lookups;
-- we now store it as AES-256-GCM ciphertext so a DB dump alone
-- doesn't surface buyer CPFs without the vault key.
--
-- Pre-launch migration — no real CPFs in this table yet — so we
-- drop the plaintext column and add the encrypted one cleanly. Any
-- existing dev / test fixture row loses its `buyerCpf`; regenerate
-- by re-running the NF-e flow if needed.

ALTER TABLE "NotaFiscal" DROP COLUMN IF EXISTS "buyerCpf";
ALTER TABLE "NotaFiscal" ADD COLUMN "buyerCpfEncrypted" TEXT;
