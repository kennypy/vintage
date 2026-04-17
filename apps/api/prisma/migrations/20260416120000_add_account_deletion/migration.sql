-- AlterTable: add deletion + ToS tracking + audit to User
ALTER TABLE "User"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "acceptedTosAt" TIMESTAMP(3),
  ADD COLUMN "acceptedTosVersion" TEXT;

-- Index for scheduled hard-delete sweeps
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- AlterTable: Report — add resolver audit
ALTER TABLE "Report"
  ADD COLUMN "resolvedBy" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- CreateTable: UserBlock
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX "UserBlock_blockerId_idx" ON "UserBlock"("blockerId");
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

ALTER TABLE "UserBlock"
  ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: DeletionAuditLog
CREATE TABLE "DeletionAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hardDeletedAt" TIMESTAMP(3),
    "dataExported" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DeletionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeletionAuditLog_userId_idx" ON "DeletionAuditLog"("userId");
CREATE INDEX "DeletionAuditLog_hardDeletedAt_idx" ON "DeletionAuditLog"("hardDeletedAt");

ALTER TABLE "DeletionAuditLog"
  ADD CONSTRAINT "DeletionAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
