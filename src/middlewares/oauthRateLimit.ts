import { FastifyRequest, FastifyReply } from 'fastify';
import { getRateLimiter, oauthRateLimits, getClientIp } from '@/utils/rateLimiter';
import { createError } from './errorHandler';
import { logger } from '@/utils/logger';

export async function oauthIpRateLimit(request: FastifyRequest, _reply: FastifyReply) {
  const rateLimiter = getRateLimiter();
  const clientIp = getClientIp(request);
  const isAllowed = await rateLimiter.isAllowed(clientIp, oauthRateLimits.ipLimit);

  if (!isAllowed) {
    const resetTime = await rateLimiter.getResetTime(clientIp, oauthRateLimits.ipLimit);
    logger.warn({ ip: clientIp, resetTime }, 'OAuth IP rate limit exceeded');

    throw createError.tooManyRequests(
      `Too many OAuth requests. Please try again in ${Math.ceil(resetTime / 1000)} seconds.`
    );
  }
}

export async function recordOAuthFailure(request: FastifyRequest) {
  const rateLimiter = getRateLimiter();
  const clientIp = getClientIp(request);
  const isAllowed = await rateLimiter.isAllowed(clientIp, oauthRateLimits.failedAttempts);

  if (!isAllowed) {
    const resetTime = await rateLimiter.getResetTime(clientIp, oauthRateLimits.failedAttempts);
    logger.warn({ ip: clientIp, resetTime }, 'OAuth failed attempts limit exceeded');
    throw createError.tooManyRequests(
      `Too many failed OAuth attempts. Please try again in ${Math.ceil(resetTime / 1000)} seconds.`
    );
  }

  return true;
}

export async function recordOAuthTokenExchange(userId: string) {
  const rateLimiter = getRateLimiter();
  const isAllowed = await rateLimiter.isAllowed(userId, oauthRateLimits.tokenExchange);

  if (!isAllowed) {
    const resetTime = await rateLimiter.getResetTime(userId, oauthRateLimits.tokenExchange);
    logger.warn({ userId, resetTime }, 'OAuth token exchange rate limit exceeded');
    throw createError.tooManyRequests(
      `Token exchange limit exceeded. Please wait ${Math.ceil(resetTime / 1000)} seconds.`
    );
  }

  return true;
}

export async function resetOAuthAttempts(request: FastifyRequest) {
  const rateLimiter = getRateLimiter();
  const clientIp = getClientIp(request);
  await rateLimiter.reset(clientIp, oauthRateLimits.failedAttempts);
  logger.info({ ip: clientIp }, 'OAuth failure attempts reset');
}
