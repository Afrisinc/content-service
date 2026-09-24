import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsPullService } from '@/services/analyticsPull.service';

const meta = vi.hoisted(() => ({
  readPostMetrics: vi.fn(),
  readAccountMetrics: vi.fn(),
  lastUsage: vi.fn(() => null),
}));

const analytics = vi.hoisted(() => ({
  accountsNeedingSnapshot: vi.fn(async () => []),
  recordAccountSnapshot: vi.fn(async () => ({})),
  postsDueForMetrics: vi.fn(async () => []),
}));

const posts = vi.hoisted(() => ({
  updatePostMetrics: vi.fn(async () => ({})),
  upsertAnalytics: vi.fn(async () => ({})),
  getAccount: vi.fn(async () => null),
}));

const cache = vi.hoisted(() => ({
  cacheIncrementBy: vi.fn(async () => 0),
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => undefined),
  cacheDelete: vi.fn(async () => undefined),
}));
const crypto = vi.hoisted(() => ({ decryptToken: vi.fn((value: string) => `plain:${value}`) }));

vi.mock('@/config/env', () => ({
  env: {
    ANALYTICS_PULL_CALL_BUDGET: 120,
    ANALYTICS_PULL_POST_LIMIT: 2,
    ANALYTICS_PULL_ACCOUNT_LIMIT: 50,
    ANALYTICS_PULL_USAGE_CEILING: 80,
  },
}));
vi.mock('@/adapters/meta/metaClient', () => ({ metaClient: meta }));
vi.mock('@/repositories/analytics.repository', () => ({ analyticsRepository: analytics }));
vi.mock('@/repositories/socialMediaPost.repository', () => ({
  socialMediaPostRepository: posts,
}));
vi.mock('@/utils/cache', () => cache);
vi.mock('@/utils/oauthToken', () => crypto);

const NOW = new Date('2026-08-21T12:00:00.000Z');
const DAY = 86400000;

const metrics = {
  impressions: 100,
  reach: 80,
  engagements: 12,
  clicks: 4,
  likes: 7,
  comments: 3,
  shares: 2,
  saves: 1,
  views: 40,
};

function duePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    userId: 'user-1',
    platform: 'instagram',
    pageId: 'page-1',
    postId: 'ig-1',
    accessTokenEnc: 'enc-token',
    publishedAt: new Date(NOW.getTime() - 3 * DAY),
    lastMetricsUpdate: null,
    ...overrides,
  };
}

const ok = (value: unknown, requests = 1) => ({ ok: true, value, requests }) as never;
const fail = (error: Record<string, unknown>, requests = 1) =>
  ({
    ok: false,
    error: { status: 400, code: null, subcode: null, message: 'Meta said no', ...error },
    requests,
  }) as never;

let service: AnalyticsPullService;

beforeEach(() => {
  vi.clearAllMocks();
  meta.lastUsage.mockReturnValue(null);
  cache.cacheIncrementBy.mockResolvedValue(0 as never);
  cache.cacheGet.mockResolvedValue(null as never);
  crypto.decryptToken.mockImplementation((value: string) => `plain:${value}`);
  service = new AnalyticsPullService();
});

describe('budget', () => {
  it('does no work once the hourly budget is spent', async () => {
    cache.cacheIncrementBy.mockResolvedValueOnce(9999 as never);

    const report = await service.run(NOW);

    expect(report).toMatchObject({ stoppedEarly: true, postsRead: 0, snapshotsTaken: 0 });
    expect(analytics.postsDueForMetrics).not.toHaveBeenCalled();
    expect(analytics.accountsNeedingSnapshot).not.toHaveBeenCalled();
  });

  it('treats an unreachable Redis as unknown spend rather than a full budget', async () => {
    cache.cacheIncrementBy.mockResolvedValue(null as never);
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);
    meta.readPostMetrics.mockResolvedValueOnce(ok(metrics));

    const report = await service.run(NOW);

    expect(report.postsRead).toBe(1);
  });

  it('stops when Meta reports the app is near its quota', async () => {
    meta.lastUsage.mockReturnValue({ callCount: 95, totalTime: 10, totalCpuTime: 10 } as never);
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);

    const report = await service.run(NOW);

    expect(report.stoppedEarly).toBe(true);
    expect(meta.readPostMetrics).not.toHaveBeenCalled();
  });
});

