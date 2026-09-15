-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('DRAFT', 'PLANNING', 'SCRIPT_READY', 'ASSETS_GENERATING', 'ASSETS_READY', 'AUDIO_GENERATING', 'AUDIO_READY', 'ANIMATION_READY', 'RENDERING', 'POST_PROCESSING', 'QUALITY_CHECK', 'APPROVED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'RETRYING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnimationMode" AS ENUM ('TWO_D', 'HYBRID', 'THREE_D', 'AI_VIDEO');

-- CreateEnum
CREATE TYPE "StudioJobStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "StudioAssetKind" AS ENUM ('CHARACTER', 'ENVIRONMENT', 'PROP', 'EFFECT', 'TEXTURE', 'IMAGE', 'AUDIO', 'MUSIC', 'SFX', 'VIDEO');

-- CreateEnum
CREATE TYPE "RenderProfile" AS ENUM ('PREVIEW', 'DRAFT', 'PRODUCTION', 'PREMIUM');

-- CreateEnum
CREATE TYPE "VariantFormat" AS ENUM ('LANDSCAPE_16_9', 'VERTICAL_9_16', 'PORTRAIT_4_5', 'SQUARE_1_1');

-- CreateEnum
CREATE TYPE "QualityVerdict" AS ENUM ('PASSED', 'WARNING', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalStage" AS ENUM ('STORY', 'ASSETS', 'FINAL_VIDEO', 'PUBLISHING');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AudioTrackKind" AS ENUM ('VO', 'DIALOGUE', 'SFX', 'AMBIENCE', 'MUSIC', 'MASTER');

-- CreateEnum
CREATE TYPE "SubtitleFormat" AS ENUM ('SRT', 'ASS', 'VTT');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StoryEpisodeStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "studio_productions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "idea" TEXT NOT NULL,
    "genre" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "audience" TEXT,
    "visualStyle" TEXT NOT NULL DEFAULT 'cinematic stylized 3D',
    "narrationStyle" TEXT,
    "animationMode" "AnimationMode" NOT NULL DEFAULT 'TWO_D',
    "targetDurationSeconds" INTEGER NOT NULL DEFAULT 60,
    "platforms" "SocialPlatform"[] DEFAULT ARRAY[]::"SocialPlatform"[],
    "formats" "VariantFormat"[] DEFAULT ARRAY[]::"VariantFormat"[],
    "contentRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "renderProfile" "RenderProfile" NOT NULL DEFAULT 'PRODUCTION',
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProductionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "reproducibility" JSONB,
    "metadata" JSONB,
    "errorMessage" TEXT,
    "failedStage" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_productions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_stories" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "logline" TEXT NOT NULL,
    "synopsis" TEXT,
    "spec" JSONB NOT NULL,
    "screenplay" JSONB,
    "targetDurationSeconds" INTEGER NOT NULL DEFAULT 60,
    "version" INTEGER NOT NULL DEFAULT 1,
    "moderationVerdict" TEXT,
    "moderationReport" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_characters" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_character_versions" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "appearance" JSONB,
    "assetKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checksum" TEXT,
    "generator" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_character_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_environments" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_environment_versions" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "assetKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checksum" TEXT,
    "generator" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_environment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_props" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "assetKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_props_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_assets" (
    "id" TEXT NOT NULL,
    "productionId" TEXT,
    "kind" "StudioAssetKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "generator" JSONB,
    "licenseId" TEXT,
    "activeVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_asset_versions" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "generator" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_asset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_scenes" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "sceneId" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "environmentId" TEXT,
    "spec" JSONB NOT NULL,
    "cacheKey" TEXT,
    "status" "StudioJobStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_shots" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "shotId" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "camera" JSONB NOT NULL,
    "characters" JSONB,
    "audio" JSONB,
    "spec" JSONB NOT NULL,
    "status" "StudioJobStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_audio_tracks" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "sceneId" TEXT,
    "kind" "AudioTrackKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loudnessLufs" DOUBLE PRECISION,
    "peakDb" DOUBLE PRECISION,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "speaker" TEXT,
    "voice" JSONB,
    "transcript" JSONB,
    "visemes" JSONB,
    "generator" JSONB,
    "status" "StudioJobStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_audio_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_audio_jobs" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "sceneId" TEXT,
    "kind" TEXT NOT NULL,
    "status" "StudioJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "worker" TEXT,
    "errorCode" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_audio_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_animation_jobs" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "mode" "AnimationMode" NOT NULL,
    "engine" TEXT NOT NULL,
    "status" "StudioJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "worker" TEXT,
    "errorCode" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_animation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_render_jobs" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "sceneId" TEXT,
    "engine" TEXT NOT NULL,
    "profile" "RenderProfile" NOT NULL DEFAULT 'PRODUCTION',
    "status" "StudioJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "cacheKey" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "worker" TEXT,
    "errorCode" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_render_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_render_outputs" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "sceneId" TEXT,
    "jobId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'scene',
    "storageKey" TEXT NOT NULL,
    "container" TEXT NOT NULL DEFAULT 'mp4',
    "videoCodec" TEXT,
    "audioCodec" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "fps" DOUBLE PRECISION NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "profile" "RenderProfile" NOT NULL DEFAULT 'PRODUCTION',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_render_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_subtitles" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "format" "SubtitleFormat" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "storageKey" TEXT NOT NULL,
    "cues" JSONB,
    "sourceTrackId" TEXT,
    "burnedIn" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_subtitles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_thumbnails" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "candidateIndex" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "scoreReport" JSONB,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT,
    "generator" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_thumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_platform_variants" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "format" "VariantFormat" NOT NULL,
    "renderOutputId" TEXT,
    "subtitleId" TEXT,
    "thumbnailId" TEXT,
    "storageKey" TEXT,
    "title" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "StudioJobStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_platform_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_publishing_jobs" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "integrationId" TEXT,
    "accountRef" TEXT,
    "status" "StudioJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "scheduledFor" TIMESTAMPTZ,
    "publishedAt" TIMESTAMPTZ,
    "errorCode" TEXT,
    "error" TEXT,
    "response" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_publishing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_quality_checks" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetId" TEXT,
    "verdict" "QualityVerdict" NOT NULL,
    "checks" JSONB NOT NULL,
    "failures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_quality_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_approvals" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "stage" "ApprovalStage" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "reason" TEXT,
    "decidedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_workflow_events" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "fromStatus" "ProductionStatus",
    "toStatus" "ProductionStatus",
    "jobId" TEXT,
    "worker" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_workflow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_model_licenses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT,
    "version" TEXT,
    "license" TEXT NOT NULL,
    "commercialUse" BOOLEAN NOT NULL DEFAULT false,
    "attributionRequired" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_model_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "premise" TEXT NOT NULL,
    "genre" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "audience" TEXT,
    "tone" TEXT,
    "coverImageUrl" TEXT,
    "platforms" "SocialPlatform"[] DEFAULT ARRAY[]::"SocialPlatform"[],
    "autoPromote" BOOLEAN NOT NULL DEFAULT false,
    "autoApprovePromotion" BOOLEAN NOT NULL DEFAULT false,
    "status" "StoryStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_episodes" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cliffhanger" TEXT,
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "promotionCaption" TEXT,
    "promotionHashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promotionDraftId" TEXT,
    "promotionStatus" TEXT,
    "promotionError" TEXT,
    "llmProvider" TEXT,
    "llmAttempts" INTEGER NOT NULL DEFAULT 1,
    "status" "StoryEpisodeStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "story_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_productions_idempotencyKey_key" ON "studio_productions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "studio_productions_userId_createdAt_idx" ON "studio_productions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "studio_productions_status_idx" ON "studio_productions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "studio_stories_productionId_key" ON "studio_stories"("productionId");

-- CreateIndex
CREATE UNIQUE INDEX "studio_characters_productionId_slug_key" ON "studio_characters"("productionId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "studio_character_versions_characterId_version_key" ON "studio_character_versions"("characterId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "studio_environments_productionId_slug_key" ON "studio_environments"("productionId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "studio_environment_versions_environmentId_version_key" ON "studio_environment_versions"("environmentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "studio_props_productionId_slug_key" ON "studio_props"("productionId", "slug");

-- CreateIndex
CREATE INDEX "studio_assets_productionId_kind_idx" ON "studio_assets"("productionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "studio_assets_checksum_kind_key" ON "studio_assets"("checksum", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "studio_asset_versions_assetId_version_key" ON "studio_asset_versions"("assetId", "version");

-- CreateIndex
CREATE INDEX "studio_scenes_productionId_index_idx" ON "studio_scenes"("productionId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "studio_scenes_productionId_sceneId_key" ON "studio_scenes"("productionId", "sceneId");

-- CreateIndex
CREATE INDEX "studio_shots_sceneId_index_idx" ON "studio_shots"("sceneId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "studio_shots_sceneId_shotId_key" ON "studio_shots"("sceneId", "shotId");

-- CreateIndex
CREATE INDEX "studio_audio_tracks_productionId_kind_idx" ON "studio_audio_tracks"("productionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "studio_audio_jobs_idempotencyKey_key" ON "studio_audio_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "studio_audio_jobs_productionId_status_idx" ON "studio_audio_jobs"("productionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "studio_animation_jobs_idempotencyKey_key" ON "studio_animation_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "studio_animation_jobs_productionId_status_idx" ON "studio_animation_jobs"("productionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "studio_render_jobs_idempotencyKey_key" ON "studio_render_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "studio_render_jobs_productionId_status_idx" ON "studio_render_jobs"("productionId", "status");

-- CreateIndex
CREATE INDEX "studio_render_jobs_cacheKey_idx" ON "studio_render_jobs"("cacheKey");

-- CreateIndex
CREATE INDEX "studio_render_outputs_productionId_kind_idx" ON "studio_render_outputs"("productionId", "kind");

-- CreateIndex
CREATE INDEX "studio_subtitles_productionId_format_idx" ON "studio_subtitles"("productionId", "format");

-- CreateIndex
CREATE INDEX "studio_thumbnails_productionId_selected_idx" ON "studio_thumbnails"("productionId", "selected");

-- CreateIndex
CREATE UNIQUE INDEX "studio_platform_variants_productionId_platform_format_key" ON "studio_platform_variants"("productionId", "platform", "format");

-- CreateIndex
CREATE UNIQUE INDEX "studio_publishing_jobs_idempotencyKey_key" ON "studio_publishing_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "studio_publishing_jobs_productionId_status_idx" ON "studio_publishing_jobs"("productionId", "status");

-- CreateIndex
CREATE INDEX "studio_publishing_jobs_status_scheduledFor_idx" ON "studio_publishing_jobs"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "studio_quality_checks_productionId_target_idx" ON "studio_quality_checks"("productionId", "target");

-- CreateIndex
CREATE UNIQUE INDEX "studio_approvals_productionId_stage_key" ON "studio_approvals"("productionId", "stage");

-- CreateIndex
CREATE INDEX "studio_workflow_events_productionId_createdAt_idx" ON "studio_workflow_events"("productionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "studio_model_licenses_name_version_key" ON "studio_model_licenses"("name", "version");

-- CreateIndex
CREATE INDEX "stories_userId_createdAt_idx" ON "stories"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "stories_status_idx" ON "stories"("status");

-- CreateIndex
CREATE INDEX "story_episodes_storyId_episodeNumber_idx" ON "story_episodes"("storyId", "episodeNumber");

-- CreateIndex
CREATE INDEX "story_episodes_status_idx" ON "story_episodes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "story_episodes_storyId_episodeNumber_key" ON "story_episodes"("storyId", "episodeNumber");

-- AddForeignKey
ALTER TABLE "studio_stories" ADD CONSTRAINT "studio_stories_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_characters" ADD CONSTRAINT "studio_characters_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_character_versions" ADD CONSTRAINT "studio_character_versions_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "studio_characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_environments" ADD CONSTRAINT "studio_environments_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_environment_versions" ADD CONSTRAINT "studio_environment_versions_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "studio_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_props" ADD CONSTRAINT "studio_props_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_assets" ADD CONSTRAINT "studio_assets_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_assets" ADD CONSTRAINT "studio_assets_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "studio_model_licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_asset_versions" ADD CONSTRAINT "studio_asset_versions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "studio_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_scenes" ADD CONSTRAINT "studio_scenes_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_scenes" ADD CONSTRAINT "studio_scenes_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "studio_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_shots" ADD CONSTRAINT "studio_shots_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "studio_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_audio_tracks" ADD CONSTRAINT "studio_audio_tracks_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_audio_tracks" ADD CONSTRAINT "studio_audio_tracks_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "studio_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_audio_jobs" ADD CONSTRAINT "studio_audio_jobs_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_audio_jobs" ADD CONSTRAINT "studio_audio_jobs_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "studio_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_animation_jobs" ADD CONSTRAINT "studio_animation_jobs_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_animation_jobs" ADD CONSTRAINT "studio_animation_jobs_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "studio_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_render_jobs" ADD CONSTRAINT "studio_render_jobs_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_render_jobs" ADD CONSTRAINT "studio_render_jobs_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "studio_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_render_outputs" ADD CONSTRAINT "studio_render_outputs_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_render_outputs" ADD CONSTRAINT "studio_render_outputs_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "studio_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_render_outputs" ADD CONSTRAINT "studio_render_outputs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "studio_render_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_subtitles" ADD CONSTRAINT "studio_subtitles_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_thumbnails" ADD CONSTRAINT "studio_thumbnails_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_platform_variants" ADD CONSTRAINT "studio_platform_variants_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_platform_variants" ADD CONSTRAINT "studio_platform_variants_renderOutputId_fkey" FOREIGN KEY ("renderOutputId") REFERENCES "studio_render_outputs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_platform_variants" ADD CONSTRAINT "studio_platform_variants_subtitleId_fkey" FOREIGN KEY ("subtitleId") REFERENCES "studio_subtitles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_platform_variants" ADD CONSTRAINT "studio_platform_variants_thumbnailId_fkey" FOREIGN KEY ("thumbnailId") REFERENCES "studio_thumbnails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_publishing_jobs" ADD CONSTRAINT "studio_publishing_jobs_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_publishing_jobs" ADD CONSTRAINT "studio_publishing_jobs_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "studio_platform_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_quality_checks" ADD CONSTRAINT "studio_quality_checks_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_approvals" ADD CONSTRAINT "studio_approvals_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_workflow_events" ADD CONSTRAINT "studio_workflow_events_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "studio_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_episodes" ADD CONSTRAINT "story_episodes_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
