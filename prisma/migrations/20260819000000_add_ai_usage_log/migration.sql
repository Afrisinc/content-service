-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "user_id" TEXT,
    "session_id" TEXT,
    "request_id" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micro_usd" BIGINT NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_logs_user_id_created_at_idx" ON "ai_usage_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_model_created_at_idx" ON "ai_usage_logs"("model", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_node_created_at_idx" ON "ai_usage_logs"("node", "created_at");

