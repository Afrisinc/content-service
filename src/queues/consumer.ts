import type { ConsumeMessage } from 'amqplib';
import { logger } from '@/utils/logger';
import { recordJobResult } from '@/observability/metrics';
import { getChannel } from './connection';
import { classifyError, errorCodeOf, isRetryable } from './errors';
import { parseMessage, type StudioMessage } from './message';
import { republishWithDelay } from './publisher';
import { MAX_ATTEMPTS, queueDefinition, type StudioQueue } from './topology';

export type JobHandler<T> = (message: StudioMessage<T>) => Promise<void>;

export interface ConsumerRegistration {
  queue: StudioQueue;
  handler: JobHandler<unknown>;
}

const registrations = new Map<StudioQueue, JobHandler<unknown>>();

export function registerHandler<T>(queue: StudioQueue, handler: JobHandler<T>): void {
  registrations.set(queue, handler as JobHandler<unknown>);
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function handleDelivery(queue: StudioQueue, raw: ConsumeMessage): Promise<'ack' | 'drop'> {
  const definition = queueDefinition(queue);
  const handler = registrations.get(queue);
  if (!handler) {
    logger.error({ queue }, 'studio.job.no_handler');
    return 'drop';
  }

  const message = parseMessage(raw.content);
  const startedAt = Date.now();

  try {
    await withTimeout(handler(message), definition.timeoutMs, queue);
    recordJobResult(queue, 'succeeded', Date.now() - startedAt);
    logger.info(
      {
        queue,
        productionId: message.productionId,
        attempt: message.attempt,
        durationMs: Date.now() - startedAt,
      },
      'studio.job.succeeded'
    );
    return 'ack';
  } catch (err) {
    const errorClass = classifyError(err);
    const nextAttempt = message.attempt + 1;
    const canRetry = isRetryable(err) && nextAttempt <= MAX_ATTEMPTS;

    logger.error(
      {
        queue,
        productionId: message.productionId,
        attempt: message.attempt,
        errorClass,
        errorCode: errorCodeOf(err),
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      },
      canRetry ? 'studio.job.failed_retrying' : 'studio.job.failed_final'
    );

    if (canRetry) {
      recordJobResult(queue, 'retried', Date.now() - startedAt);
      await republishWithDelay(message, nextAttempt);
      return 'ack';
    }

    recordJobResult(queue, 'failed', Date.now() - startedAt);
    return 'drop';
  }
}

export async function startConsumer(queue: StudioQueue): Promise<void> {
  const definition = queueDefinition(queue);
  const channel = await getChannel();
  await channel.prefetch(definition.prefetch);

  await channel.consume(
    queue,
    async raw => {
      if (!raw) {
        return;
      }
      const outcome = await handleDelivery(queue, raw);
      if (outcome === 'ack') {
        channel.ack(raw);
      } else {
        channel.nack(raw, false, false);
      }
    },
    { noAck: false }
  );

  logger.info(
    { queue, prefetch: definition.prefetch, gpuBound: definition.gpuBound },
    'studio.consumer.started'
  );
}

export async function startConsumers(queues: StudioQueue[]): Promise<void> {
  for (const queue of queues) {
    await startConsumer(queue);
  }
}

export function registeredQueues(): StudioQueue[] {
  return [...registrations.keys()];
}
