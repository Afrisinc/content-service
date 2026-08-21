-- A brand asset becomes a named set of photographs; each photograph moves into
-- its own row. Every existing asset survives as a one-image set, so nothing in
-- the library is lost and the ids brands already point at stay valid.

-- CreateTable
CREATE TABLE "brand_asset_images" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasPerson" BOOLEAN NOT NULL DEFAULT false,
    "subjectSide" TEXT,
    "brightness" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "brand_asset_images_pkey" PRIMARY KEY ("id")
);

-- Carry every existing photograph into the new table, keeping its tags,
-- framing and usage history. gen_random_uuid() ships with Postgres 13+.
INSERT INTO "brand_asset_images" (
    "id", "assetId", "url", "reference", "subjects",
    "hasPerson", "subjectSide", "brightness", "usageCount", "lastUsedAt",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(), "id", "url", "reference", "subjects",
    "hasPerson", "subjectSide", "brightness", "usageCount", "lastUsedAt",
    "createdAt", "updatedAt"
FROM "brand_assets";

-- The set keeps the old reference as its name until someone renames it.
ALTER TABLE "brand_assets" ADD COLUMN "name" TEXT;
ALTER TABLE "brand_assets" ADD COLUMN "description" TEXT;
UPDATE "brand_assets" SET "name" = "reference" WHERE "name" IS NULL;
ALTER TABLE "brand_assets" ALTER COLUMN "name" SET NOT NULL;

-- The per-image columns now live on brand_asset_images.
DROP INDEX IF EXISTS "brand_assets_reference_key";
DROP INDEX IF EXISTS "brand_assets_lastUsedAt_idx";
ALTER TABLE "brand_assets" DROP COLUMN "url";
ALTER TABLE "brand_assets" DROP COLUMN "reference";
ALTER TABLE "brand_assets" DROP COLUMN "subjects";
ALTER TABLE "brand_assets" DROP COLUMN "hasPerson";
ALTER TABLE "brand_assets" DROP COLUMN "subjectSide";
ALTER TABLE "brand_assets" DROP COLUMN "brightness";
ALTER TABLE "brand_assets" DROP COLUMN "usageCount";
ALTER TABLE "brand_assets" DROP COLUMN "lastUsedAt";

-- CreateIndex
CREATE UNIQUE INDEX "brand_asset_images_reference_key" ON "brand_asset_images"("reference");
CREATE INDEX "brand_asset_images_assetId_idx" ON "brand_asset_images"("assetId");
CREATE INDEX "brand_asset_images_lastUsedAt_idx" ON "brand_asset_images"("lastUsedAt");

-- AddForeignKey
ALTER TABLE "brand_asset_images" ADD CONSTRAINT "brand_asset_images_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "brand_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
