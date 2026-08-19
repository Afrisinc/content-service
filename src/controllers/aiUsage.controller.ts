import { createError } from '@/middlewares/errorHandler';
import { aiUsageService, resolveRange } from '@/services/aiUsage.service';
import { ApiResponseHelper, ResponseCode } from '@/utils/apiResponse';
import { parsePagination } from '@/utils/pagination';
import { FastifyReply, FastifyRequest } from 'fastify';

interface RangeQuery {
  from?: string;
  to?: string;
}

function parseRange(query: RangeQuery) {
  const range = resolveRange(query.from, query.to);

  if (Number.isNaN(range.from.getTime()) || Number.isNaN(range.to.getTime())) {
    throw createError.badRequest('from and to must be ISO dates');
  }
  if (range.from > range.to) {
    throw createError.badRequest('from must not be after to');
  }

  return range;
}

function requireUserId(params: { userId?: string }): string {
  const userId = params.userId?.trim();

  if (!userId) {
    throw createError.badRequest('userId is required');
  }

  return userId;
}

export async function getAiUsageSummary(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const summary = await aiUsageService.getSummary(parseRange(request.query as RangeQuery));

  return ApiResponseHelper.success(
    reply,
    'AI usage summary retrieved',
    summary,
    ResponseCode.SUCCESS,
    200
  );
}

export async function getUserQuota(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const quota = await aiUsageService.getUserQuota(
    requireUserId(request.params as { userId?: string })
  );

  return ApiResponseHelper.success(reply, 'AI quota retrieved', quota, ResponseCode.SUCCESS, 200);
}

export async function getUserUsageLogs(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as RangeQuery & { page?: number; limit?: number };
  const { page, limit } = parsePagination(query);

  const logs = await aiUsageService.listUserUsage({
    userId: requireUserId(request.params as { userId?: string }),
    range: parseRange(query),
    page,
    limit,
  });

  return ApiResponseHelper.success(reply, 'AI usage retrieved', logs, ResponseCode.SUCCESS, 200);
}
