-- CreateTable
CREATE TABLE "agent_settings" (
    "agentKey" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agent_settings_pkey" PRIMARY KEY ("agentKey")
);
