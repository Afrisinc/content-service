-- CreateTable
CREATE TABLE "SocialMediaAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageeName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialMediaAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMediaPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "postId" TEXT,
    "postUrl" TEXT,
    "message" TEXT,
    "link" TEXT,
    "description" TEXT,
    "picture" TEXT,
    "name" TEXT,
    "caption" TEXT,
    "tags" TEXT[],
    "mediaType" TEXT,
    "mediaUrls" TEXT[],
    "altText" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "genders" INTEGER[],
    "countries" TEXT[],
    "regions" TEXT[],
    "cities" TEXT[],
    "interests" TEXT[],
    "keywords" TEXT[],
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiPrompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "lastMetricsUpdate" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialMediaPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMediaAnalytics" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "platform" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reaches" INTEGER NOT NULL DEFAULT 0,
    "engagements" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "topCountries" TEXT[],
    "topCities" TEXT[],
    "genderBreakdown" TEXT[],
    "ageBreakdown" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialMediaAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialMediaAccount_userId_idx" ON "SocialMediaAccount"("userId");

-- CreateIndex
CREATE INDEX "SocialMediaAccount_platform_idx" ON "SocialMediaAccount"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMediaAccount_userId_platform_pageId_key" ON "SocialMediaAccount"("userId", "platform", "pageId");

-- CreateIndex
CREATE INDEX "SocialMediaPost_userId_idx" ON "SocialMediaPost"("userId");

-- CreateIndex
CREATE INDEX "SocialMediaPost_platform_idx" ON "SocialMediaPost"("platform");

-- CreateIndex
CREATE INDEX "SocialMediaPost_status_idx" ON "SocialMediaPost"("status");

-- CreateIndex
CREATE INDEX "SocialMediaPost_publishedAt_idx" ON "SocialMediaPost"("publishedAt");

-- CreateIndex
CREATE INDEX "SocialMediaPost_aiGenerated_idx" ON "SocialMediaPost"("aiGenerated");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMediaAnalytics_postId_key" ON "SocialMediaAnalytics"("postId");

-- CreateIndex
CREATE INDEX "SocialMediaAnalytics_postId_idx" ON "SocialMediaAnalytics"("postId");

-- CreateIndex
CREATE INDEX "SocialMediaAnalytics_platform_idx" ON "SocialMediaAnalytics"("platform");

-- CreateIndex
CREATE INDEX "SocialMediaAnalytics_date_idx" ON "SocialMediaAnalytics"("date");

-- AddForeignKey
ALTER TABLE "SocialMediaAccount" ADD CONSTRAINT "SocialMediaAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMediaPost" ADD CONSTRAINT "SocialMediaPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
