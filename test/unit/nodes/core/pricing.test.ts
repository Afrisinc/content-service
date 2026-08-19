import { describe, expect, it } from 'vitest';
import { costMicroUsd, findPricing, usageFrom } from '@/nodes/core/pricing';
import { CLAUDE_PRICING } from '@/nodes/claude/claude.pricing';
import type { PriceTable } from '@/nodes/core';

const table: PriceTable = {
  'claude-opus': {
    input: 5_000_000,
    output: 25_000_000,
    cacheRead: 500_000,
    cacheWrite: 6_250_000,
  },
  'claude-opus-5': {
    input: 5_000_000,
    output: 25_000_000,
    cacheRead: 500_000,
    cacheWrite: 6_250_000,
  },
};

describe('findPricing', () => {
  it('prefers an exact match', () => {
    expect(findPricing('claude-opus-5', table)).toBe(table['claude-opus-5']);
  });

  it('falls back to the longest listed prefix for an unseen variant', () => {
    expect(findPricing('claude-opus-5-20260101', table)).toBe(table['claude-opus-5']);
  });

  it('returns nothing for a model it cannot place', () => {
    expect(findPricing('some-other-model', table)).toBeUndefined();
  });
});

describe('costMicroUsd', () => {
  const pricing = table['claude-opus-5'];

  it('prices each token bucket at its own rate', () => {
    const cost = costMicroUsd(
      {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
        totalTokens: 4_000_000,
      },
      pricing
    );

    // $5 + $25 + $0.50 + $6.25 = $36.75
    expect(cost).toBe(36_750_000n);
  });

  it('shows cached input costing a tenth of fresh input', () => {
    const fresh = costMicroUsd(
      {
        inputTokens: 100_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
      },
      pricing
    );
    const cached = costMicroUsd(
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 100_000,
        cacheWriteTokens: 0,
        totalTokens: 0,
      },
      pricing
    );

    expect(fresh).toBe(500_000n);
    expect(cached).toBe(50_000n);
  });

  it('charges nothing when the model has no price', () => {
    expect(
      costMicroUsd(
        {
          inputTokens: 999,
          outputTokens: 999,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 0,
        },
        undefined
      )
    ).toBe(0n);
  });

  it('never returns a negative charge for nonsense counts', () => {
    expect(
      costMicroUsd(
        {
          inputTokens: -50,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 0,
        },
        pricing
      )
    ).toBe(0n);
  });

  it('prices a realistic Claude call in whole micro-USD', () => {
    const cost = costMicroUsd(
      {
        inputTokens: 12_000,
        outputTokens: 800,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 12_800,
      },
      findPricing('claude-opus-5', CLAUDE_PRICING)
    );

    // 12000 * $5/MTok + 800 * $25/MTok = $0.08
    expect(cost).toBe(80_000n);
  });
});

describe('usageFrom', () => {
  it('fills in every bucket a node did not report', () => {
    expect(usageFrom({ inputTokens: 5 })).toEqual({
      inputTokens: 5,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
    });
  });

  it('tolerates a node that reported no usage at all', () => {
    expect(usageFrom(undefined).totalTokens).toBe(0);
  });
});
