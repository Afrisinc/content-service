import { randomUUID } from 'node:crypto';
import type { StudioQueue } from './topology';

export interface StudioMessage<T = unknown> {
  messageId: string;
  queue: StudioQueue;
  productionId: string;
  idempotencyKey: string;
  attempt: number;
  correlationId: string;
  enqueuedAt: string;
  payload: T;
}

export function buildMessage<T>(input: {
  queue: StudioQueue;
  productionId: string;
  payload: T;
  idempotencyKey?: string;
  correlationId?: string;
  attempt?: number;
}): StudioMessage<T> {
  return {
    messageId: randomUUID(),
    queue: input.queue,
    productionId: input.productionId,
    idempotencyKey: input.idempotencyKey ?? `${input.queue}:${input.productionId}`,
    attempt: input.attempt ?? 1,
    correlationId: input.correlationId ?? randomUUID(),
    enqueuedAt: new Date().toISOString(),
    payload: input.payload,
  };
}

export function parseMessage<T>(raw: Buffer): StudioMessage<T> {
  return JSON.parse(raw.toString('utf8')) as StudioMessage<T>;
}
