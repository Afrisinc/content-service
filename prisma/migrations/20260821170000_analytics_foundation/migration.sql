-- A daily pull needs one row per post per day. The old unique on postId alone
-- allowed one row per post ever, so each pull overwrote the day before and no
-- trend could be computed.
DROP INDEX IF EXISTS "social_media_analytics_postId_key";

ALTER TABLE "social_media_analytics" ALTER COLUMN "date" TYPE DATE USING "date"::date;

CREATE UNIQUE INDEX "social_media_analytics_postId_date_key" ON "social_media_analytics"("postId", "date");

-- CreateTable
CREATE TABLE "social_account_snapshots" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "platform" TEXT NOT NULL,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "follows" INTEGER NOT NULL DEFAULT 0,
    "postsCount" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "profileViews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "social_account_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_account_snapshots_accountId_date_key" ON "social_account_snapshots"("accountId", "date");
CREATE INDEX "social_account_snapshots_accountId_date_idx" ON "social_account_snapshots"("accountId", "date");
CREATE INDEX "social_account_snapshots_platform_idx" ON "social_account_snapshots"("platform");
