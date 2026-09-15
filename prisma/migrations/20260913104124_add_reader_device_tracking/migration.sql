-- AlterTable
ALTER TABLE "n8n_articles" ADD COLUMN     "readCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "story_episodes" ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reader_devices" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reader_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_read_events" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "viewedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "story_read_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_read_events" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "articleId" BIGINT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "viewedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "article_read_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "story_read_events_episodeId_idx" ON "story_read_events"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "story_read_events_deviceId_episodeId_key" ON "story_read_events"("deviceId", "episodeId");

-- CreateIndex
CREATE INDEX "article_read_events_articleId_idx" ON "article_read_events"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "article_read_events_deviceId_articleId_key" ON "article_read_events"("deviceId", "articleId");

-- AddForeignKey
ALTER TABLE "story_read_events" ADD CONSTRAINT "story_read_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "reader_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_read_events" ADD CONSTRAINT "story_read_events_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "story_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_read_events" ADD CONSTRAINT "article_read_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "reader_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_read_events" ADD CONSTRAINT "article_read_events_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "n8n_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
