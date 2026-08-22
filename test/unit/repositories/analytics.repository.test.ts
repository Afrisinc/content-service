import { AnalyticsRepository } from '@/repositories/analytics.repository';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakePrisma() {
  return {
    mediaAnalytics: {
      upsert: vi.fn(async () => ({ id: 'row-1' })),
      aggregate: vi.fn(async () => ({ _sum: { views: 2, read_completions: 1 } })),
      groupBy: vi.fn(async () => []),
    },
    mediaPost: {
      findFirst: vi.fn(async () => ({ id: 'post-1' })),
      findUnique: vi.fn(async () => ({ id: 'post-1' })),
      findMany: vi.fn(async () => []),
      groupBy: vi.fn(async () => []),
      count: vi.fn(async () => 3),
    },
    socialMediaAnalytics: {
      groupBy: vi.fn(async () => []),
    },
    socialMediaPost: {
      findMany: vi.fn(async () => []),
      groupBy: vi.fn(async () => []),
    },
    socialMediaAccount: {
      findMany: vi.fn(async () => []),
      groupBy: vi.fn(async () => []),
    },
    socialAccountSnapshot: {
      findMany: vi.fn(async () => []),
    },
    accountGroup: {
      findFirst: vi.fn(async () => null),
    },
  };
}

let prisma: ReturnType<typeof fakePrisma>;
let repository: AnalyticsRepository;
const date = new Date('2026-08-21T00:00:00.000Z');

beforeEach(() => {
  prisma = fakePrisma();
  repository = new AnalyticsRepository(prisma as never);
});

function upsertCall() {
  return prisma.mediaAnalytics.upsert.mock.calls[0][0] as {
    where: unknown;
    create: Record<string, number | string | Date>;
    update: Record<string, { increment: number }>;
  };
}

describe('record', () => {
  it('keys the row on the post and the day', async () => {
    await repository.record({ mediaPostId: 'post-1', date, event: 'view' });

    expect(upsertCall().where).toEqual({
      mediaPostId_date: { mediaPostId: 'post-1', date },
    });
  });

  /**
   * Increments rather than read-modify-write: two readers hitting the same post
   * in the same millisecond must not lose a count between them.
   */
  it('increments rather than overwrites', async () => {
    await repository.record({ mediaPostId: 'post-1', date, event: 'view', source: 'search' });

    expect(upsertCall().update).toEqual({
      views: { increment: 1 },
      views_search: { increment: 1 },
    });
  });

  it('seeds the row on first sight of a post that day', async () => {
    await repository.record({ mediaPostId: 'post-1', date, event: 'view', source: 'social' });

    expect(upsertCall().create).toMatchObject({ views: 1, views_social: 1 });
  });

  it.each([
    ['direct', 'views_direct'],
    ['search', 'views_search'],
    ['social', 'views_social'],
    ['newsletter', 'views_newsletter'],
    ['referral', 'views_referral'],
  ] as const)('routes a %s view to %s', async (source, column) => {
    await repository.record({ mediaPostId: 'post-1', date, event: 'view', source });

    expect(upsertCall().update).toHaveProperty(column, { increment: 1 });
  });

  it.each([
    ['facebook', 'shares_facebook'],
    ['twitter', 'shares_twitter'],
    ['linkedin', 'shares_linkedin'],
    ['whatsapp', 'shares_whatsapp'],
    ['other', 'shares_other'],
  ] as const)('routes a %s share to %s', async (platform, column) => {
    await repository.record({ mediaPostId: 'post-1', date, event: 'share', platform });

    expect(upsertCall().update).toEqual({ [column]: { increment: 1 } });
  });

  it('falls back to direct for a view with no source', async () => {
    await repository.record({ mediaPostId: 'post-1', date, event: 'view' });

    expect(upsertCall().update).toHaveProperty('views_direct', { increment: 1 });
  });

  it('falls back to other for a share with no platform', async () => {
    await repository.record({ mediaPostId: 'post-1', date, event: 'share' });

    expect(upsertCall().update).toEqual({ shares_other: { increment: 1 } });
  });

  it('counts a unique view only when the caller says the visitor is new', async () => {
    await repository.record({
      mediaPostId: 'post-1',
      date,
      event: 'view',
      countsAsUnique: true,
    });

    expect(upsertCall().update).toHaveProperty('unique_views', { increment: 1 });
  });

  it('leaves unique views alone for a returning visitor', async () => {
    await repository.record({ mediaPostId: 'post-1', date, event: 'view' });

    expect(upsertCall().update).not.toHaveProperty('unique_views');
  });

  it('touches only read completions for a finished read', async () => {
    await repository.record({ mediaPostId: 'post-1', date, event: 'read_complete' });

    expect(upsertCall().update).toEqual({ read_completions: { increment: 1 } });
  });
});

