export interface RetryOptions {
  retries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  /** Decides whether a failure is worth another attempt; a delay in ms overrides the backoff. */
  isRetryable(error: unknown): boolean;
  retryAfterMs?(error: unknown): number | undefined;
  onRetry?(error: unknown, attempt: number, delayMs: number): void;
  sleep?(ms: number): Promise<void>;
}

export const DEFAULT_RETRY: Pick<
  RetryOptions,
  'retries' | 'initialDelayMs' | 'maxDelayMs' | 'factor'
> = {
  retries: 2,
  initialDelayMs: 500,
  maxDelayMs: 8000,
  factor: 2,
};

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Full jitter: spreads simultaneous retries instead of replaying the same burst. */
function jittered(delayMs: number): number {
  return Math.round(delayMs / 2 + Math.random() * (delayMs / 2));
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let attempt = 0;

  for (;;) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= options.retries || !options.isRetryable(error)) {
        throw error;
      }

      const backoff = Math.min(
        options.initialDelayMs * Math.pow(options.factor, attempt),
        options.maxDelayMs
      );
      const delayMs = options.retryAfterMs?.(error) ?? jittered(backoff);

      attempt += 1;
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}
