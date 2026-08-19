import { cacheGet, cacheSet } from '@/utils/cache';
import type { IResponseCache } from '@/nodes/core';

/** The node builds the key; this only stores what it is given. */
export function createRedisResponseCache(): IResponseCache {
  return {
    get: key => cacheGet(key),
    set: (key, value, ttlSeconds) => cacheSet(key, value, ttlSeconds),
  };
}
