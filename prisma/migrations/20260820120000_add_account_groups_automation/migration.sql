-- CreateEnum
CREATE TYPE "AutomationMode" AS ENUM ('manual', 'autopilot');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('running', 'succeeded', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "account_groups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slotWeekdays" TEXT NOT NULL DEFAULT '2,5',
    "slotHour" INTEGER NOT NULL DEFAULT 9,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "postsPerRun" INTEGER NOT NULL DEFAULT 1,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceLine" TEXT,
    "audience" TEXT,
    "defaultFormat" TEXT NOT NULL DEFAULT 'post',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_policies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "AutomationMode" NOT NULL DEFAULT 'manual',
    "autoPublish" BOOLEAN NOT NULL DEFAULT true,
    "defaultGroupId" TEXT,
    "maxPostsPerDay" INTEGER NOT NULL DEFAULT 3,
    "pausedUntil" TIMESTAMPTZ,
    "lastRunAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "automation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT,
    "agent" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'running',
    "topic" TEXT,
    "draftId" TEXT,
    "postIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accountsTargeted" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_groups_userId_slug_key" ON "account_groups"("userId", "slug");
CREATE INDEX "account_groups_userId_isActive_idx" ON "account_groups"("userId", "isActive");
CREATE INDEX "account_groups_autopilotEnabled_idx" ON "account_groups"("autopilotEnabled");

CREATE UNIQUE INDEX "account_group_members_groupId_accountId_key" ON "account_group_members"("groupId", "accountId");
CREATE INDEX "account_group_members_accountId_idx" ON "account_group_members"("accountId");
CREATE INDEX "account_group_members_groupId_isActive_idx" ON "account_group_members"("groupId", "isActive");

CREATE UNIQUE INDEX "automation_policies_userId_key" ON "automation_policies"("userId");

CREATE INDEX "agent_runs_userId_startedAt_idx" ON "agent_runs"("userId", "startedAt");
CREATE INDEX "agent_runs_groupId_startedAt_idx" ON "agent_runs"("groupId", "startedAt");
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");

-- AddForeignKey
ALTER TABLE "account_group_members" ADD CONSTRAINT "account_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "account_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_group_members" ADD CONSTRAINT "account_group_members_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "social_media_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "account_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
