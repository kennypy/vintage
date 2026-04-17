-- CreateEnum
CREATE TYPE "TwoFaMethod" AS ENUM ('TOTP', 'SMS');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "twoFaMethod" "TwoFaMethod" NOT NULL DEFAULT 'TOTP',
ADD COLUMN "twoFaPhone" TEXT,
ADD COLUMN "twoFaPhoneVerifiedAt" TIMESTAMP(3);
