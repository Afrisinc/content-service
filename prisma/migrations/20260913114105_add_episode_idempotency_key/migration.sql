-- AlterTable
ALTER TABLE "story_episodes" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "story_episodes_storyId_idempotencyKey_key" ON "story_episodes"("storyId", "idempotencyKey");

