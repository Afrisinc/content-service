import type { Prisma } from '@prisma/client';
import { aiUsageRepository } from '@/repositories/aiUsage.repository';
import { logger } from '@/utils/logger';
import type { IUsageRecorder, UsageEvent } from '@/nodes/core';

export interface PrismaUsageRecorderOptions {
  batchSize?: number;
  flushIntervalMs?: number;
  /** Hard ceiling on the queue: a database outage must not turn into memory pressure. */
  maxQueueSize?: number;
}

export interface BatchingUsageRecorder extends IUsageRecorder {
  flush(): Promise<void>;
  stop(): Promise<void>;
}

function toRow(event: UsageEvent): Prisma.AiUsageLogCreateManyInput {
  return {
    node: event.node,
    model: event.model,
    resource: event.resource,
    operation: event.operation,
    user_id: event.userId,
    session_id: event.sessionId,
    request_id: event.requestId,
    input_tokens: event.inputTokens,
    output_tokens: event.outputTokens,
    cache_read_tokens: event.cacheReadTokens,
    cache_write_tokens: event.cacheWriteTokens,
    cost_micro_usd: event.costMicroUsd,
    latency_ms: event.latencyMs,
    success: event.success,
    cached: event.cached,
    error_code: event.errorCode,
  };
}

/**
 * Buffers usage events and writes them with `createMany`. Nothing here is awaited by the
 * request: the generation has already succeeded, so a ledger failure is logged and the batch
 * dropped rather than surfaced to the caller.
 */
export function createPrismaUsageRecorder(
  options: PrismaUsageRecorderOptions = {}
): BatchingUsageRecorder {
  const batchSize = options.batchSize ?? 50;
  const flushIntervalMs = options.flushIntervalMs ?? 2000;
  const maxQueueSize = options.maxQueueSize ?? 5000;

  let queue: UsageEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (queue.length === 0) {
      return;
    }

    const batch = queue;
    queue = [];

    try {
      await aiUsageRepository.createMany(batch.map(toRow));
    } catch (error) {
      logger.warn(
        { events: batch.length, error: error instanceof Error ? error.message : String(error) },
        '[ai-usage] failed to persist a batch, dropping it'
      );
    }
  };

  const schedule = (): void => {
    if (timer) {
      return;
    }
    timer = setTimeout(() => void flush(), flushIntervalMs);
    timer.unref?.();
  };

  return {
    record(event) {
      if (queue.length >= maxQueueSize) {
        logger.warn({ queued: queue.length }, '[ai-usage] queue full, dropping event');
        return;
      }

      queue.push(event);

      if (queue.length >= batchSize) {
        void flush();
        return;
      }

      schedule();
    },
    flush,
    async stop() {
      await flush();
    },
  };
}
