import { checkDatabaseConnection } from '@/database/prisma';
import { checkCacheHealth } from '@/utils/cache';

export interface CheckResult {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export async function checkDBHealth(): Promise<{ statusCode: number; db: CheckResult }> {
  const result = await checkDatabaseConnection();

  const db: CheckResult = result.isConnected
    ? { status: 'up', latencyMs: result.responseTime }
    : { status: 'down', latencyMs: result.responseTime, error: result.error };

  return {
    statusCode: result.isConnected ? 200 : 503,
    db,
  };
}

export async function checkRedisHealth(): Promise<{ statusCode: number; redis: CheckResult }> {
  const redis = await checkCacheHealth();

  return {
    statusCode: redis.status === 'up' ? 200 : 503,
    redis,
  };
}
