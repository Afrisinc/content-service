import type { PriceTable } from '../core';

/**
 * Micro-USD per million tokens. Anthropic list prices as of 2026-06-24 — re-check them against
 * platform.claude.com/pricing before trusting a bill, and note that Bedrock, Vertex and Foundry
 * are priced separately. Cache reads are ~0.1x fresh input; cache writes ~1.25x.
 */
export const CLAUDE_PRICING: PriceTable = {
  'claude-fable-5': {
    input: 10_000_000,
    output: 50_000_000,
    cacheRead: 1_000_000,
    cacheWrite: 12_500_000,
  },
  'claude-mythos-5': {
    input: 10_000_000,
    output: 50_000_000,
    cacheRead: 1_000_000,
    cacheWrite: 12_500_000,
  },
  'claude-opus-5': {
    input: 5_000_000,
    output: 25_000_000,
    cacheRead: 500_000,
    cacheWrite: 6_250_000,
  },
  'claude-opus-4-8': {
    input: 5_000_000,
    output: 25_000_000,
    cacheRead: 500_000,
    cacheWrite: 6_250_000,
  },
  'claude-opus-4-7': {
    input: 5_000_000,
    output: 25_000_000,
    cacheRead: 500_000,
    cacheWrite: 6_250_000,
  },
  'claude-opus-4-6': {
    input: 5_000_000,
    output: 25_000_000,
    cacheRead: 500_000,
    cacheWrite: 6_250_000,
  },
  'claude-sonnet-5': {
    input: 3_000_000,
    output: 15_000_000,
    cacheRead: 300_000,
    cacheWrite: 3_750_000,
  },
  'claude-sonnet-4-6': {
    input: 3_000_000,
    output: 15_000_000,
    cacheRead: 300_000,
    cacheWrite: 3_750_000,
  },
  'claude-haiku-4-5': {
    input: 1_000_000,
    output: 5_000_000,
    cacheRead: 100_000,
    cacheWrite: 1_250_000,
  },
};
