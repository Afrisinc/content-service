import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaUsageRecorder } from '@/adapters/nodes/prismaUsageRecorder';
import type { UsageEvent } from '@/nodes/core';

const { createMany } = vi.hoisted(() => ({ createMany: vi.fn() }));

vi.mock('@/repositories/aiUsage.repository', () => ({
  aiUsageRepository: { createMany },
}));

const event = (overrides: Partial<UsageEvent> = {}): UsageEvent => ({
  node: 'claude',
  model: 'claude-opus-5',
  resource: 'text',
  operation: 'message',
  userId: 'user-1',
  sessionId: null,
  requestId: null,
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costMicroUsd: 1_750n,
  latencyMs: 900,
  success: true,
  cached: false,
  errorCode: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  createMany.mockResolvedValue(1);
  vi.useFakeTimers();
});

afterEach(() => vi.useRealTimers());

describe('createPrismaUsageRecorder', () => {
  it('writes nothing until the batch fills or the interval elapses', () => {
    const recorder = createPrismaUsageRecorder({ batchSize: 3, flushIntervalMs: 2000 });

    recorder.record(event());
    recorder.record(event());

    expect(createMany).not.toHaveBeenCalled();
  });

  it('flushes as soon as the batch is full', async () => {
    const recorder = createPrismaUsageRecorder({ batchSize: 2 });

    recorder.record(event());
    recorder.record(event());
    await vi.runAllTimersAsync();

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0]).toHaveLength(2);
  });

  it('flushes on the interval when the batch never fills', async () => {
    const recorder = createPrismaUsageRecorder({ batchSize: 50, flushIntervalMs: 1000 });

    recorder.record(event());
    await vi.advanceTimersByTimeAsync(1000);

    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it('maps the event onto the ledger row, money included', async () => {
    const recorder = createPrismaUsageRecorder({ batchSize: 1 });

    recorder.record(event({ sessionId: 'sess-1', requestId: 'req-1', cached: true }));
    await vi.runAllTimersAsync();

    expect(createMany.mock.calls[0][0][0]).toEqual({
      node: 'claude',
      model: 'claude-opus-5',
      resource: 'text',
      operation: 'message',
      user_id: 'user-1',
      session_id: 'sess-1',
      request_id: 'req-1',
      input_tokens: 100,
      output_tokens: 50,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost_micro_usd: 1_750n,
      latency_ms: 900,
      success: true,
      cached: true,
      error_code: null,
    });
  });

  it('drops a batch the database refuses instead of surfacing it', async () => {
    createMany.mockRejectedValue(new Error('connection refused'));
    const recorder = createPrismaUsageRecorder({ batchSize: 1 });

    recorder.record(event());
    await expect(vi.runAllTimersAsync()).resolves.toBeDefined();

    recorder.record(event());
    await vi.runAllTimersAsync();
    expect(createMany).toHaveBeenCalledTimes(2);
  });

  it('refuses to grow without bound while the database is unreachable', () => {
    const recorder = createPrismaUsageRecorder({ batchSize: 1000, maxQueueSize: 2 });

    recorder.record(event());
    recorder.record(event());
    recorder.record(event());

    expect(createMany).not.toHaveBeenCalled();
  });

  it('flushes what is queued on shutdown', async () => {
    const recorder = createPrismaUsageRecorder({ batchSize: 100 });

    recorder.record(event());
    await recorder.stop();

    expect(createMany).toHaveBeenCalledTimes(1);
  });
});
