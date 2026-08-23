ALTER TABLE "brand_assets" ADD COLUMN "userId" TEXT;
ALTER TABLE "brand_asset_images" ADD COLUMN "userId" TEXT;

UPDATE "brand_assets"
SET "userId" = (SELECT "id" FROM "users" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;

UPDATE "brand_asset_images" AS i
SET "userId" = a."userId"
FROM "brand_assets" AS a
WHERE i."assetId" = a."id" AND i."userId" IS NULL;

DROP INDEX IF EXISTS "brand_asset_images_reference_key";
CREATE UNIQUE INDEX "brand_asset_images_userId_reference_key"
  ON "brand_asset_images" ("userId", "reference");

CREATE INDEX "brand_assets_userId_idx" ON "brand_assets" ("userId");
CREATE INDEX "brand_asset_images_userId_idx" ON "brand_asset_images" ("userId");
