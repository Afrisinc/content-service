import type { PriceTable } from '../core';

/**
 * Micro-USD per million tokens. These are OpenAI list prices and are NOT verified against a
 * live source — confirm them at openai.com/api/pricing before using this for billing.
 * Image generation is priced per image rather than per token, so `image:generate` records no
 * cost here; add a per-image charge if you need it accounted for.
 */
export const CHATGPT_PRICING: PriceTable = {
  'gpt-4o-mini': { input: 150_000, output: 600_000, cacheRead: 75_000, cacheWrite: 0 },
  'gpt-4o': { input: 2_500_000, output: 10_000_000, cacheRead: 1_250_000, cacheWrite: 0 },
  'gpt-4.1': { input: 2_000_000, output: 8_000_000, cacheRead: 500_000, cacheWrite: 0 },
  'gpt-4.1-mini': { input: 400_000, output: 1_600_000, cacheRead: 100_000, cacheWrite: 0 },
  'gpt-4-turbo': { input: 10_000_000, output: 30_000_000, cacheRead: 10_000_000, cacheWrite: 0 },
  'gpt-3.5-turbo': { input: 500_000, output: 1_500_000, cacheRead: 500_000, cacheWrite: 0 },
  'text-embedding-3-small': { input: 20_000, output: 0, cacheRead: 20_000, cacheWrite: 0 },
  'text-embedding-3-large': { input: 130_000, output: 0, cacheRead: 130_000, cacheWrite: 0 },
  'text-embedding-ada-002': { input: 100_000, output: 0, cacheRead: 100_000, cacheWrite: 0 },
  'omni-moderation': { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
