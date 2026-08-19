import type { IChatMemory, IResponseCache, MemoryMessage } from './services.types';

/** Process-local memory. Correct for one instance and for tests; use Redis across instances. */
export function createInMemoryChatMemory(options: { maxTurns?: number } = {}): IChatMemory {
  const maxTurns = options.maxTurns ?? 20;
  const sessions = new Map<string, MemoryMessage[]>();

  return {
    async load(sessionId, limit) {
      const turns = sessions.get(sessionId) ?? [];
      return turns.slice(-(limit ?? maxTurns));
    },
    async append(sessionId, messages) {
      const turns = [...(sessions.get(sessionId) ?? []), ...messages];
      sessions.set(sessionId, turns.slice(-maxTurns));
    },
    async clear(sessionId) {
      sessions.delete(sessionId);
    },
  };
}

export function createInMemoryResponseCache(): IResponseCache {
  const entries = new Map<string, { value: unknown; expiresAt: number }>();

  return {
    async get<T>(key: string) {
      const entry = entries.get(key);

      if (!entry) {
        return null;
      }
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
  };
}
