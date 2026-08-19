import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiUsageService, resolveRange } from '@/services/aiUsage.service';

const repo = vi.hoisted(() => ({
  totals: vi.fn(),
  breakdownByModel: vi.fn(),
  breakdownByNode: vi.fn(),
  topUsers: vi.fn(),
  spendSince: vi.fn(),
  listForUser: vi.fn(),
}));

const envMock = vi.hoisted(() => ({ AI_DAILY_BUDGET_MICRO_USD: 1_000_000 }));

vi.mock('@/repositories/aiUsage.repository', () => ({ aiUsageRepository: repo }));
vi.mock('@/config/env', () => ({ env: envMock }));

const range = { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-08-19T00:00:00Z') };

beforeEach(() => {
  vi.clearAllMocks();
  envMock.AI_DAILY_BUDGET_MICRO_USD = 1_000_000;
});

describe('resolveRange', () => {
  it('defaults to the last thirty days', () => {
    const resolved = resolveRange();
    const days = (resolved.to.getTime() - resolved.from.getTime()) / (24 * 60 * 60 * 1000);

    expect(Math.round(days)).toBe(30);
  });

  it('uses the dates it is given', () => {
    const resolved = resolveRange('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');

    expect(resolved.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(resolved.to.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('getSummary', () => {
  it('reports money as an integer string and a rounded USD number', async () => {
    repo.totals.mockResolvedValue({
      calls: 3,
      costMicroUsd: 2_500_000n,
      inputTokens: 900,
      outputTokens: 120,
    });
    repo.breakdownByModel.mockResolvedValue([
      {
        key: 'claude-opus-5',
        calls: 2,
        costMicroUsd: 2_000_000n,
        inputTokens: 800,
        outputTokens: 100,
      },
    ]);
    repo.breakdownByNode.mockResolvedValue([
      { key: 'claude', calls: 3, costMicroUsd: 2_500_000n, inputTokens: 900, outputTokens: 120 },
    ]);
    repo.topUsers.mockResolvedValue([
      { key: 'user-1', calls: 3, costMicroUsd: 2_500_000n, inputTokens: 900, outputTokens: 120 },
    ]);

    const summary = await aiUsageService.getSummary(range);

    expect(summary.totals).toEqual({
      calls: 3,
      inputTokens: 900,
      outputTokens: 120,
      costMicroUsd: '2500000',
      costUsd: 2.5,
    });
    expect(summary.byModel[0]).toMatchObject({ key: 'claude-opus-5', costUsd: 2 });
    expect(summary.range).toEqual({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-19T00:00:00.000Z',
    });
  });
});

describe('getUserQuota', () => {
  it('reports remaining spend against the configured cap', async () => {
    repo.spendSince.mockResolvedValue(250_000n);

    const quota = await aiUsageService.getUserQuota('user-1');

    expect(quota).toMatchObject({
      userId: 'user-1',
      enabled: true,
      allowed: true,
      spent: { costMicroUsd: '250000', costUsd: 0.25 },
      limit: { costMicroUsd: '1000000', costUsd: 1 },
      remaining: { costMicroUsd: '750000', costUsd: 0.75 },
    });
  });

  it('denies a user who reached the cap and never reports negative headroom', async () => {
    repo.spendSince.mockResolvedValue(1_400_000n);

    const quota = await aiUsageService.getUserQuota('user-1');

    expect(quota.allowed).toBe(false);
    expect(quota.remaining.costMicroUsd).toBe('0');
  });

  it('reports the guard as disabled when no cap is configured', async () => {
    envMock.AI_DAILY_BUDGET_MICRO_USD = 0;
    repo.spendSince.mockResolvedValue(9_000_000n);

    const quota = await aiUsageService.getUserQuota('user-1');

    expect(quota).toMatchObject({ enabled: false, allowed: true });
  });

  it('counts spend from the start of the current UTC day', async () => {
    repo.spendSince.mockResolvedValue(0n);

    await aiUsageService.getUserQuota('user-1');

    const since = repo.spendSince.mock.calls[0][1] as Date;
    expect(since.toISOString()).toMatch(/T00:00:00\.000Z$/);
  });
});

describe('listUserUsage', () => {
  it('maps a ledger row onto the response and paginates it', async () => {
    repo.listForUser.mockResolvedValue({
      total: 12,
      rows: [
        {
          id: 'log-1',
          node: 'claude',
          model: 'claude-opus-5',
          resource: 'text',
          operation: 'message',
          session_id: 'sess-1',
          request_id: null,
          input_tokens: 100,
          output_tokens: 20,
          cache_read_tokens: 5,
          cache_write_tokens: 0,
          cost_micro_usd: 1_000n,
          latency_ms: 850,
          success: true,
          cached: false,
          error_code: null,
          created_at: new Date('2026-08-18T10:00:00Z'),
        },
      ],
    });

    const result = await aiUsageService.listUserUsage({
      userId: 'user-1',
      range,
      page: 2,
      limit: 5,
    });

    expect(repo.listForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      range,
      skip: 5,
      take: 5,
    });
    expect(result.data[0]).toEqual({
      id: 'log-1',
      node: 'claude',
      model: 'claude-opus-5',
      resource: 'text',
      operation: 'message',
      sessionId: 'sess-1',
      requestId: null,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      cacheWriteTokens: 0,
      latencyMs: 850,
      success: true,
      cached: false,
      errorCode: null,
      createdAt: '2026-08-18T10:00:00.000Z',
      costMicroUsd: '1000',
      costUsd: 0.001,
    });
    expect(result.pagination).toMatchObject({ page: 2, limit: 5, total: 12, hasMore: true });
  });
});
