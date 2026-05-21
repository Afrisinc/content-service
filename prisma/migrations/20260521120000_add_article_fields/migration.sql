-- Add AI enhancement fields to n8n_articles table
-- These fields are populated by n8n WF2 when an article is processed

ALTER TABLE "n8n_articles"
ADD COLUMN "slug" TEXT,
ADD COLUMN "ai_generated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}',
ADD COLUMN "read_time" INTEGER NOT NULL DEFAULT 1;

-- Unique constraint on slug (nullable unique)
CREATE UNIQUE INDEX "n8n_articles_slug_key" ON "n8n_articles"("slug");

-- Index for slug lookups
CREATE INDEX "n8n_articles_slug_idx" ON "n8n_articles"("slug");
