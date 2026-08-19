import { env } from '@/config/env';
import {
  aiUsageRepository,
  type UsageBreakdownRow,
  type UsageRange,
} from '@/repositories/aiUsage.repository';
import { buildPaginatedResponse } from '@/utils/pagination';

const MICRO_USD_PER_USD = 1_000_000;
const DEFAULT_RANGE_DAYS = 30;

/** Money leaves this service as a string plus a rounded USD number — never a raw BigInt. */
function money(microUsd: bigint) {
  return {
    costMicroUsd: microUsd.toString(),
    costUsd: Number(microUsd) / MICRO_USD_PER_USD,
  };
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function resolveRange(from?: string, to?: string): UsageRange {
  const end = to ? new Date(to) : new Date();
  const start = from
    ? new Date(from)
    : new Date(end.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  return { from: start, to: end };
}

function toBreakdown(rows: UsageBreakdownRow[]) {
  return rows.map(row => ({
    key: row.key,
    calls: row.calls,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    ...money(row.costMicroUsd),
  }));
}

class AiUsageService {
  async getSummary(range: UsageRange) {
    const [totals, byModel, byNode, topUsers] = await Promise.all([
      aiUsageRepository.totals(range),
      aiUsageRepository.breakdownByModel(range),
      aiUsageRepository.breakdownByNode(range),
      aiUsageRepository.topUsers(range),
    ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      totals: {
        calls: totals.calls,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        ...money(totals.costMicroUsd),
      },
      byModel: toBreakdown(byModel),
      byNode: toBreakdown(byNode),
      topUsers: toBreakdown(topUsers),
    };
  }

  /**
   * The ledger is the source of truth for spend; the Redis counter the guard uses is only a
   * fast approximation of the same number, so it is not what gets reported here.
   */
  async getUserQuota(userId: string) {
    const spent = await aiUsageRepository.spendSince(userId, startOfUtcDay());
    const limit = BigInt(env.AI_DAILY_BUDGET_MICRO_USD);
    const enabled = limit > 0n;
    const remaining = enabled && limit > spent ? limit - spent : 0n;

    return {
      userId,
      enabled,
      allowed: !enabled || spent < limit,
      day: startOfUtcDay().toISOString(),
      spent: money(spent),
      limit: money(limit),
      remaining: money(remaining),
    };
  }

  async listUserUsage(params: { userId: string; range: UsageRange; page: number; limit: number }) {
    const { rows, total } = await aiUsageRepository.listForUser({
      userId: params.userId,
      range: params.range,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });

    const entries = rows.map(row => ({
      id: row.id,
      node: row.node,
      model: row.model,
      resource: row.resource,
      operation: row.operation,
      sessionId: row.session_id,
      requestId: row.request_id,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      latencyMs: row.latency_ms,
      success: row.success,
      cached: row.cached,
      errorCode: row.error_code,
      createdAt: row.created_at.toISOString(),
      ...money(row.cost_micro_usd),
    }));

    return buildPaginatedResponse(entries, total, params.page, params.limit);
  }
}

export const aiUsageService = new AiUsageService();
