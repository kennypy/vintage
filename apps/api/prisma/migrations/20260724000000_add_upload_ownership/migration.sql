-- Server-written provenance for every S3 object the uploads pipeline
-- produces. This is the non-forgeable source of truth deleteImage()
-- authorizes deletes against (EXACT uploaderId + s3Key), replacing the
-- old substring match against the user-writable ListingImage.url /
-- ListingVideo.url / User.avatarUrl columns.

-- CreateTable
CREATE TABLE "UploadObject" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadObject_s3Key_key" ON "UploadObject"("s3Key");

-- CreateIndex
CREATE INDEX "UploadObject_uploaderId_idx" ON "UploadObject"("uploaderId");

-- AddForeignKey
ALTER TABLE "UploadObject" ADD CONSTRAINT "UploadObject_uploaderId_fkey"
  FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
