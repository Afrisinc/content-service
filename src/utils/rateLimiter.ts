/**
 * Rate Limiter Utility
 * Supports both in-memory and Redis-based rate limiting
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix: string; // Key prefix for identification
}

interface RequestRecord {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limiter (suitable for single-instance deployments)
 * For distributed systems, use Redis backend instead
 */
export class RateLimiter {
  private store: Map<string, RequestRecord> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async isAllowed(key: string, config: RateLimitConfig): Promise<boolean> {
    const redisKey = `${config.keyPrefix}:${key}`;
    const now = Date.now();
    const record = this.store.get(redisKey);

    if (!record || now > record.resetAt) {
      // Reset if expired or new
      this.store.set(redisKey, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return true;
    }

    record.count++;
    return record.count <= config.maxRequests;
  }

  async getRemainingRequests(key: string, config: RateLimitConfig): Promise<number> {
    const redisKey = `${config.keyPrefix}:${key}`;
    const record = this.store.get(redisKey);
    const now = Date.now();

    if (!record || now > record.resetAt) {
      return config.maxRequests;
    }

    return Math.max(0, config.maxRequests - record.count);
  }

  async getResetTime(key: string, config: RateLimitConfig): Promise<number> {
    const redisKey = `${config.keyPrefix}:${key}`;
    const record = this.store.get(redisKey);
    const now = Date.now();

    if (!record || now > record.resetAt) {
      return 0;
    }

    return Math.max(0, record.resetAt - now);
  }

  async reset(key: string, config: RateLimitConfig): Promise<void> {
    const redisKey = `${config.keyPrefix}:${key}`;
    this.store.delete(redisKey);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetAt) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}

// OAuth-specific rate limiting configurations
export const oauthRateLimits = {
  // Per IP address: 5 failed attempts per 15 minutes
  failedAttempts: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyPrefix: 'oauth:failed',
  },

  // Per user: 1 token exchange per 5 seconds (prevent rapid-fire)
  tokenExchange: {
    windowMs: 5 * 1000, // 5 seconds
    maxRequests: 1,
    keyPrefix: 'oauth:exchange',
  },

  // Per IP: 50 OAuth requests per hour (general brute force prevention)
  ipLimit: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
    keyPrefix: 'oauth:ip',
  },
};

export function getClientIp(request: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const xForwardedFor = request.headers['x-forwarded-for'];
  const xRealIp = request.headers['x-real-ip'];

  if (typeof xForwardedFor === 'string') {
    return xForwardedFor.split(',')[0].trim();
  }

  if (typeof xRealIp === 'string') {
    return xRealIp;
  }

  return request.socket?.remoteAddress || 'unknown';
}
