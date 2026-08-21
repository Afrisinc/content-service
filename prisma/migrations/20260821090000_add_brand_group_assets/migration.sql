-- CreateTable
CREATE TABLE "account_group_assets" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_group_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_group_assets_groupId_assetId_key" ON "account_group_assets"("groupId", "assetId");
CREATE INDEX "account_group_assets_assetId_idx" ON "account_group_assets"("assetId");

-- AddForeignKey
ALTER TABLE "account_group_assets" ADD CONSTRAINT "account_group_assets_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "account_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_group_assets" ADD CONSTRAINT "account_group_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "brand_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
