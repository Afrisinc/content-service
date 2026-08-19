import {
  getAiUsageSummary,
  getUserQuota,
  getUserUsageLogs,
} from '@/controllers/aiUsage.controller';
import { authGuard } from '@/middlewares/authGuard';
import {
  GetAiUsageSummarySchema,
  GetUserQuotaSchema,
  GetUserUsageLogsSchema,
} from '@/schemas/requests/aiUsage.schema';
import { FastifyInstance } from 'fastify';

/** Spend data is sensitive; every route here sits behind the auth guard. */
export async function aiUsageRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/ai-usage/summary',
    { schema: GetAiUsageSummarySchema, onRequest: [authGuard] },
    getAiUsageSummary
  );

  fastify.get(
    '/ai-usage/users/:userId/quota',
    { schema: GetUserQuotaSchema, onRequest: [authGuard] },
    getUserQuota
  );

  fastify.get(
    '/ai-usage/users/:userId/logs',
    { schema: GetUserUsageLogsSchema, onRequest: [authGuard] },
    getUserUsageLogs
  );
}
