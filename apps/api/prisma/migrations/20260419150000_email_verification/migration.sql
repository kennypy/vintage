-- Email-ownership verification. Closes the attack where a user registers
-- with an email they don't own and then waits (or is overwritten by the
-- real owner via OAuth silent-merge — which commit 2 separately blocks).
-- Together with the OAuth link-flow refusal in auth.service.ts, this closes
-- every unverified-email → account-takeover path.
--
--   emailVerifiedAt   — null means the user has not proven email ownership.
--                       Login paths refuse requests from users whose
--                       verifiedAt is null unless the account was linked
--                       via a social provider (Google / Apple vouch for
--                       the email themselves).
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Grandfather every existing user. Forcing re-verification at launch
-- would lock out our active user base with no recovery path beyond
-- the email that the app would refuse to open. Future registrations
-- leave the column null until /auth/verify-email is redeemed.
UPDATE "User" SET "emailVerifiedAt" = "createdAt";

-- Partial index on unverified users — used by the cleanup cron that
-- deletes stale unverified registrations older than N days so squatted
-- email addresses don't permanently block the real owner from signing
-- up. Filtered index keeps it tiny (only unverified rows are indexed).
CREATE INDEX "User_emailVerifiedAt_null_createdAt_idx"
  ON "User"("createdAt") WHERE "emailVerifiedAt" IS NULL;

-- EmailVerificationToken — one row per outstanding verification link.
-- Follows the same shape as PasswordResetToken / EmailChangeToken:
-- tokenHash (SHA-256 of the raw token) is stored, never the raw token;
-- single-use via usedAt; TTL via expiresAt.
CREATE TABLE "EmailVerificationToken" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key"
  ON "EmailVerificationToken"("tokenHash");

CREATE INDEX "EmailVerificationToken_userId_createdAt_idx"
  ON "EmailVerificationToken"("userId", "createdAt");

CREATE INDEX "EmailVerificationToken_expiresAt_idx"
  ON "EmailVerificationToken"("expiresAt");

ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
