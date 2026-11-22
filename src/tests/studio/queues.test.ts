import { describe, expect, it } from 'vitest';
import {
  classifyError,
  errorCodeOf,
  isRetryable,
  PermanentJobError,
  TransientJobError,
} from '@/queues/errors';
import { buildMessage, parseMessage } from '@/queues/message';
import {
  MAX_ATTEMPTS,
  QUEUE_DEFINITIONS,
  queueDefinition,
  retryQueueName,
} from '@/queues/topology';
import { extractJson } from '@/studio/directors/structured';

describe('error classification', () => {
  it('classifies explicit permanent errors', () => {
    expect(classifyError(new PermanentJobError('bad schema'))).toBe('permanent');
    expect(isRetryable(new PermanentJobError('bad schema'))).toBe(false);
  });

  it('classifies explicit transient errors', () => {
    expect(classifyError(new TransientJobError('blip'))).toBe('transient');
    expect(isRetryable(new TransientJobError('blip'))).toBe(true);
  });

  it('treats network failures as transient', () => {
    expect(classifyError(new Error('connect ECONNREFUSED 127.0.0.1:5672'))).toBe('transient');
    expect(classifyError(new Error('request failed with status 503'))).toBe('transient');
  });

  it('treats validation and auth failures as permanent', () => {
    expect(classifyError(new Error('scene validation failed'))).toBe('permanent');
    expect(classifyError(new Error('403 forbidden'))).toBe('permanent');
    expect(classifyError(new Error('moderation rejected the brief'))).toBe('permanent');
  });

  it('retries an unclassified failure', () => {
    expect(classifyError(new Error('something odd'))).toBe('unknown');
    expect(isRetryable(new Error('something odd'))).toBe(true);
  });

  it('reports a usable error code', () => {
    expect(errorCodeOf(new PermanentJobError('x', 'SCHEMA'))).toBe('SCHEMA');
    expect(errorCodeOf(new TypeError('x'))).toBe('TypeError');
    expect(errorCodeOf('plain string')).toBe('UNKNOWN');
  });
});

describe('queue topology', () => {
  it('defines every queue exactly once', () => {
    const names = QUEUE_DEFINITIONS.map(definition => definition.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('caps gpu-bound queues at a prefetch of one', () => {
    for (const definition of QUEUE_DEFINITIONS.filter(entry => entry.gpuBound)) {
      expect(definition.prefetch).toBeLessThanOrEqual(1);
    }
  });

  it('gives the 3d render queue the longest timeout', () => {
    const render = queueDefinition('animation.render.3d');
    const other = QUEUE_DEFINITIONS.filter(entry => entry.name !== 'animation.render.3d');
    expect(other.every(entry => entry.timeoutMs <= render.timeoutMs)).toBe(true);
  });

  it('throws on an unknown queue', () => {
    expect(() => queueDefinition('nope' as never)).toThrow(/unknown studio queue/);
  });

  it('names retry queues by their delay', () => {
    expect(retryQueueName(30000)).toBe('studio.retry.30000');
  });

  it('allows four attempts before the dead-letter queue', () => {
    expect(MAX_ATTEMPTS).toBe(4);
  });
});

describe('studio messages', () => {
  it('round-trips through the wire', () => {
    const message = buildMessage({
      queue: 'story.generate',
      productionId: 'p1',
      payload: { a: 1 },
    });
    const parsed = parseMessage<{ a: number }>(Buffer.from(JSON.stringify(message)));
    expect(parsed.payload.a).toBe(1);
    expect(parsed.productionId).toBe('p1');
  });

  it('derives a default idempotency key from the queue and production', () => {
    const message = buildMessage({ queue: 'qa.inspect', productionId: 'p1', payload: {} });
    expect(message.idempotencyKey).toBe('qa.inspect:p1');
  });

  it('keeps an explicit idempotency key', () => {
    const message = buildMessage({
      queue: 'qa.inspect',
      productionId: 'p1',
      payload: {},
      idempotencyKey: 'custom',
    });
    expect(message.idempotencyKey).toBe('custom');
  });

  it('starts at attempt one', () => {
    expect(buildMessage({ queue: 'qa.inspect', productionId: 'p1', payload: {} }).attempt).toBe(1);
  });
});

describe('structured output extraction', () => {
  it('reads a bare object', () => {
    expect(JSON.parse(extractJson('{"a":1}'))).toEqual({ a: 1 });
  });

  it('strips a fenced block', () => {
    expect(JSON.parse(extractJson('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
  });

  it('ignores prose around the object', () => {
    expect(JSON.parse(extractJson('Here you go:\n{"a":1}\nHope that helps.'))).toEqual({ a: 1 });
  });

  it('keeps braces that live inside strings', () => {
    expect(JSON.parse(extractJson('{"a":"} not the end {"}'))).toEqual({ a: '} not the end {' });
  });

  it('handles escaped quotes inside strings', () => {
    expect(JSON.parse(extractJson('{"a":"say \\"hi\\""}'))).toEqual({ a: 'say "hi"' });
  });

  it('reads a top-level array', () => {
    expect(JSON.parse(extractJson('[{"a":1}]'))).toEqual([{ a: 1 }]);
  });
});
