import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsPullService } from '@/services/analyticsPull.service';

const meta = vi.hoisted(() => ({
  getPostMetrics: vi.fn(),
  getAccountMetrics: vi.fn(),
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

const cache = vi.hoisted(() => ({ cacheIncrementBy: vi.fn(async () => 0) }));
const crypto = vi.hoisted(() => ({ decryptToken: vi.fn((value: string) => `plain:${value}`) }));

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

let service: AnalyticsPullService;

beforeEach(() => {
  vi.clearAllMocks();
  meta.lastUsage.mockReturnValue(null);
  cache.cacheIncrementBy.mockResolvedValue(0 as never);
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
    meta.getPostMetrics.mockResolvedValueOnce(metrics as never);

    const report = await service.run(NOW);

    expect(report.postsRead).toBe(1);
  });

  it('stops when Meta reports the app is near its quota', async () => {
    meta.lastUsage.mockReturnValue({ callCount: 95, totalTime: 10, totalCpuTime: 10 } as never);
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);

    const report = await service.run(NOW);

    expect(report.stoppedEarly).toBe(true);
    expect(meta.getPostMetrics).not.toHaveBeenCalled();
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
    meta.getAccountMetrics.mockResolvedValueOnce({
      followers: 4200,
      follows: 12,
      postsCount: 90,
      reach: 0,
      impressions: 0,
      profileViews: 0,
    } as never);

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

    expect(meta.getAccountMetrics).not.toHaveBeenCalled();
    expect(report.snapshotsTaken).toBe(0);
  });

  it('spends the call but writes nothing when the platform returns no metrics', async () => {
    analytics.accountsNeedingSnapshot.mockResolvedValueOnce([account] as never);
    meta.getAccountMetrics.mockResolvedValueOnce(null as never);

    const report = await service.run(NOW);

    expect(report.snapshotsTaken).toBe(0);
    expect(report.callsSpent).toBe(1);
    expect(analytics.recordAccountSnapshot).not.toHaveBeenCalled();
  });
});

describe('post metrics', () => {
  it('writes both the post columns and the daily row', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);
    meta.getPostMetrics.mockResolvedValueOnce(metrics as never);

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

    expect(meta.getPostMetrics).not.toHaveBeenCalled();
    expect(report.postsRead).toBe(0);
  });

  it('counts a post the platform would not answer for as failed, not read', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([duePost()] as never);
    meta.getPostMetrics.mockResolvedValueOnce(null as never);

    const report = await service.run(NOW);

    expect(report).toMatchObject({ postsRead: 0, postsFailed: 1 });
    expect(posts.updatePostMetrics).not.toHaveBeenCalled();
  });

  it('falls back to the account token when the post has none', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([
      duePost({ accessTokenEnc: null }),
    ] as never);
    posts.getAccount.mockResolvedValueOnce({ accessToken: 'enc-acc' } as never);
    meta.getPostMetrics.mockResolvedValueOnce(metrics as never);

    await service.run(NOW);

    expect(posts.getAccount).toHaveBeenCalledWith('user-1', 'instagram', 'page-1');
    expect(meta.getPostMetrics).toHaveBeenCalledWith('ig-1', 'plain:enc-acc', 'instagram');
  });

  it('skips a post with no usable token anywhere', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([
      duePost({ accessTokenEnc: null }),
    ] as never);
    posts.getAccount.mockResolvedValueOnce(null as never);

    const report = await service.run(NOW);

    expect(meta.getPostMetrics).not.toHaveBeenCalled();
    expect(report.postsRead).toBe(0);
  });

  it('reads a facebook post as facebook', async () => {
    analytics.postsDueForMetrics.mockResolvedValueOnce([
      duePost({ platform: 'facebook', postId: 'fb-1' }),
    ] as never);
    meta.getPostMetrics.mockResolvedValueOnce(metrics as never);

    await service.run(NOW);

    expect(meta.getPostMetrics).toHaveBeenCalledWith('fb-1', 'plain:enc-token', 'facebook');
  });
});
