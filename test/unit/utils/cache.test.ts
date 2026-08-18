import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = {
  status: 'ready' as string,
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  connect: vi.fn(),
  quit: vi.fn(),
  disconnect: vi.fn(),
};

const envState = { REDIS_URL: 'redis://localhost:6379', SOCIAL_PAGES_CACHE_TTL_SECONDS: 3600 };

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => ({
    ...redisState,
    get status() {
      return redisState.status;
    },
    on: vi.fn(),
  })),
}));

vi.mock('@/config/env', () => ({
  get env() {
    return envState;
  },
}));

async function loadCache(): Promise<typeof import('@/utils/cache')> {
  vi.resetModules();
  const cache = await import('@/utils/cache');
  await cache.initCache();
  return cache;
}

describe('cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisState.status = 'ready';
    envState.REDIS_URL = 'redis://localhost:6379';
    redisState.connect.mockResolvedValue(undefined);
    redisState.quit.mockResolvedValue('OK');
  });

  afterEach(async () => {
    const cache = await import('@/utils/cache');
    await cache.closeCache();
  });

  it('is a no-op when no REDIS_URL is configured', async () => {
    envState.REDIS_URL = '';
    const cache = await loadCache();

    await expect(cache.cacheGet('key')).resolves.toBeNull();
    await cache.cacheSet('key', { a: 1 }, 60);

    expect(redisState.get).not.toHaveBeenCalled();
    expect(redisState.set).not.toHaveBeenCalled();
  });

  it('parses a stored value back into its original shape', async () => {
    redisState.get.mockResolvedValue(JSON.stringify({ pages: ['a'] }));
    const cache = await loadCache();

    await expect(cache.cacheGet<{ pages: string[] }>('key')).resolves.toEqual({ pages: ['a'] });
  });

  it('returns null for a key that was never written', async () => {
    redisState.get.mockResolvedValue(null);
    const cache = await loadCache();

    await expect(cache.cacheGet('key')).resolves.toBeNull();
  });

  it('writes with the requested expiry', async () => {
    redisState.set.mockResolvedValue('OK');
    const cache = await loadCache();

    await cache.cacheSet('key', { a: 1 }, 900);

    expect(redisState.set).toHaveBeenCalledWith('key', JSON.stringify({ a: 1 }), 'EX', 900);
  });

  it('deletes a key', async () => {
    redisState.del.mockResolvedValue(1);
    const cache = await loadCache();

    await cache.cacheDelete('key');

    expect(redisState.del).toHaveBeenCalledWith('key');
  });

  it('swallows a read failure instead of propagating it', async () => {
    redisState.get.mockRejectedValue(new Error('Connection is closed'));
    const cache = await loadCache();

    await expect(cache.cacheGet('key')).resolves.toBeNull();
  });

  it('swallows a write failure instead of propagating it', async () => {
    redisState.set.mockRejectedValue(new Error('READONLY'));
    const cache = await loadCache();

    await expect(cache.cacheSet('key', 1, 60)).resolves.toBeUndefined();
  });

  it('swallows a delete failure instead of propagating it', async () => {
    redisState.del.mockRejectedValue(new Error('Connection is closed'));
    const cache = await loadCache();

    await expect(cache.cacheDelete('key')).resolves.toBeUndefined();
  });

  it('returns null for corrupt JSON rather than throwing', async () => {
    redisState.get.mockResolvedValue('{not json');
    const cache = await loadCache();

    await expect(cache.cacheGet('key')).resolves.toBeNull();
  });

  it('skips redis entirely while the connection is not ready', async () => {
    const cache = await loadCache();
    redisState.status = 'connecting';

    await expect(cache.cacheGet('key')).resolves.toBeNull();
    await cache.cacheSet('key', 1, 60);
    await cache.cacheDelete('key');

    expect(redisState.get).not.toHaveBeenCalled();
    expect(redisState.set).not.toHaveBeenCalled();
    expect(redisState.del).not.toHaveBeenCalled();
  });

  it('starts up even when redis refuses the connection', async () => {
    redisState.connect.mockRejectedValue(new Error('ECONNREFUSED'));
    redisState.status = 'end';

    const cache = await loadCache();

    await expect(cache.cacheGet('key')).resolves.toBeNull();
  });

  it('force-disconnects when a clean quit fails', async () => {
    redisState.quit.mockRejectedValue(new Error('Connection is closed'));
    const cache = await loadCache();

    await cache.closeCache();

    expect(redisState.disconnect).toHaveBeenCalled();
  });
});
