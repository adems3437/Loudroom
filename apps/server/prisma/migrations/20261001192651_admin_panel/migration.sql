-- AlterTable
ALTER TABLE "GamePack" ADD COLUMN     "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT';

-- Packs created before publishing existed were all playable: keep them playable.
UPDATE "GamePack" SET "status" = 'PUBLISHED';

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "originalName" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "GamePack_status_updatedAt_idx" ON "GamePack"("status", "updatedAt");
