import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import {
  createSummarisingChatMemory,
  type IChatMemory,
  type IUsageRecorder,
  type NodeServices,
  type UsageEvent,
} from '@/nodes/core';
import { createClaudeSummariser } from './claudeSummariser';
import { createLoggingUsageRecorder } from './loggingUsageRecorder';
import { createPrismaUsageRecorder, type BatchingUsageRecorder } from './prismaUsageRecorder';
import { createRedisBudgetGuard } from './redisBudgetGuard';
import { createRedisChatMemory } from './redisChatMemory';
import { createRedisResponseCache } from './redisResponseCache';

/** Fans one event out to every recorder; a failing one must not stop the others. */
function composeRecorders(recorders: IUsageRecorder[]): IUsageRecorder {
  return {
    record(event: UsageEvent) {
      for (const recorder of recorders) {
        try {
          recorder.record(event);
        } catch (error) {
          logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            '[ai-usage] a recorder threw and was skipped'
          );
        }
      }
    },
  };
}

const ledger: BatchingUsageRecorder = createPrismaUsageRecorder();

/**
 * Summarising costs a model call per fold, so it is opt-in. Without it a long thread simply
 * loses its oldest turns, which is the right default for short exchanges.
 */
function buildMemory(): IChatMemory {
  const memory = createRedisChatMemory({
    maxTurns: env.AI_MEMORY_MAX_TURNS,
    ttlSeconds: env.AI_MEMORY_TTL_SECONDS,
  });

  if (!env.AI_MEMORY_SUMMARISE) {
    return memory;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn({}, '[ai-memory] summarising requested but ANTHROPIC_API_KEY is unset');
    return memory;
  }

  return createSummarisingChatMemory({
    inner: memory,
    summarise: createClaudeSummariser({ model: env.AI_MEMORY_SUMMARY_MODEL }),
    keepRecentTurns: env.AI_MEMORY_KEEP_RECENT_TURNS,
    summariseAfterTurns: env.AI_MEMORY_SUMMARISE_AFTER_TURNS,
    logger,
  });
}

/**
 * The adapters this service supplies to the AI nodes. Everything degrades on its own:
 * without Redis there is no memory or cache, without a budget limit there is no guard, and
 * the nodes keep working in every case.
 */
export const nodeServices: NodeServices = {
  memory: buildMemory(),
  cache: createRedisResponseCache(),
  usage: composeRecorders([createLoggingUsageRecorder(), ledger]),
  ...(env.AI_DAILY_BUDGET_MICRO_USD > 0
    ? {
        budget: createRedisBudgetGuard({
          dailyLimitMicroUsd: BigInt(env.AI_DAILY_BUDGET_MICRO_USD),
        }),
      }
    : {}),
};

/** Flushes anything still queued. Call it during shutdown, before the database closes. */
export async function flushNodeUsage(): Promise<void> {
  await ledger.stop();
}
