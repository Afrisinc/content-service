import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAnalyticsAccounts,
  getAnalyticsPlan,
  getAnalyticsOverview,
  getAnalyticsSummary,
  suggestPostIdeas,
} from '@/controllers/analytics.controller';
import { BadRequestError, NotFoundError, UnauthorizedError } from '@/utils/http-error';
import type { FastifyReply, FastifyRequest } from 'fastify';

const repository = vi.hoisted(() => ({
  totals: vi.fn(async () => ({})),
  countByCategory: vi.fn(async () => []),
  countPublished: vi.fn(async () => 0),
  top: vi.fn(async () => []),
  websiteSeries: vi.fn(async () => []),
  socialSeries: vi.fn(async () => []),
  platformTotals: vi.fn(async () => []),
  followersByPlatform: vi.fn(async () => ({})),
  connectedPlatforms: vi.fn(async () => []),
  publishedPosts: vi.fn(async () => []),
  reportingTimezone: vi.fn(async () => 'UTC'),
  accountsForUser: vi.fn(async () => []),
  totalsByPage: vi.fn(async () => []),
  snapshotsSince: vi.fn(async () => []),
  lastMetricsSync: vi.fn(async () => null),
  planningBrand: vi.fn(async () => null),
}));

const groups = vi.hoisted(() => ({
  findActiveTargets: vi.fn(async () => [] as { platform: string; pageId: string }[]),
}));

vi.mock('@/repositories/analytics.repository', () => ({
  analyticsRepository: repository,
}));
vi.mock('@/repositories/accountGroup.repository', () => ({
  accountGroupRepository: groups,
}));

const ideas = vi.hoisted(() => ({ suggest: vi.fn() }));
vi.mock('@/services/postIdeas.service', () => ({ postIdeasService: ideas }));

// The cache must never change an answer, only how fast it arrives, so these
// tests run against the real load path.
vi.mock('@/utils/cache', () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => undefined),
  cacheThrough: vi.fn(async (_key: string, _ttl: number, load: () => Promise<unknown>) => load()),
}));

function fakeReply() {
  const reply = {
    status: vi.fn(() => reply),
    send: vi.fn(() => reply),
  };
  return reply as unknown as FastifyReply & { send: ReturnType<typeof vi.fn> };
}

function sent(reply: ReturnType<typeof fakeReply>) {
  return (reply.send.mock.calls[0][0] as { data: Record<string, unknown> }).data;
}

const request = (parts: Partial<FastifyRequest>) => parts as FastifyRequest;
const authed = (query: Record<string, string> = {}) =>
  request({ user: { userId: 'user-1' }, query } as Partial<FastifyRequest>);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authorisation', () => {
  it('refuses the summary to an unauthenticated caller', async () => {
    await expect(
      getAnalyticsSummary(request({ query: {} } as Partial<FastifyRequest>), fakeReply())
    ).rejects.toThrow(UnauthorizedError);
    expect(repository.totals).not.toHaveBeenCalled();
  });

  it('refuses the overview to an unauthenticated caller', async () => {
    await expect(
      getAnalyticsOverview(request({ query: {} } as Partial<FastifyRequest>), fakeReply())
    ).rejects.toThrow(UnauthorizedError);
    expect(repository.publishedPosts).not.toHaveBeenCalled();
  });
});

describe('window validation', () => {
  it('rejects a window that runs backwards', async () => {
    await expect(
      getAnalyticsOverview(authed({ from: '2026-08-20', to: '2026-08-01' }), fakeReply())
    ).rejects.toThrow(BadRequestError);
  });

  it('rejects a window longer than a year', async () => {
    await expect(
      getAnalyticsOverview(authed({ from: '2020-01-01', to: '2026-08-01' }), fakeReply())
    ).rejects.toThrow(BadRequestError);
  });

  it('rejects an unparseable date', async () => {
    await expect(getAnalyticsOverview(authed({ from: 'not-a-date' }), fakeReply())).rejects.toThrow(
      BadRequestError
    );
  });
});

