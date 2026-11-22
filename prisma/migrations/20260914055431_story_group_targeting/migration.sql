-- AlterTable
ALTER TABLE "stories" DROP COLUMN "platforms",
ADD COLUMN     "groupId" TEXT;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "account_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