describe('follower snapshots', () => {
  const account = {
    id: 'acc-1',
    userId: 'user-1',
    platform: 'instagram',
    pageId: 'page-1',
    pageName: 'Brand',
    accessToken: 'enc-acc',
  };

  it('records one snapshot per account per day', async () => {
    analytics.accountsNeedingSnapshot.mockResolvedValueOnce([account] as never);
    meta.readAccountMetrics.mockResolvedValueOnce(
      ok({
        followers: 4200,
        follows: 12,
        postsCount: 90,
        reach: 0,
        impressions: 0,
        profileViews: 0,
      })
    );

    const report = await service.run(NOW);

    expect(report.snapshotsTaken).toBe(1);
    expect(analytics.recordAccountSnapshot).toHaveBeenCalledWith(
      'acc-1',
      new Date('2026-08-21T00:00:00.000Z'),
      'instagram',
      expect.objectContaining({ followers: 4200 })
    );
  });

  it('skips an account whose token will not decrypt, without spending a call', async () => {
    analytics.accountsNeedingSnapshot.mockResolvedValueOnce([account] as never);
    crypto.decryptToken.mockImplementation(() => {
      throw new Error('bad key');
    });

    const report = await service.run(NOW);

    expect(meta.readAccountMetrics).not.toHaveBeenCalled();
    expect(report.snapshotsTaken).toBe(0);
  });

  it('counts a failed account and names the reason', async () => {
    analytics.accountsNeedingSnapshot.mockResolvedValueOnce([account] as never);
    meta.readAccountMetrics.mockResolvedValueOnce(fail({ code: 100 }));

    const report = await service.run(NOW);

    expect(report).toMatchObject({
      snapshotsTaken: 0,
      accountsFailed: 1,
      callsSpent: 1,
      accountFailures: { other: 1 },
    });
    expect(analytics.recordAccountSnapshot).not.toHaveBeenCalled();
  });
});

describe('post metrics', () => {
  it('writes both the post columns and the daily row', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);
    meta.readPostMetrics.mockResolvedValueOnce(ok(metrics));

    const report = await service.run(NOW);

    expect(report.postsRead).toBe(1);
    expect(posts.updatePostMetrics).toHaveBeenCalledWith('row-1', {
      likes: 7,
      comments: 3,
      shares: 2,
      views: 40,
      reach: 80,
      impressions: 100,
    });
    expect(posts.upsertAnalytics).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({
        date: new Date('2026-08-21T00:00:00.000Z'),
        platform: 'instagram',
        engagements: 12,
        reaches: 80,
        saves: 1,
      })
    );
  });

  it('leaves a candidate alone when the cadence says it is too soon', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([
      duePost({ lastMetricsUpdate: new Date(NOW.getTime() - 3600000) }),
    ] as never);

    const report = await service.run(NOW);

    expect(meta.readPostMetrics).not.toHaveBeenCalled();
    expect(report.postsRead).toBe(0);
  });

  it('counts a post the platform would not answer for as failed, not read', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);
    meta.readPostMetrics.mockResolvedValueOnce(fail({ code: 100 }));

    const report = await service.run(NOW);

    expect(report).toMatchObject({ postsRead: 0, postsFailed: 1, postFailures: { other: 1 } });
    expect(posts.updatePostMetrics).not.toHaveBeenCalled();
  });

  it('falls back to the account token when the post has none', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([
      duePost({ accessTokenEnc: null }),
    ] as never);
    posts.getAccount.mockResolvedValueOnce({ accessToken: 'enc-acc' } as never);
    meta.readPostMetrics.mockResolvedValueOnce(ok(metrics));

    await service.run(NOW);

    expect(posts.getAccount).toHaveBeenCalledWith('user-1', 'instagram', 'page-1');
    expect(meta.readPostMetrics).toHaveBeenCalledWith('ig-1', 'plain:enc-acc', 'instagram');
  });

  it('skips a post with no usable token anywhere', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([
      duePost({ accessTokenEnc: null }),
    ] as never);
    posts.getAccount.mockResolvedValueOnce(null as never);

    const report = await service.run(NOW);

    expect(meta.readPostMetrics).not.toHaveBeenCalled();
    expect(report.postsRead).toBe(0);
  });

  it('reads a facebook post as facebook', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([
      duePost({ platform: 'facebook', postId: 'fb-1' }),
    ] as never);
    meta.readPostMetrics.mockResolvedValueOnce(ok(metrics));

    await service.run(NOW);

    expect(meta.readPostMetrics).toHaveBeenCalledWith('fb-1', 'plain:enc-token', 'facebook');
  });
});

