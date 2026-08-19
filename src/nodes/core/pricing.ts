import { EMPTY_USAGE, type NodeUsage } from './services.types';

/** Micro-USD per million tokens, so every rate is an exact integer. */
export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type PriceTable = Record<string, ModelPricing>;

const PER_MILLION = 1_000_000n;

/**
 * Model ids gain suffixes over time, so an unknown id falls back to the longest listed
 * prefix it starts with. An id matching nothing returns undefined rather than a wrong price.
 */
export function findPricing(model: string, table: PriceTable): ModelPricing | undefined {
  if (table[model]) {
    return table[model];
  }

  const prefix = Object.keys(table)
    .filter(known => model.startsWith(known))
    .sort((a, b) => b.length - a.length)[0];

  return prefix ? table[prefix] : undefined;
}

export function costMicroUsd(usage: NodeUsage, pricing: ModelPricing | undefined): bigint {
  if (!pricing) {
    return 0n;
  }

  const buckets: Array<[number, number]> = [
    [usage.inputTokens, pricing.input],
    [usage.outputTokens, pricing.output],
    [usage.cacheReadTokens, pricing.cacheRead],
    [usage.cacheWriteTokens, pricing.cacheWrite],
  ];

  return buckets.reduce(
    (total, [tokens, rate]) =>
      total + (BigInt(Math.max(0, Math.round(tokens))) * BigInt(rate)) / PER_MILLION,
    0n
  );
}

export function usageFrom(value: unknown): NodeUsage {
  const usage = value as Partial<NodeUsage> | undefined;

  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cacheReadTokens: usage?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
    totalTokens: usage?.totalTokens ?? EMPTY_USAGE.totalTokens,
  };
}
