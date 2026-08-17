-- AlterTable
ALTER TABLE "social_media_accounts" ADD COLUMN     "meta" TEXT,
ALTER COLUMN "accessToken" DROP NOT NULL;

-- CreateTable
CREATE TABLE "social_media_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appSecretEnc" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "social_media_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_media_integrations_userId_idx" ON "social_media_integrations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "social_media_integrations_userId_platform_key" ON "social_media_integrations"("userId", "platform");

-- AddForeignKey
ALTER TABLE "social_media_integrations" ADD CONSTRAINT "social_media_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
