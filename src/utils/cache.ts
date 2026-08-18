import { Redis } from 'ioredis';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

const OPERATION_TIMEOUT_MS = 1000;

let client: Redis | null = null;

function createClient(): Redis | null {
  if (!env.REDIS_URL) {
    logger.info({}, 'REDIS_URL not configured, cache disabled');
    return null;
  }

  const instance = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: OPERATION_TIMEOUT_MS,
    retryStrategy: attempt => Math.min(attempt * 1000, 30000),
  });

  instance.on('error', error => {
    logger.warn({ error: error.message }, 'Redis cache error');
  });

  instance.on('ready', () => {
    logger.info({}, 'Redis cache ready');
  });

  return instance;
}

export async function initCache(): Promise<void> {
  if (client) {
    return;
  }

  client = createClient();

  if (!client) {
    return;
  }

  try {
    await client.connect();
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Redis cache unreachable at startup, continuing without it'
    );
  }
}

export async function closeCache(): Promise<void> {
  if (!client) {
    return;
  }

  const instance = client;
  client = null;

  try {
    await instance.quit();
  } catch {
    instance.disconnect();
  }
}

function readyClient(): Redis | null {
  return client?.status === 'ready' ? client : null;
}

async function withTimeout<T>(operation: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), OPERATION_TIMEOUT_MS);
    timer.unref?.();
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = readyClient();
  if (!redis) {
    return null;
  }

  try {
    const raw = await withTimeout(redis.get(key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    logger.warn(
      { key, error: error instanceof Error ? error.message : 'Unknown error' },
      'Cache read failed'
    );
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = readyClient();
  if (!redis) {
    return;
  }

  try {
    await withTimeout(redis.set(key, JSON.stringify(value), 'EX', ttlSeconds));
  } catch (error) {
    logger.warn(
      { key, error: error instanceof Error ? error.message : 'Unknown error' },
      'Cache write failed'
    );
  }
}

export async function cacheDelete(key: string): Promise<void> {
  const redis = readyClient();
  if (!redis) {
    return;
  }

  try {
    await withTimeout(redis.del(key));
  } catch (error) {
    logger.warn(
      { key, error: error instanceof Error ? error.message : 'Unknown error' },
      'Cache delete failed'
    );
  }
}
