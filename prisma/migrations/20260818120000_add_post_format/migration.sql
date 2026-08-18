-- CreateEnum
CREATE TYPE "PostFormat" AS ENUM ('feed', 'story', 'reel');

-- AlterTable
ALTER TABLE "social_media_posts" ADD COLUMN "postFormat" "PostFormat" DEFAULT 'feed';
