-- Baseline for post_drafts and brand_assets.
--
-- Both models shipped in the schema without a migration — they were created
-- with `prisma db push` — so the chain could not be replayed on a fresh
-- database and any later ALTER against them failed. This fills the gap.
--
-- CreateEnum
CREATE TYPE "PostDraftStatus" AS ENUM ('drafting', 'rendered', 'awaiting_approval', 'approved', 'scheduled', 'rejected', 'failed');

-- CreateTable
CREATE TABLE "post_drafts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'post',
    "serviceLine" TEXT,
    "offer" TEXT,
    "audience" TEXT,
    "status" "PostDraftStatus" NOT NULL DEFAULT 'drafting',
    "spec" JSONB NOT NULL,
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "claims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "claimsApproved" BOOLEAN NOT NULL DEFAULT false,
    "auditReport" JSONB,
    "auditPassed" BOOLEAN NOT NULL DEFAULT false,
    "slideUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMPTZ,
    "scheduledAt" TIMESTAMPTZ,
    "socialPostIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "costMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "generationTries" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "post_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_assets" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'photo',
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasPerson" BOOLEAN NOT NULL DEFAULT false,
    "subjectSide" TEXT,
    "brightness" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "brand_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_drafts_userId_createdAt_idx" ON "post_drafts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "post_drafts_status_idx" ON "post_drafts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "brand_assets_reference_key" ON "brand_assets"("reference");

-- CreateIndex
CREATE INDEX "brand_assets_kind_approved_idx" ON "brand_assets"("kind", "approved");

-- CreateIndex
CREATE INDEX "brand_assets_lastUsedAt_idx" ON "brand_assets"("lastUsedAt");

