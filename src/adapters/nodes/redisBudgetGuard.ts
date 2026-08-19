import { cacheIncrementBy, cacheRead } from '@/utils/cache';
import { logger } from '@/utils/logger';
import type { BudgetDecision, IBudgetGuard } from '@/nodes/core';

export interface RedisBudgetGuardOptions {
  dailyLimitMicroUsd: bigint;
  /** Two days, so a counter written just before midnight still expires on its own. */
  ttlSeconds?: number;
}

const KEY_PREFIX = 'ainode:spend';

function dayKey(userId: string, now = new Date()): string {
  return `${KEY_PREFIX}:${userId}:${now.toISOString().slice(0, 10)}`;
}

/**
 * Per-user daily spend cap, counted in Redis for speed. The ledger in Postgres remains the
 * source of truth; this is a fast guard in front of it.
 *
 * When Redis is unreachable the counter reads as unknown and the call is **allowed** — an
 * infrastructure outage must not stop every generation. The cap can therefore be overshot
 * during an outage, and the ledger is where that is reconciled.
 */
export function createRedisBudgetGuard(options: RedisBudgetGuardOptions): IBudgetGuard {
  const ttlSeconds = options.ttlSeconds ?? 172800;

  return {
    async check(userId: string): Promise<BudgetDecision> {
      const raw = await cacheRead(dayKey(userId));

      if (raw === null) {
        return { allowed: true, spentMicroUsd: 0n, limitMicroUsd: options.dailyLimitMicroUsd };
      }

      const spentMicroUsd = BigInt(Number.parseInt(raw, 10) || 0);

      return {
        allowed: spentMicroUsd < options.dailyLimitMicroUsd,
        spentMicroUsd,
        limitMicroUsd: options.dailyLimitMicroUsd,
      };
    },

    async consume(userId: string, costMicroUsd: bigint): Promise<void> {
      if (costMicroUsd <= 0n) {
        return;
      }

      if (costMicroUsd > BigInt(Number.MAX_SAFE_INTEGER)) {
        logger.warn({ userId }, '[ai-budget] cost exceeds a safe counter increment, skipping');
        return;
      }

      await cacheIncrementBy(dayKey(userId), Number(costMicroUsd), ttlSeconds);
    },
  };
}