describe('resolveMediaPostId', () => {
  it('finds a post by slug', async () => {
    await expect(repository.resolveMediaPostId('a-post')).resolves.toBe('post-1');
  });

  it('returns null for a slug nobody published', async () => {
    prisma.mediaPost.findFirst.mockResolvedValueOnce(null as never);

    await expect(repository.resolveMediaPostId('missing')).resolves.toBeNull();
  });
});

describe('top', () => {
  function grouped(rows: Array<Record<string, unknown>>) {
    prisma.mediaAnalytics.groupBy.mockResolvedValueOnce(
      rows.map(row => ({ mediaPostId: row.id, _sum: row })) as never
    );
    prisma.mediaPost.findMany.mockResolvedValueOnce([
      { id: 'a', title: 'A', slug: 'a', category: 'article', published_at: date },
      { id: 'b', title: 'B', slug: 'b', category: 'article', published_at: date },
    ] as never);
  }

  it('ranks by views by default', async () => {
    grouped([
      { id: 'a', views: 5, read_completions: 1, shares_facebook: 0 },
      { id: 'b', views: 9, read_completions: 0, shares_facebook: 0 },
    ]);

    const top = await repository.top(date, date, 'views', 5);

    expect(top[0].mediaPostId).toBe('b');
  });

  it('ranks by shares across every platform, not one', async () => {
    grouped([
      { id: 'a', views: 100, shares_facebook: 1, shares_twitter: 1, shares_whatsapp: 3 },
      { id: 'b', views: 100, shares_facebook: 4 },
    ]);

    const top = await repository.top(date, date, 'shares', 5);

    expect(top[0].mediaPostId).toBe('a');
    expect(top[0].shares).toBe(5);
  });

  it('ranks by completion rate, not raw completions', async () => {
    grouped([
      { id: 'a', views: 10, read_completions: 8 },
      { id: 'b', views: 1000, read_completions: 100 },
    ]);

    const top = await repository.top(date, date, 'completion', 5);

    expect(top[0].mediaPostId).toBe('a');
  });

  it('does not divide by zero for a post nobody viewed', async () => {
    grouped([{ id: 'a', views: 0, read_completions: 0 }]);

    const top = await repository.top(date, date, 'completion', 5);

    expect(top[0].completionRate).toBe(0);
  });

  it('honours the limit', async () => {
    grouped([
      { id: 'a', views: 5 },
      { id: 'b', views: 9 },
    ]);

    await expect(repository.top(date, date, 'views', 1)).resolves.toHaveLength(1);
  });

  it('skips the post lookup when nothing was measured', async () => {
    prisma.mediaAnalytics.groupBy.mockResolvedValueOnce([] as never);

    await expect(repository.top(date, date, 'views', 5)).resolves.toEqual([]);
    expect(prisma.mediaPost.findMany).not.toHaveBeenCalled();
  });
});

describe('socialSeries', () => {
  it('does not query analytics when the user published nothing', async () => {
    await expect(repository.socialSeries('user-1', date, date)).resolves.toEqual([]);
    expect(prisma.socialMediaAnalytics.groupBy).not.toHaveBeenCalled();
  });

  it('scopes the rollup to that user’s published posts', async () => {
    prisma.socialMediaPost.findMany.mockResolvedValueOnce([{ id: 'sp-1' }] as never);

    await repository.socialSeries('user-1', date, date);

    const where = prisma.socialMediaAnalytics.groupBy.mock.calls[0][0] as {
      where: { postId: { in: string[] } };
    };
    expect(where.where.postId.in).toEqual(['sp-1']);
  });

  it('reaches back before the window, since a post keeps earning after it goes out', async () => {
    prisma.socialMediaPost.findMany.mockResolvedValueOnce([{ id: 'sp-1' }] as never);

    await repository.socialSeries('user-1', date, date);

    const args = prisma.socialMediaPost.findMany.mock.calls[0][0] as {
      where: { publishedAt: { gte: Date }; status: string };
    };
    expect(args.where.status).toBe('published');
    expect(args.where.publishedAt.gte.getTime()).toBeLessThan(date.getTime());
  });
});

