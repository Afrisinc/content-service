import { describe, expect, it, vi, beforeEach } from 'vitest';
import { rateLimitGuard } from '@/middlewares/rateLimitGuard';

const mocks = vi.hoisted(() => ({
  isAllowed: vi.fn(),
  getResetTime: vi.fn(),
}));

vi.mock('@/utils/rateLimiter', () => ({
  getRateLimiter: () => ({ isAllowed: mocks.isAllowed, getResetTime: mocks.getResetTime }),
}));

const config = { windowMs: 1000, maxRequests: 5, keyPrefix: 'test' };

function request(userId?: string) {
  return { user: userId ? { userId } : undefined } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rateLimitGuard', () => {
  it('throws UnauthorizedError when there is no authenticated user', async () => {
    const guard = rateLimitGuard(config);

    await expect(guard(request(), {} as never)).rejects.toThrow('authentication required');
    expect(mocks.isAllowed).not.toHaveBeenCalled();
  });

  it('lets the request through when the caller is under the limit', async () => {
    mocks.isAllowed.mockResolvedValue(true);
    const guard = rateLimitGuard(config);

    await expect(guard(request('user-1'), {} as never)).resolves.toBeUndefined();
    expect(mocks.isAllowed).toHaveBeenCalledWith('user-1', config);
  });

  it('throws TooManyRequestsError once the caller is over the limit', async () => {
    mocks.isAllowed.mockResolvedValue(false);
    mocks.getResetTime.mockResolvedValue(4200);
    const guard = rateLimitGuard(config);

    await expect(guard(request('user-1'), {} as never)).rejects.toThrow(/Try again in 5 seconds/);
  });
});
