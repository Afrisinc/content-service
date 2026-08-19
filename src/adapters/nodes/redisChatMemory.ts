import { cacheDelete, cacheGet, cacheSet } from '@/utils/cache';
import type { IChatMemory, MemoryMessage } from '@/nodes/core';

export interface RedisChatMemoryOptions {
  maxTurns?: number;
  ttlSeconds?: number;
}

const KEY_PREFIX = 'ainode:mem';

/**
 * Conversation memory in Redis. Reads and writes degrade to "no history" when Redis is down —
 * an unanswerable question is worse than an unremembered one.
 *
 * Append is read-modify-write, which is safe for a chat thread (one turn at a time per session)
 * but would lose a turn if two writers raced on the same session id.
 */
export function createRedisChatMemory(options: RedisChatMemoryOptions = {}): IChatMemory {
  const maxTurns = options.maxTurns ?? 20;
  const ttlSeconds = options.ttlSeconds ?? 86400;
  const keyFor = (sessionId: string) => `${KEY_PREFIX}:${sessionId}`;

  return {
    async load(sessionId, limit) {
      const stored = await cacheGet<MemoryMessage[]>(keyFor(sessionId));
      const turns = Array.isArray(stored) ? stored : [];
      return turns.slice(-(limit ?? maxTurns));
    },

    async append(sessionId, messages) {
      const stored = await cacheGet<MemoryMessage[]>(keyFor(sessionId));
      const turns = [...(Array.isArray(stored) ? stored : []), ...messages];
      await cacheSet(keyFor(sessionId), turns.slice(-maxTurns), ttlSeconds);
    },

    async clear(sessionId) {
      await cacheDelete(keyFor(sessionId));
    },
  };
}
