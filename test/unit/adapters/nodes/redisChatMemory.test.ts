import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisChatMemory } from '@/adapters/nodes/redisChatMemory';

const { cacheGet, cacheSet, cacheDelete } = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDelete: vi.fn(),
}));

vi.mock('@/utils/cache', () => ({ cacheGet, cacheSet, cacheDelete }));

beforeEach(() => vi.clearAllMocks());

describe('createRedisChatMemory', () => {
  it('reads a session under its own key and returns the newest turns', async () => {
    cacheGet.mockResolvedValue([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
    ]);

    const memory = createRedisChatMemory();

    expect(await memory.load('session-1', 2)).toEqual([
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
    ]);
    expect(cacheGet).toHaveBeenCalledWith('ainode:mem:session-1');
  });

  it('answers with no history when Redis is unavailable', async () => {
    cacheGet.mockResolvedValue(null);

    expect(await createRedisChatMemory().load('session-1')).toEqual([]);
  });

  it('trims the thread to the configured window on write', async () => {
    cacheGet.mockResolvedValue([
      { role: 'user', content: 'old' },
      { role: 'assistant', content: 'older' },
    ]);

    await createRedisChatMemory({ maxTurns: 2, ttlSeconds: 60 }).append('session-1', [
      { role: 'user', content: 'new' },
      { role: 'assistant', content: 'newest' },
    ]);

    expect(cacheSet).toHaveBeenCalledWith(
      'ainode:mem:session-1',
      [
        { role: 'user', content: 'new' },
        { role: 'assistant', content: 'newest' },
      ],
      60
    );
  });

  it('starts a fresh thread when nothing is stored yet', async () => {
    cacheGet.mockResolvedValue(null);

    await createRedisChatMemory().append('session-2', [{ role: 'user', content: 'hello' }]);

    expect(cacheSet).toHaveBeenCalledWith(
      'ainode:mem:session-2',
      [{ role: 'user', content: 'hello' }],
      86400
    );
  });

  it('clears a session', async () => {
    await createRedisChatMemory().clear('session-3');

    expect(cacheDelete).toHaveBeenCalledWith('ainode:mem:session-3');
  });
});
