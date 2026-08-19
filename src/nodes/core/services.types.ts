import type { JsonObject } from './node.types';

/** One usage shape for every node, so cost and the ledger never branch per provider. */
export interface NodeUsage extends JsonObject {
  inputTokens: number;
  outputTokens: number;
  /** Input served from the provider's prompt cache — billed at a fraction of fresh input. */
  cacheReadTokens: number;
  /** Input written into the prompt cache — billed above fresh input, once. */
  cacheWriteTokens: number;
  totalTokens: number;
}

export interface MemoryMessage extends JsonObject {
  role: 'user' | 'assistant';
  content: string;
}

export interface IChatMemory {
  load(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
  append(sessionId: string, messages: MemoryMessage[]): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

export interface IResponseCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

/** Money is an integer: micro-USD, never a float. */
export interface UsageEvent {
  node: string;
  model: string;
  resource: string;
  operation: string;
  userId: string | null;
  sessionId: string | null;
  requestId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: bigint;
  latencyMs: number;
  success: boolean;
  cached: boolean;
  errorCode: string | null;
}

/**
 * `record` returns void on purpose: the ledger must never end up awaited on the request path,
 * and an implementation that throws must not be able to fail a generation that already succeeded.
 */
export interface IUsageRecorder {
  record(event: UsageEvent): void;
}

export interface BudgetDecision {
  allowed: boolean;
  spentMicroUsd: bigint;
  limitMicroUsd: bigint;
}

/** Spend is only known after the call, so the cap is checked before and charged after. */
export interface IBudgetGuard {
  check(userId: string): Promise<BudgetDecision>;
  consume(userId: string, costMicroUsd: bigint): Promise<void>;
}

export interface NodeServices {
  memory?: IChatMemory;
  cache?: IResponseCache;
  usage?: IUsageRecorder;
  budget?: IBudgetGuard;
}

export const EMPTY_USAGE: NodeUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
};
