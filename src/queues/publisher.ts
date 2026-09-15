import { logger } from '@/utils/logger';
import { getChannel } from './connection';
import { buildMessage, type StudioMessage } from './message';
import {
  RETRY_DELAYS_MS,
  STUDIO_EXCHANGE,
  STUDIO_RETRY_EXCHANGE,
  type StudioQueue,
} from './topology';

export interface PublishOptions {
  productionId: string;
  idempotencyKey?: string;
  correlationId?: string;
  priority?: number;
}

export async function publishJob<T>(
  queue: StudioQueue,
  payload: T,
  options: PublishOptions
): Promise<StudioMessage<T>> {
  const message = buildMessage({ queue, payload, ...options });
  const channel = await getChannel();

  channel.publish(STUDIO_EXCHANGE, queue, Buffer.from(JSON.stringify(message)), {
    persistent: true,
    contentType: 'application/json',
    messageId: message.messageId,
    correlationId: message.correlationId,
    headers: {
      'x-idempotency-key': message.idempotencyKey,
      'x-production-id': message.productionId,
      'x-attempt': message.attempt,
    },
    priority: options.priority,
  });

  logger.info(
    { queue, productionId: options.productionId, messageId: message.messageId },
    'studio.job.published'
  );
  return message;
}

export async function republishWithDelay<T>(
  message: StudioMessage<T>,
  attempt: number
): Promise<void> {
  const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const channel = await getChannel();
  const next: StudioMessage<T> = { ...message, attempt };

  channel.publish(
    STUDIO_RETRY_EXCHANGE,
    `${delay}.${message.queue}`,
    Buffer.from(JSON.stringify(next)),
    {
      persistent: true,
      contentType: 'application/json',
      messageId: next.messageId,
      correlationId: next.correlationId,
      headers: {
        'x-idempotency-key': next.idempotencyKey,
        'x-production-id': next.productionId,
        'x-attempt': attempt,
        'x-original-queue': message.queue,
      },
    }
  );

  logger.warn(
    { queue: message.queue, attempt, delayMs: delay, messageId: message.messageId },
    'studio.job.retry_scheduled'
  );
}
