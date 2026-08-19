import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '@/nodes/core/retry';

const base = {
  retries: 2,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  factor: 2,
  isRetryable: () => true,
};

describe('withRetry', () => {
  it('returns the first successful attempt without sleeping', async () => {
    const sleep = vi.fn();
    const operation = vi.fn(async () => 'ok');

    await expect(withRetry(operation, { ...base, sleep })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries up to the limit and then surfaces the last failure', async () => {
    const sleep = vi.fn(async () => undefined);
    const operation = vi.fn(async () => {
      throw new Error('always down');
    });

    await expect(withRetry(operation, { ...base, sleep })).rejects.toThrow('always down');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up immediately on a failure that is not retryable', async () => {
    const operation = vi.fn(async () => {
      throw new Error('bad request');
    });

    await expect(
      withRetry(operation, { ...base, isRetryable: () => false, sleep: vi.fn() })
    ).rejects.toThrow('bad request');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('waits the delay the error asks for instead of the backoff', async () => {
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;
    const operation = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('rate limited');
      }
      return 'recovered';
    });

    const result = await withRetry(operation, { ...base, sleep, retryAfterMs: () => 2500 });

    expect(result).toBe('recovered');
    expect(sleep).toHaveBeenCalledWith(2500);
  });

  it('caps the backoff and reports each retry', async () => {
    const sleep = vi.fn(async () => undefined);
    const onRetry = vi.fn();
    const operation = vi.fn(async () => {
      throw new Error('down');
    });

    await expect(
      withRetry(operation, {
        ...base,
        retries: 3,
        initialDelayMs: 10000,
        maxDelayMs: 1000,
        sleep,
        onRetry,
      })
    ).rejects.toThrow('down');

    expect(onRetry).toHaveBeenCalledTimes(3);
    for (const [delay] of sleep.mock.calls) {
      expect(delay).toBeLessThanOrEqual(1000);
      expect(delay).toBeGreaterThanOrEqual(500);
    }
  });
});
