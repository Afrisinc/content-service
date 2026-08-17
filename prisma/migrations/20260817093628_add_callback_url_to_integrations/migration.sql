/*
  Warnings:

  - You are about to drop the column `long_lived_expires_at` on the `social_media_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `long_lived_token` on the `social_media_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `oauth_state` on the `social_media_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `short_lived_expires_at` on the `social_media_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `short_lived_token` on the `social_media_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `token_expires_at` on the `social_media_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `token_type` on the `social_media_accounts` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('SHORT_LIVED', 'LONG_LIVED');

-- DropIndex
DROP INDEX "n8n_articles_source_url_key";

-- AlterTable
ALTER TABLE "social_media_accounts" DROP COLUMN "long_lived_expires_at",
DROP COLUMN "long_lived_token",
DROP COLUMN "oauth_state",
DROP COLUMN "short_lived_expires_at",
DROP COLUMN "short_lived_token",
DROP COLUMN "token_expires_at",
DROP COLUMN "token_type",
ADD COLUMN     "longLivedExpiresAt" TIMESTAMP(3),
ADD COLUMN     "longLivedToken" TEXT,
ADD COLUMN     "oauthState" TEXT,
ADD COLUMN     "shortLivedExpiresAt" TIMESTAMP(3),
ADD COLUMN     "shortLivedToken" TEXT,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "tokenType" "TokenType" NOT NULL DEFAULT 'LONG_LIVED';

-- AlterTable
ALTER TABLE "social_media_integrations" ADD COLUMN     "callbackUrl" TEXT;