describe('getAnalyticsOverview', () => {
  it('returns a point for every day in the window, gaps included', async () => {
    const reply = fakeReply();

    await getAnalyticsOverview(authed({ from: '2026-08-01', to: '2026-08-05' }), reply);

    const series = sent(reply).series as Array<{ date: string; websiteViews: number }>;
    expect(series).toHaveLength(5);
    expect(series[0]).toEqual({
      date: '2026-08-01',
      websiteViews: 0,
      socialEngagements: 0,
    });
  });

  it('places each measured day against its own date', async () => {
    repository.websiteSeries.mockResolvedValueOnce([
      { date: new Date('2026-08-03T00:00:00.000Z'), _sum: { views: 12 } },
    ] as never);
    repository.socialSeries.mockResolvedValueOnce([
      { date: new Date('2026-08-04T00:00:00.000Z'), _sum: { engagements: 7 } },
    ] as never);
    const reply = fakeReply();

    await getAnalyticsOverview(authed({ from: '2026-08-01', to: '2026-08-05' }), reply);

    const series = sent(reply).series as Array<Record<string, number | string>>;
    expect(series[2]).toMatchObject({ date: '2026-08-03', websiteViews: 12 });
    expect(series[3]).toMatchObject({ date: '2026-08-04', socialEngagements: 7 });
  });

  it('lists a connected platform that carried nothing, rather than hiding it', async () => {
    repository.connectedPlatforms.mockResolvedValueOnce(['linkedin'] as never);
    const reply = fakeReply();

    await getAnalyticsOverview(authed({ from: '2026-08-01', to: '2026-08-02' }), reply);

    expect(sent(reply).platforms).toEqual([
      {
        platform: 'linkedin',
        posts: 0,
        reach: 0,
        impressions: 0,
        views: 0,
        engagements: 0,
        followers: null,
      },
    ]);
  });

  it('folds the three interaction columns into one engagement number', async () => {
    repository.connectedPlatforms.mockResolvedValueOnce(['instagram'] as never);
    repository.platformTotals.mockResolvedValueOnce([
      {
        platform: 'instagram',
        _count: { _all: 4 },
        _sum: { reach: 900, impressions: 1200, views: 800, likes: 10, comments: 3, shares: 2 },
      },
    ] as never);
    repository.followersByPlatform.mockResolvedValueOnce({ instagram: 4200 } as never);
    const reply = fakeReply();

    await getAnalyticsOverview(authed({ from: '2026-08-01', to: '2026-08-02' }), reply);

    expect(sent(reply).platforms).toEqual([
      {
        platform: 'instagram',
        posts: 4,
        reach: 900,
        impressions: 1200,
        views: 800,
        engagements: 15,
        followers: 4200,
      },
    ]);
  });

  it('orders platforms by reach', async () => {
    repository.connectedPlatforms.mockResolvedValueOnce(['facebook', 'instagram'] as never);
    repository.platformTotals.mockResolvedValueOnce([
      { platform: 'facebook', _count: { _all: 1 }, _sum: { reach: 10 } },
      { platform: 'instagram', _count: { _all: 1 }, _sum: { reach: 900 } },
    ] as never);
    const reply = fakeReply();

    await getAnalyticsOverview(authed({ from: '2026-08-01', to: '2026-08-02' }), reply);

    const platforms = sent(reply).platforms as Array<{ platform: string }>;
    expect(platforms.map(row => row.platform)).toEqual(['instagram', 'facebook']);
  });

  it('reports the window it actually used and the timezone it read times in', async () => {
    repository.reportingTimezone.mockResolvedValueOnce('Africa/Kigali' as never);
    const reply = fakeReply();

    await getAnalyticsOverview(authed({ from: '2026-08-01', to: '2026-08-02' }), reply);

    expect(sent(reply)).toMatchObject({
      from: '2026-08-01',
      to: '2026-08-02',
      timeZone: 'Africa/Kigali',
      postsAnalysed: 0,
      recommendations: [],
      topMedia: [],
    });
  });
});

