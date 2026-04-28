/*
  Warnings:

  - You are about to drop the `SocialMediaAccount` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SocialMediaAnalytics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SocialMediaPost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MediaPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'whatsapp');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('anthropic', 'openai', 'huggingface');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('pending', 'published', 'failed', 'deleted');

-- DropForeignKey
ALTER TABLE "SocialMediaAccount" DROP CONSTRAINT "SocialMediaAccount_userId_fkey";

-- DropForeignKey
ALTER TABLE "SocialMediaPost" DROP CONSTRAINT "SocialMediaPost_userId_fkey";

-- DropTable
DROP TABLE "SocialMediaAccount";

-- DropTable
DROP TABLE "SocialMediaAnalytics";

-- DropTable
DROP TABLE "SocialMediaPost";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_media_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "pageAvatar" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "social_media_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_media_posts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaPostId" TEXT,
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
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mediaType" TEXT,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "altText" TEXT,
    "scheduledAt" TIMESTAMPTZ,
    "publishedAt" TIMESTAMPTZ,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "genders" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiPrompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "lastMetricsUpdate" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "social_media_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_media_analytics" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "date" TIMESTAMPTZ NOT NULL,
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
    "topCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "genderBreakdown" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ageBreakdown" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "social_media_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "n8n_articles" (
    "id" BIGSERIAL NOT NULL,
    "guid" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_headline" TEXT,
    "source_summary" TEXT,
    "image_url" TEXT,
    "pub_date" TIMESTAMPTZ,
    "category" TEXT,
    "creator" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "processing_error" TEXT,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "n8n_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "n8n_generated_posts" (
    "id" BIGSERIAL NOT NULL,
    "n8nArticleId" BIGINT,
    "mediaPostId" TEXT,
    "topic" TEXT,
    "platform" TEXT,
    "fb_post_id" TEXT,
    "fb_url" TEXT,
    "fb_content" TEXT,
    "fb_hashtags" TEXT,
    "insta_post_id" TEXT,
    "insta_url" TEXT,
    "insta_content" TEXT,
    "insta_hashtags" TEXT,
    "twitter_post_id" TEXT,
    "twitter_url" TEXT,
    "twitter_content" TEXT,
    "twitter_thread" TEXT,
    "linkedin_post_id" TEXT,
    "linkedin_url" TEXT,
    "linkedin_content" TEXT,
    "whatsapp_content" TEXT,
    "whatsapp_campaign_id" TEXT,
    "whatsapp_sent_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ,

    CONSTRAINT "n8n_generated_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_posts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "n8nArticleId" BIGINT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "cover_image" TEXT,
    "cover_alt" TEXT,
    "media_type" TEXT,
    "video_url" TEXT,
    "video_poster" TEXT,
    "video_duration" INTEGER,
    "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topic" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "canonical_url" TEXT,
    "og_title" TEXT,
    "og_description" TEXT,
    "og_image" TEXT,
    "twitter_card" TEXT DEFAULT 'summary_large_image',
    "twitter_title" TEXT,
    "twitter_description" TEXT,
    "status" "MediaPostStatus" NOT NULL DEFAULT 'DRAFT',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_breaking" BOOLEAN NOT NULL DEFAULT false,
    "is_sponsored" BOOLEAN NOT NULL DEFAULT false,
    "sponsor_name" TEXT,
    "sponsor_url" TEXT,
    "published_at" TIMESTAMPTZ,
    "scheduled_at" TIMESTAMPTZ,
    "read_time" INTEGER NOT NULL DEFAULT 3,
    "language" TEXT NOT NULL DEFAULT 'en',
    "word_count" INTEGER,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "ai_provider" TEXT,
    "ai_model" TEXT,
    "ai_prompt" TEXT,
    "ai_score" DOUBLE PRECISION,
    "source_url" TEXT,
    "source_name" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "unique_views" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "read_completions" INTEGER NOT NULL DEFAULT 0,
    "avg_read_time" DOUBLE PRECISION,
    "bounce_rate" DOUBLE PRECISION,
    "in_newsletter" BOOLEAN NOT NULL DEFAULT false,
    "newsletter_sent_at" TIMESTAMPTZ,
    "newsletter_opens" INTEGER NOT NULL DEFAULT 0,
    "newsletter_clicks" INTEGER NOT NULL DEFAULT 0,
    "rss_guid" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "notify_contact_id" TEXT,
    "notify_synced_at" TIMESTAMPTZ,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "total_emails_sent" INTEGER NOT NULL DEFAULT 0,
    "total_emails_opened" INTEGER NOT NULL DEFAULT 0,
    "total_emails_clicked" INTEGER NOT NULL DEFAULT 0,
    "last_opened_at" TIMESTAMPTZ,
    "last_clicked_at" TIMESTAMPTZ,
    "drip_step" INTEGER NOT NULL DEFAULT 0,
    "drip_completed" BOOLEAN NOT NULL DEFAULT false,
    "drip_started_at" TIMESTAMPTZ,
    "subscribed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_campaigns" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preview_text" TEXT,
    "type" TEXT NOT NULL DEFAULT 'digest',
    "html_content" TEXT NOT NULL,
    "text_content" TEXT,
    "notify_campaign_id" TEXT,
    "notify_sent_at" TIMESTAMPTZ,
    "article_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "unsubscribes" INTEGER NOT NULL DEFAULT 0,
    "bounces" INTEGER NOT NULL DEFAULT 0,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "ai_prompt" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "newsletter_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_analytics" (
    "id" TEXT NOT NULL,
    "mediaPostId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "unique_views" INTEGER NOT NULL DEFAULT 0,
    "read_completions" INTEGER NOT NULL DEFAULT 0,
    "views_direct" INTEGER NOT NULL DEFAULT 0,
    "views_search" INTEGER NOT NULL DEFAULT 0,
    "views_social" INTEGER NOT NULL DEFAULT 0,
    "views_newsletter" INTEGER NOT NULL DEFAULT 0,
    "views_referral" INTEGER NOT NULL DEFAULT 0,
    "shares_facebook" INTEGER NOT NULL DEFAULT 0,
    "shares_twitter" INTEGER NOT NULL DEFAULT 0,
    "shares_linkedin" INTEGER NOT NULL DEFAULT 0,
    "shares_whatsapp" INTEGER NOT NULL DEFAULT 0,
    "shares_other" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "social_media_accounts_userId_idx" ON "social_media_accounts"("userId");

-- CreateIndex
CREATE INDEX "social_media_accounts_platform_idx" ON "social_media_accounts"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "social_media_accounts_userId_platform_pageId_key" ON "social_media_accounts"("userId", "platform", "pageId");

-- CreateIndex
CREATE INDEX "social_media_posts_userId_idx" ON "social_media_posts"("userId");

-- CreateIndex
CREATE INDEX "social_media_posts_platform_idx" ON "social_media_posts"("platform");

-- CreateIndex
CREATE INDEX "social_media_posts_status_idx" ON "social_media_posts"("status");

-- CreateIndex
CREATE INDEX "social_media_posts_publishedAt_idx" ON "social_media_posts"("publishedAt");

-- CreateIndex
CREATE INDEX "social_media_posts_aiGenerated_idx" ON "social_media_posts"("aiGenerated");

-- CreateIndex
CREATE INDEX "social_media_posts_mediaPostId_idx" ON "social_media_posts"("mediaPostId");

-- CreateIndex
CREATE UNIQUE INDEX "social_media_analytics_postId_key" ON "social_media_analytics"("postId");

-- CreateIndex
CREATE INDEX "social_media_analytics_postId_idx" ON "social_media_analytics"("postId");

-- CreateIndex
CREATE INDEX "social_media_analytics_platform_idx" ON "social_media_analytics"("platform");

-- CreateIndex
CREATE INDEX "social_media_analytics_date_idx" ON "social_media_analytics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "n8n_articles_guid_key" ON "n8n_articles"("guid");

-- CreateIndex
CREATE UNIQUE INDEX "n8n_articles_source_url_key" ON "n8n_articles"("source_url");

-- CreateIndex
CREATE INDEX "n8n_articles_guid_idx" ON "n8n_articles"("guid");

-- CreateIndex
CREATE INDEX "n8n_articles_source_url_idx" ON "n8n_articles"("source_url");

-- CreateIndex
CREATE INDEX "n8n_articles_category_idx" ON "n8n_articles"("category");

-- CreateIndex
CREATE INDEX "n8n_articles_status_idx" ON "n8n_articles"("status");

-- CreateIndex
CREATE INDEX "n8n_articles_created_at_idx" ON "n8n_articles"("created_at");

-- CreateIndex
CREATE INDEX "n8n_generated_posts_n8nArticleId_idx" ON "n8n_generated_posts"("n8nArticleId");

-- CreateIndex
CREATE INDEX "n8n_generated_posts_mediaPostId_idx" ON "n8n_generated_posts"("mediaPostId");

-- CreateIndex
CREATE INDEX "n8n_generated_posts_platform_idx" ON "n8n_generated_posts"("platform");

-- CreateIndex
CREATE INDEX "n8n_generated_posts_status_idx" ON "n8n_generated_posts"("status");

-- CreateIndex
CREATE INDEX "n8n_generated_posts_created_at_idx" ON "n8n_generated_posts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_posts_slug_key" ON "media_posts"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "media_posts_rss_guid_key" ON "media_posts"("rss_guid");

-- CreateIndex
CREATE INDEX "media_posts_slug_idx" ON "media_posts"("slug");

-- CreateIndex
CREATE INDEX "media_posts_status_idx" ON "media_posts"("status");

-- CreateIndex
CREATE INDEX "media_posts_category_idx" ON "media_posts"("category");

-- CreateIndex
CREATE INDEX "media_posts_topic_idx" ON "media_posts"("topic");

-- CreateIndex
CREATE INDEX "media_posts_is_featured_idx" ON "media_posts"("is_featured");

-- CreateIndex
CREATE INDEX "media_posts_is_breaking_idx" ON "media_posts"("is_breaking");

-- CreateIndex
CREATE INDEX "media_posts_published_at_idx" ON "media_posts"("published_at" DESC);

-- CreateIndex
CREATE INDEX "media_posts_ai_generated_idx" ON "media_posts"("ai_generated");

-- CreateIndex
CREATE INDEX "media_posts_n8nArticleId_idx" ON "media_posts"("n8nArticleId");

-- CreateIndex
CREATE INDEX "media_posts_authorId_idx" ON "media_posts"("authorId");

-- CreateIndex
CREATE INDEX "media_posts_in_newsletter_idx" ON "media_posts"("in_newsletter");

-- CreateIndex
CREATE INDEX "media_posts_rss_guid_idx" ON "media_posts"("rss_guid");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_notify_contact_id_key" ON "newsletter_subscribers"("notify_contact_id");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_email_idx" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_status_idx" ON "newsletter_subscribers"("status");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_notify_contact_id_idx" ON "newsletter_subscribers"("notify_contact_id");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_drip_step_idx" ON "newsletter_subscribers"("drip_step");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_subscribed_at_idx" ON "newsletter_subscribers"("subscribed_at");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_campaigns_notify_campaign_id_key" ON "newsletter_campaigns"("notify_campaign_id");

-- CreateIndex
CREATE INDEX "newsletter_campaigns_status_idx" ON "newsletter_campaigns"("status");

-- CreateIndex
CREATE INDEX "newsletter_campaigns_type_idx" ON "newsletter_campaigns"("type");

-- CreateIndex
CREATE INDEX "newsletter_campaigns_sent_at_idx" ON "newsletter_campaigns"("sent_at");

-- CreateIndex
CREATE INDEX "newsletter_campaigns_notify_campaign_id_idx" ON "newsletter_campaigns"("notify_campaign_id");

-- CreateIndex
CREATE INDEX "media_analytics_mediaPostId_idx" ON "media_analytics"("mediaPostId");

-- CreateIndex
CREATE INDEX "media_analytics_date_idx" ON "media_analytics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "media_analytics_mediaPostId_date_key" ON "media_analytics"("mediaPostId", "date");

-- AddForeignKey
ALTER TABLE "social_media_accounts" ADD CONSTRAINT "social_media_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_media_posts" ADD CONSTRAINT "social_media_posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_media_posts" ADD CONSTRAINT "social_media_posts_mediaPostId_fkey" FOREIGN KEY ("mediaPostId") REFERENCES "media_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_generated_posts" ADD CONSTRAINT "n8n_generated_posts_n8nArticleId_fkey" FOREIGN KEY ("n8nArticleId") REFERENCES "n8n_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_generated_posts" ADD CONSTRAINT "n8n_generated_posts_mediaPostId_fkey" FOREIGN KEY ("mediaPostId") REFERENCES "media_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_posts" ADD CONSTRAINT "media_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_posts" ADD CONSTRAINT "media_posts_n8nArticleId_fkey" FOREIGN KEY ("n8nArticleId") REFERENCES "n8n_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