describe('followersByPlatform', () => {
  it('is empty when nothing is connected', async () => {
    await expect(repository.followersByPlatform('user-1')).resolves.toEqual({});
    expect(prisma.socialAccountSnapshot.findMany).not.toHaveBeenCalled();
  });

  it('takes only the newest snapshot per account', async () => {
    prisma.socialMediaAccount.findMany.mockResolvedValueOnce([
      { id: 'acc-1', platform: 'instagram' },
    ] as never);
    prisma.socialAccountSnapshot.findMany.mockResolvedValueOnce([
      { accountId: 'acc-1', followers: 500, date },
      { accountId: 'acc-1', followers: 400, date },
    ] as never);

    await expect(repository.followersByPlatform('user-1')).resolves.toEqual({ instagram: 500 });
  });

  it('adds up several accounts on one platform', async () => {
    prisma.socialMediaAccount.findMany.mockResolvedValueOnce([
      { id: 'acc-1', platform: 'facebook' },
      { id: 'acc-2', platform: 'facebook' },
    ] as never);
    prisma.socialAccountSnapshot.findMany.mockResolvedValueOnce([
      { accountId: 'acc-1', followers: 100, date },
      { accountId: 'acc-2', followers: 25, date },
    ] as never);

    await expect(repository.followersByPlatform('user-1')).resolves.toEqual({ facebook: 125 });
  });

  it('omits an account never snapshotted rather than reporting it at zero', async () => {
    prisma.socialMediaAccount.findMany.mockResolvedValueOnce([
      { id: 'acc-1', platform: 'tiktok' },
    ] as never);

    await expect(repository.followersByPlatform('user-1')).resolves.toEqual({});
  });
});

describe('reportingTimezone', () => {
  it('falls back to UTC when the user has no brand', async () => {
    await expect(repository.reportingTimezone('user-1')).resolves.toBe('UTC');
  });

  it('falls back to UTC when the brand stored a blank timezone', async () => {
    prisma.accountGroup.findFirst.mockResolvedValueOnce({ timezone: '' } as never);

    await expect(repository.reportingTimezone('user-1')).resolves.toBe('UTC');
  });

  it('prefers the default brand', async () => {
    prisma.accountGroup.findFirst.mockResolvedValueOnce({ timezone: 'Africa/Kigali' } as never);

    await expect(repository.reportingTimezone('user-1')).resolves.toBe('Africa/Kigali');

    const args = prisma.accountGroup.findFirst.mock.calls[0][0] as { orderBy: unknown[] };
    expect(args.orderBy[0]).toEqual({ isDefault: 'desc' });
  });
});

describe('connectedPlatforms', () => {
  it('returns the distinct platforms behind the active accounts', async () => {
    prisma.socialMediaAccount.groupBy.mockResolvedValueOnce([
      { platform: 'instagram' },
      { platform: 'facebook' },
    ] as never);

    await expect(repository.connectedPlatforms('user-1')).resolves.toEqual([
      'instagram',
      'facebook',
    ]);
  });
});

describe('publishedPosts', () => {
  it('reads only published posts, newest first, under a cap', async () => {
    await repository.publishedPosts('user-1', date, date);

    const args = prisma.socialMediaPost.findMany.mock.calls[0][0] as {
      where: { userId: string; status: string };
      orderBy: unknown;
      take: number;
    };
    expect(args.where).toMatchObject({ userId: 'user-1', status: 'published' });
    expect(args.orderBy).toEqual({ publishedAt: 'desc' });
    expect(args.take).toBeGreaterThan(0);
  });
});
