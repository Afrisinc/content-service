-- AlterTable
ALTER TABLE "automation_policies" ADD COLUMN     "agents" JSONB NOT NULL DEFAULT '{}';