describe('getAnalyticsSummary', () => {
  it('derives the completion rate, and reports zero rather than dividing by it', async () => {
    const reply = fakeReply();

    await getAnalyticsSummary(authed({ from: '2026-08-01', to: '2026-08-02' }), reply);

    expect(sent(reply)).toMatchObject({ views: 0, readCompletionRate: 0 });
  });

  it('divides completions by views once there are views', async () => {
    repository.totals.mockResolvedValueOnce({ views: 10, read_completions: 4 } as never);
    const reply = fakeReply();

    await getAnalyticsSummary(authed({ from: '2026-08-01', to: '2026-08-02' }), reply);

    expect(sent(reply)).toMatchObject({ views: 10, readCompletionRate: 0.4 });
  });
});

describe('getAnalyticsAccounts', () => {
  const account = {
    id: 'acc-1',
    platform: 'instagram',
    pageId: 'page-1',
    pageName: 'Afrisinc',
    pageAvatar: 'https://cdn.test/a.png',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('refuses an unauthenticated caller', async () => {
    await expect(
      getAnalyticsAccounts(request({ query: {} } as Partial<FastifyRequest>), fakeReply())
    ).rejects.toThrow(UnauthorizedError);
  });

  it('reports followers as unknown rather than zero before the first snapshot', async () => {
    repository.accountsForUser.mockResolvedValueOnce([account] as never);
    const reply = fakeReply();

    await getAnalyticsAccounts(authed({ from: '2026-08-01', to: '2026-08-21' }), reply);

    const rows = sent(reply).accounts as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      id: 'acc-1',
      metricsSupported: true,
      followers: null,
      followerChange: null,
      lastSnapshotAt: null,
      posts: 0,
    });
  });

  it('measures follower movement across the window', async () => {
    repository.accountsForUser.mockResolvedValueOnce([account] as never);
    repository.snapshotsSince.mockResolvedValueOnce([
      { accountId: 'acc-1', date: new Date('2026-08-20T00:00:00.000Z'), followers: 4380 },
      { accountId: 'acc-1', date: new Date('2026-08-01T00:00:00.000Z'), followers: 4200 },
    ] as never);
    const reply = fakeReply();

    await getAnalyticsAccounts(authed({ from: '2026-08-01', to: '2026-08-21' }), reply);

    const rows = sent(reply).accounts as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      followers: 4380,
      followerChange: 180,
      lastSnapshotAt: '2026-08-20',
    });
  });

  it('holds back a change it cannot measure from a single snapshot', async () => {
    repository.accountsForUser.mockResolvedValueOnce([account] as never);
    repository.snapshotsSince.mockResolvedValueOnce([
      { accountId: 'acc-1', date: new Date('2026-08-20T00:00:00.000Z'), followers: 4380 },
    ] as never);
    const reply = fakeReply();

    await getAnalyticsAccounts(authed({ from: '2026-08-01', to: '2026-08-21' }), reply);

    const rows = sent(reply).accounts as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ followers: 4380, followerChange: null });
  });

  it('joins each account to the page it publishes as', async () => {
    repository.accountsForUser.mockResolvedValueOnce([account] as never);
    repository.totalsByPage.mockResolvedValueOnce([
      {
        platform: 'instagram',
        pageId: 'page-1',
        _count: { _all: 6 },
        _sum: { reach: 900, impressions: 1400, views: 700, likes: 20, comments: 5, shares: 3 },
      },
    ] as never);
    const reply = fakeReply();

    await getAnalyticsAccounts(authed({ from: '2026-08-01', to: '2026-08-21' }), reply);

    const rows = sent(reply).accounts as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ posts: 6, reach: 900, engagements: 28 });
  });

  it('marks a platform with no metrics adapter, so a dash is not read as zero', async () => {
    repository.accountsForUser.mockResolvedValueOnce([
      { ...account, id: 'acc-2', platform: 'tiktok' },
    ] as never);
    const reply = fakeReply();

    await getAnalyticsAccounts(authed({ from: '2026-08-01', to: '2026-08-21' }), reply);

    const rows = sent(reply).accounts as Array<Record<string, unknown>>;
    expect(rows[0].metricsSupported).toBe(false);
  });

  it('reports when the platforms were last read back', async () => {
    repository.lastMetricsSync.mockResolvedValueOnce(new Date('2026-08-21T06:00:00.000Z') as never);
    const reply = fakeReply();

    await getAnalyticsAccounts(authed({ from: '2026-08-01', to: '2026-08-21' }), reply);

    expect(sent(reply).lastSyncedAt).toBe('2026-08-21T06:00:00.000Z');
  });
});

