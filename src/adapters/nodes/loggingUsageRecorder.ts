import { logger } from '@/utils/logger';
import type { IUsageRecorder, UsageEvent } from '@/nodes/core';

const MICRO_USD_PER_USD = 1_000_000;

/** Records spend to the log only. Use it before the ledger exists, or as a fallback. */
export function createLoggingUsageRecorder(): IUsageRecorder {
  return {
    record(event: UsageEvent) {
      logger.info(
        {
          node: event.node,
          model: event.model,
          operation: `${event.resource}:${event.operation}`,
          userId: event.userId,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          costUsd: Number(event.costMicroUsd) / MICRO_USD_PER_USD,
          latencyMs: event.latencyMs,
          success: event.success,
          cached: event.cached,
          errorCode: event.errorCode,
        },
        '[ai-usage] call recorded'
      );
    },
  };
}