describe('failures and backoff', () => {
  const account = {
    id: 'acc-1',
    userId: 'user-1',
    platform: 'instagram',
    pageId: 'page-1',
    pageName: 'Brand',
    accessToken: 'enc-acc',
  };

  it('counts every request a post read made against the budget', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);
    meta.readPostMetrics.mockResolvedValueOnce(ok(metrics, 3));

    const report = await service.run(NOW);

    expect(report.callsSpent).toBe(3);
    expect(cache.cacheIncrementBy).toHaveBeenCalledWith(expect.any(String), 3, 3600);
  });

  it('pauses a failed post with a backoff keyed to the post', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);
    meta.readPostMetrics.mockResolvedValueOnce(fail({ status: 503 }));

    await service.run(NOW);

    expect(cache.cacheSet).toHaveBeenCalledWith(
      'analytics:pull:backoff:row-1',
      { failures: 1, kind: 'unavailable', retryAt: '2026-08-21T14:00:00.000Z' },
      30 * 86400
    );
  });

  it('grows the wait with each failure', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);
    cache.cacheGet.mockResolvedValueOnce({
      failures: 2,
      kind: 'unavailable',
      retryAt: new Date(NOW.getTime() - 1000).toISOString(),
    } as never);
    meta.readPostMetrics.mockResolvedValueOnce(fail({ status: 503 }));

    await service.run(NOW);

    expect(cache.cacheSet).toHaveBeenCalledWith(
      'analytics:pull:backoff:row-1',
      { failures: 3, kind: 'unavailable', retryAt: '2026-08-22T12:00:00.000Z' },
      expect.any(Number)
    );
  });

  it('skips a paused post without calling Meta, and remembers why it is paused', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);
    cache.cacheGet.mockResolvedValueOnce({
      failures: 1,
      kind: 'token',
      retryAt: new Date(NOW.getTime() + 3600000).toISOString(),
    } as never);

    const report = await service.run(NOW);

    expect(meta.readPostMetrics).not.toHaveBeenCalled();
    expect(report).toMatchObject({ postsDeferred: 1, deferredReasons: { token: 1 } });
  });

  it('clears the backoff once a paused post reads again', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);
    cache.cacheGet.mockResolvedValueOnce({
      failures: 1,
      kind: 'unavailable',
      retryAt: new Date(NOW.getTime() - 1000).toISOString(),
    } as never);
    meta.readPostMetrics.mockResolvedValueOnce(ok(metrics));

    await service.run(NOW);

    expect(cache.cacheDelete).toHaveBeenCalledWith('analytics:pull:backoff:row-1');
  });

  it('stops asking Meta about a page once its token is rejected', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([
      duePost({ id: 'row-1', postId: 'ig-1' }),
      duePost({ id: 'row-2', postId: 'ig-2' }),
      duePost({ id: 'row-3', postId: 'ig-3', pageId: 'page-2' }),
    ] as never);
    meta.readPostMetrics
      .mockResolvedValueOnce(fail({ status: 400, code: 190 }))
      .mockResolvedValueOnce(ok(metrics));

    const report = await service.run(NOW);

    expect(meta.readPostMetrics).toHaveBeenCalledTimes(2);
    expect(meta.readPostMetrics).toHaveBeenLastCalledWith('ig-3', 'plain:enc-token', 'instagram');
    expect(report).toMatchObject({ postsRead: 1, postsFailed: 2, postFailures: { token: 2 } });
  });

  it('skips posts on a page whose account snapshot hit a revoked token', async () => {
    analytics.accountsNeedingSnapshot.mockResolvedValueOnce([account] as never);
    meta.readAccountMetrics.mockResolvedValueOnce(fail({ code: 190 }));
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);

    const report = await service.run(NOW);

    expect(meta.readPostMetrics).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      accountsFailed: 1,
      accountFailures: { token: 1 },
      postsFailed: 1,
      postFailures: { token: 1 },
    });
  });

  it('halts the whole sweep on a Meta rate limit without pausing the post', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([
      duePost({ id: 'row-1', postId: 'ig-1' }),
      duePost({ id: 'row-2', postId: 'ig-2' }),
    ] as never);
    meta.readPostMetrics.mockResolvedValueOnce(fail({ code: 4 }));

    const report = await service.run(NOW);

    expect(meta.readPostMetrics).toHaveBeenCalledTimes(1);
    expect(cache.cacheSet).not.toHaveBeenCalled();
    expect(report).toMatchObject({ stoppedEarly: true, postFailures: { rate_limit: 1 } });
  });

  it('halts before the posts when an account read is rate limited', async () => {
    analytics.accountsNeedingSnapshot.mockResolvedValueOnce([account] as never);
    meta.readAccountMetrics.mockResolvedValueOnce(fail({ status: 429 }));

    const report = await service.run(NOW);

    expect(analytics.postsDueForMetrics).not.toHaveBeenCalled();
    expect(report.stoppedEarly).toBe(true);
  });

  it('looks past paused posts so they cannot crowd out healthy ones', async () => {
    const paused = {
      failures: 1,
      kind: 'token',
      retryAt: new Date(NOW.getTime() + 3600000).toISOString(),
    };
    analytics.postsDueForMetrics.mockResolvedValueOnce([
      duePost({ id: 'row-1', postId: 'ig-1' }),
      duePost({ id: 'row-2', postId: 'ig-2' }),
      duePost({ id: 'row-3', postId: 'ig-3' }),
      duePost({ id: 'row-4', postId: 'ig-4' }),
      duePost({ id: 'row-5', postId: 'ig-5' }),
    ] as never);
    cache.cacheGet
      .mockResolvedValueOnce(paused as never)
      .mockResolvedValueOnce(paused as never)
      .mockResolvedValue(null as never);
    meta.readPostMetrics.mockResolvedValue(ok(metrics));

    const report = await service.run(NOW);

    expect(analytics.postsDueForMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 6 })
    );
    expect(meta.readPostMetrics.mock.calls.map(call => call[0])).toEqual(['ig-3', 'ig-4']);
    expect(report).toMatchObject({ postsRead: 2, postsDeferred: 2 });
  });
});