describe('getAnalyticsPlan', () => {
  const brand = {
    id: 'brand-1',
    name: 'Stories',
    slotWeekdays: '2,5',
    slotHour: 9,
    timezone: 'Africa/Kigali',
    postsPerRun: 1,
    defaultFormat: 'story',
    topics: ['property'],
  };

  it('refuses an unauthenticated caller', async () => {
    await expect(
      getAnalyticsPlan(request({ query: {} } as Partial<FastifyRequest>), fakeReply())
    ).rejects.toThrow(UnauthorizedError);
  });

  it('reports no confidence and lays no slots without a brand', async () => {
    const reply = fakeReply();

    await getAnalyticsPlan(authed({ from: '2026-08-01', to: '2026-08-21' }), reply);

    expect(sent(reply)).toMatchObject({
      confidence: 'none',
      brand: null,
      slots: [],
      timeZone: 'UTC',
    });
  });

  it('lays the plan on the brand cadence and timezone', async () => {
    repository.planningBrand.mockResolvedValueOnce(brand as never);
    groups.findActiveTargets.mockResolvedValueOnce([{ platform: 'instagram', pageId: 'ig-1' }]);
    const reply = fakeReply();

    await getAnalyticsPlan(authed({ from: '2026-08-01', to: '2026-08-21' }), reply);

    const data = sent(reply);
    expect(data).toMatchObject({
      timeZone: 'Africa/Kigali',
      brand: { id: 'brand-1', name: 'Stories' },
    });
    expect((data.slots as unknown[]).length).toBe(2);
  });

  it('falls back to the brand topics when nothing has performed', async () => {
    repository.planningBrand.mockResolvedValueOnce(brand as never);
    groups.findActiveTargets.mockResolvedValueOnce([{ platform: 'instagram', pageId: 'ig-1' }]);
    const reply = fakeReply();

    await getAnalyticsPlan(authed({ from: '2026-08-01', to: '2026-08-21' }), reply);

    const slots = sent(reply).slots as Array<{ topic: string | null; format: string }>;
    expect(slots[0].topic).toBe('property');
    expect(slots[0].format).toBe('story');
  });

  it('learns only from settled posts and says how many were left out', async () => {
    const settled = {
      id: 'old',
      platform: 'instagram',
      postFormat: 'feed',
      mediaType: 'image',
      publishedAt: new Date('2026-08-02T09:00:00Z'),
      lastMetricsUpdate: new Date('2026-08-04T09:00:00Z'),
      likes: 5,
      comments: 0,
      shares: 0,
      tags: [],
    };
    const unread = { ...settled, id: 'unread', lastMetricsUpdate: null };
    const story = { ...settled, id: 'story', postFormat: 'story' };
    repository.publishedPosts.mockResolvedValueOnce([settled, unread, story] as never);
    const reply = fakeReply();

    await getAnalyticsPlan(authed({ from: '2026-08-01', to: '2026-08-21' }), reply);

    expect(sent(reply)).toMatchObject({ postsAnalysed: 1, postsPublished: 3 });
  });

  it("learns only from the chosen brand's accounts and plans on its platforms", async () => {
    repository.planningBrand.mockResolvedValueOnce(brand as never);
    groups.findActiveTargets.mockResolvedValueOnce([
      { platform: 'instagram', pageId: 'ig-1' },
      { platform: 'facebook', pageId: 'fb-1' },
      { platform: 'instagram', pageId: 'ig-2' },
    ]);
    const reply = fakeReply();

    await getAnalyticsPlan(
      authed({ from: '2026-08-01', to: '2026-08-21', groupId: 'brand-1' }),
      reply
    );

    expect(repository.planningBrand).toHaveBeenCalledWith('user-1', 'brand-1');
    expect(groups.findActiveTargets).toHaveBeenCalledWith('brand-1');
    expect(repository.publishedPosts).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
      expect.any(Date),
      [
        { platform: 'instagram', pageId: 'ig-1' },
        { platform: 'facebook', pageId: 'fb-1' },
        { platform: 'instagram', pageId: 'ig-2' },
      ]
    );
    expect(repository.connectedPlatforms).not.toHaveBeenCalled();
    const platforms = (sent(reply).slots as Array<{ platform: string }>).map(slot => slot.platform);
    expect(new Set(platforms)).toEqual(new Set(['instagram', 'facebook']));
  });

  it('answers not found for a brand the user does not own', async () => {
    await expect(
      getAnalyticsPlan(
        authed({ from: '2026-08-01', to: '2026-08-21', groupId: 'other' }),
        fakeReply()
      )
    ).rejects.toThrow(NotFoundError);
    expect(repository.publishedPosts).not.toHaveBeenCalled();
  });

  it('reads every account the user has when there is no brand yet', async () => {
    await getAnalyticsPlan(authed({ from: '2026-08-01', to: '2026-08-21' }), fakeReply());

    expect(repository.publishedPosts).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
      expect.any(Date),
      undefined
    );
    expect(repository.connectedPlatforms).toHaveBeenCalledWith('user-1');
  });

  it('rejects a window that runs backwards', async () => {
    await expect(
      getAnalyticsPlan(authed({ from: '2026-08-20', to: '2026-08-01' }), fakeReply())
    ).rejects.toThrow(BadRequestError);
  });
});

