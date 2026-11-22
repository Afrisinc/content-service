import { FastifyRequest, FastifyReply } from 'fastify';
import { getRateLimiter, type RateLimitConfig } from '@/utils/rateLimiter';
import { TooManyRequestsError, UnauthorizedError } from '@/utils/http-error';
import { logger } from '@/utils/logger';

/**
 * Generic per-user rate-limit preHandler, for any authenticated route that
 * triggers real cost or work per call (LLM generation, renders, sends…).
 * Reuses the same in-memory RateLimiter as the OAuth guards — single-instance
 * only; move to a Redis-backed limiter first if this service ever runs more
 * than one replica.
 */
export function rateLimitGuard(config: RateLimitConfig) {
  return async function guard(request: FastifyRequest, _reply: FastifyReply) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedError('authentication required');
    }

    const rateLimiter = getRateLimiter();
    const isAllowed = await rateLimiter.isAllowed(userId, config);

    if (!isAllowed) {
      const resetMs = await rateLimiter.getResetTime(userId, config);
      logger.warn({ userId, keyPrefix: config.keyPrefix, resetMs }, 'rate limit exceeded');
      throw new TooManyRequestsError(
        `Too many requests. Try again in ${Math.ceil(resetMs / 1000)} seconds.`
      );
    }
  };
}
