-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO');

-- CreateEnum
CREATE TYPE "GameSessionStatus" AS ENUM ('ACTIVE', 'FINISHED', 'ABORTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" UUID NOT NULL,
    "gameType" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "categoryId" UUID,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[],
    "locale" TEXT NOT NULL DEFAULT 'tr',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "defaultTimeLimitMs" INTEGER,
    "baseScore" INTEGER NOT NULL DEFAULT 1000,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" UUID NOT NULL,
    "type" "MediaType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "altText" TEXT,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePack" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePackRound" (
    "id" UUID NOT NULL,
    "gamePackId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "gameType" TEXT NOT NULL,
    "contentSelection" JSONB NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "timeLimitMs" INTEGER,
    "scoreMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "showScoreboardAfter" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "GamePackRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" UUID NOT NULL,
    "roomCode" TEXT NOT NULL,
    "gamePackId" UUID,
    "hostUserId" UUID,
    "packSnapshot" JSONB NOT NULL,
    "status" "GameSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionPlayer" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "playerId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "finalScore" INTEGER NOT NULL DEFAULT 0,
    "finalRank" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRound" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "gameType" TEXT NOT NULL,
    "contentItemId" UUID,
    "contentSnapshot" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SessionRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerAnswer" (
    "id" UUID NOT NULL,
    "sessionRoundId" UUID NOT NULL,
    "sessionPlayerId" UUID NOT NULL,
    "input" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "responseTimeMs" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEvent" (
    "id" UUID NOT NULL,
    "sessionRoundId" UUID,
    "sessionPlayerId" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ContentItemToMedia" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ContentItemToMedia_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "ContentItem_gameType_status_locale_idx" ON "ContentItem"("gameType", "status", "locale");

-- CreateIndex
CREATE INDEX "ContentItem_categoryId_difficulty_idx" ON "ContentItem"("categoryId", "difficulty");

-- CreateIndex
CREATE INDEX "ContentItem_tags_idx" ON "ContentItem" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Media_storagePath_key" ON "Media"("storagePath");

-- CreateIndex
CREATE INDEX "Media_type_createdAt_idx" ON "Media"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GamePackRound_gamePackId_order_key" ON "GamePackRound"("gamePackId", "order");

-- CreateIndex
CREATE INDEX "GameSession_roomCode_startedAt_idx" ON "GameSession"("roomCode", "startedAt");

-- CreateIndex
CREATE INDEX "GameSession_status_startedAt_idx" ON "GameSession"("status", "startedAt");

-- CreateIndex
CREATE INDEX "GameSession_startedAt_idx" ON "GameSession"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionPlayer_sessionId_playerId_key" ON "SessionPlayer"("sessionId", "playerId");

-- CreateIndex
CREATE INDEX "SessionRound_contentItemId_idx" ON "SessionRound"("contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRound_sessionId_roundIndex_key" ON "SessionRound"("sessionId", "roundIndex");

-- CreateIndex
CREATE INDEX "PlayerAnswer_sessionPlayerId_idx" ON "PlayerAnswer"("sessionPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAnswer_sessionRoundId_sessionPlayerId_key" ON "PlayerAnswer"("sessionRoundId", "sessionPlayerId");

-- CreateIndex
CREATE INDEX "ScoreEvent_sessionPlayerId_idx" ON "ScoreEvent"("sessionPlayerId");

-- CreateIndex
CREATE INDEX "ScoreEvent_sessionRoundId_idx" ON "ScoreEvent"("sessionRoundId");

-- CreateIndex
CREATE INDEX "_ContentItemToMedia_B_index" ON "_ContentItemToMedia"("B");

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePack" ADD CONSTRAINT "GamePack_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePackRound" ADD CONSTRAINT "GamePackRound_gamePackId_fkey" FOREIGN KEY ("gamePackId") REFERENCES "GamePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_gamePackId_fkey" FOREIGN KEY ("gamePackId") REFERENCES "GamePack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPlayer" ADD CONSTRAINT "SessionPlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRound" ADD CONSTRAINT "SessionRound_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRound" ADD CONSTRAINT "SessionRound_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAnswer" ADD CONSTRAINT "PlayerAnswer_sessionRoundId_fkey" FOREIGN KEY ("sessionRoundId") REFERENCES "SessionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAnswer" ADD CONSTRAINT "PlayerAnswer_sessionPlayerId_fkey" FOREIGN KEY ("sessionPlayerId") REFERENCES "SessionPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_sessionRoundId_fkey" FOREIGN KEY ("sessionRoundId") REFERENCES "SessionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_sessionPlayerId_fkey" FOREIGN KEY ("sessionPlayerId") REFERENCES "SessionPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContentItemToMedia" ADD CONSTRAINT "_ContentItemToMedia_A_fkey" FOREIGN KEY ("A") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContentItemToMedia" ADD CONSTRAINT "_ContentItemToMedia_B_fkey" FOREIGN KEY ("B") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