describe('suggestPostIdeas', () => {
  it('refuses an unauthenticated caller', async () => {
    await expect(suggestPostIdeas(request({ body: {} }), fakeReply())).rejects.toThrow(
      UnauthorizedError
    );
    expect(ideas.suggest).not.toHaveBeenCalled();
  });

  it('asks for ideas on the chosen brand and window and returns them', async () => {
    ideas.suggest.mockResolvedValueOnce({ generatedAt: 'now', provider: 'claude', ideas: [] });
    const reply = fakeReply();

    await suggestPostIdeas(
      request({
        user: { userId: 'user-1' },
        body: { from: '2026-09-01', to: '2026-10-01', groupId: 'brand-1', refresh: true },
      } as Partial<FastifyRequest>),
      reply
    );

    expect(ideas.suggest).toHaveBeenCalledWith(
      'user-1',
      { from: new Date('2026-09-01T00:00:00.000Z'), to: new Date('2026-10-01T00:00:00.000Z') },
      { groupId: 'brand-1', refresh: true }
    );
    expect(sent(reply)).toEqual({ generatedAt: 'now', provider: 'claude', ideas: [] });
  });

  it('works with no body at all', async () => {
    ideas.suggest.mockResolvedValueOnce({ generatedAt: 'now', provider: 'claude', ideas: [] });

    await suggestPostIdeas(
      request({ user: { userId: 'user-1' } } as Partial<FastifyRequest>),
      fakeReply()
    );

    expect(ideas.suggest.mock.calls[0][2]).toEqual({ groupId: undefined, refresh: undefined });
  });
});
