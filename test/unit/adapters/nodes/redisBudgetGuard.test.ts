import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisBudgetGuard } from '@/adapters/nodes/redisBudgetGuard';

const { cacheRead, cacheIncrementBy } = vi.hoisted(() => ({
  cacheRead: vi.fn(),
  cacheIncrementBy: vi.fn(),
}));

vi.mock('@/utils/cache', () => ({ cacheRead, cacheIncrementBy }));

const guard = () => createRedisBudgetGuard({ dailyLimitMicroUsd: 1_000_000n });
const today = new Date().toISOString().slice(0, 10);

beforeEach(() => vi.clearAllMocks());

describe('createRedisBudgetGuard', () => {
  it('allows a user below the cap', async () => {
    cacheRead.mockResolvedValue('250000');

    expect(await guard().check('user-1')).toEqual({
      allowed: true,
      spentMicroUsd: 250_000n,
      limitMicroUsd: 1_000_000n,
    });
    expect(cacheRead).toHaveBeenCalledWith(`ainode:spend:user-1:${today}`);
  });

  it('denies a user who reached the cap', async () => {
    cacheRead.mockResolvedValue('1000000');

    expect(await guard().check('user-1')).toMatchObject({ allowed: false });
  });

  it('allows the call when Redis cannot answer, instead of blocking everything', async () => {
    cacheRead.mockResolvedValue(null);

    expect(await guard().check('user-1')).toMatchObject({ allowed: true, spentMicroUsd: 0n });
  });

  it('adds the actual cost to the daily counter', async () => {
    await guard().consume('user-1', 17_500n);

    expect(cacheIncrementBy).toHaveBeenCalledWith(`ainode:spend:user-1:${today}`, 17500, 172800);
  });

  it('ignores a zero or negative charge', async () => {
    await guard().consume('user-1', 0n);

    expect(cacheIncrementBy).not.toHaveBeenCalled();
  });
});
