import { prisma } from '@/database/prismaClient';
import { Prisma, type AiUsageLog } from '@prisma/client';

export interface AiUsageTotals {
  calls: number;
  costMicroUsd: bigint;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageBreakdownRow {
  key: string;
  calls: number;
  costMicroUsd: bigint;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageRange {
  from: Date;
  to: Date;
}

export class AiUsageRepository {
  /** Written in batches off the request path; one slow insert must not stall a generation. */
  async createMany(rows: Prisma.AiUsageLogCreateManyInput[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }

    const result = await prisma.aiUsageLog.createMany({ data: rows });
    return result.count;
  }

  async spendSince(userId: string, since: Date): Promise<bigint> {
    const result = await prisma.aiUsageLog.aggregate({
      where: { user_id: userId, created_at: { gte: since } },
      _sum: { cost_micro_usd: true },
    });

    return result._sum.cost_micro_usd ?? 0n;
  }

  async totals(range: UsageRange): Promise<AiUsageTotals> {
    const result = await prisma.aiUsageLog.aggregate({
      where: { created_at: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      _sum: { cost_micro_usd: true, input_tokens: true, output_tokens: true },
    });

    return {
      calls: result._count._all,
      costMicroUsd: result._sum.cost_micro_usd ?? 0n,
      inputTokens: result._sum.input_tokens ?? 0,
      outputTokens: result._sum.output_tokens ?? 0,
    };
  }

  private async groupBySingle(
    field: 'model' | 'node' | 'user_id',
    range: UsageRange,
    take?: number
  ): Promise<UsageBreakdownRow[]> {
    const rows = await prisma.aiUsageLog.groupBy({
      by: [field],
      where: { created_at: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      _sum: { cost_micro_usd: true, input_tokens: true, output_tokens: true },
      orderBy: { _sum: { cost_micro_usd: 'desc' } },
      ...(take ? { take } : {}),
    });

    return rows.map(row => ({
      key: String((row as Record<string, unknown>)[field] ?? 'unknown'),
      calls: row._count._all,
      costMicroUsd: row._sum.cost_micro_usd ?? 0n,
      inputTokens: row._sum.input_tokens ?? 0,
      outputTokens: row._sum.output_tokens ?? 0,
    }));
  }

  breakdownByModel(range: UsageRange): Promise<UsageBreakdownRow[]> {
    return this.groupBySingle('model', range);
  }

  breakdownByNode(range: UsageRange): Promise<UsageBreakdownRow[]> {
    return this.groupBySingle('node', range);
  }

  topUsers(range: UsageRange, take = 10): Promise<UsageBreakdownRow[]> {
    return this.groupBySingle('user_id', range, take);
  }

  async listForUser(params: {
    userId: string;
    range: UsageRange;
    skip: number;
    take: number;
  }): Promise<{ rows: AiUsageLog[]; total: number }> {
    const where: Prisma.AiUsageLogWhereInput = {
      user_id: params.userId,
      created_at: { gte: params.range.from, lte: params.range.to },
    };

    const [rows, total] = await Promise.all([
      prisma.aiUsageLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.aiUsageLog.count({ where }),
    ]);

    return { rows, total };
  }
}

export const aiUsageRepository = new AiUsageRepository();
