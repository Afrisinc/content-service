import { prisma } from '@/database/prismaClient';
import { Prisma, PrismaClient } from '@prisma/client';

export type ViewSource = 'direct' | 'search' | 'social' | 'newsletter' | 'referral';
export type SharePlatform = 'facebook' | 'twitter' | 'linkedin' | 'whatsapp' | 'other';

const VIEW_SOURCE_COLUMN: Record<ViewSource, keyof Prisma.MediaAnalyticsUpdateInput> = {
  direct: 'views_direct',
  search: 'views_search',
  social: 'views_social',
  newsletter: 'views_newsletter',
  referral: 'views_referral',
};

const SHARE_COLUMN: Record<SharePlatform, keyof Prisma.MediaAnalyticsUpdateInput> = {
  facebook: 'shares_facebook',
  twitter: 'shares_twitter',
  linkedin: 'shares_linkedin',
  whatsapp: 'shares_whatsapp',
  other: 'shares_other',
};

const TOP_LIMIT = 50;
const POST_SCAN_LIMIT = 500;
const ACCOUNT_LIMIT = 100;
const SNAPSHOT_SCAN_LIMIT = 500;
/** How long a published post keeps earning rows worth charting. */
const TRAILING_MS = 14 * 86400000;
const PUBLISHED_STATUS = 'published';

export type PublishedPostRow = Awaited<ReturnType<AnalyticsRepository['publishedPosts']>>[number];

export interface TrackedEvent {
  mediaPostId: string;
  date: Date;
  event: 'view' | 'read_complete' | 'share';
  source?: ViewSource;
  platform?: SharePlatform;
  countsAsUnique?: boolean;
}

export type TopBy = 'views' | 'shares' | 'completion';

export class AnalyticsRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async resolveMediaPostId(slug: string): Promise<string | null> {
    const post = await this.prisma.mediaPost.findFirst({
      where: { slug },
      select: { id: true },
    });
    return post?.id ?? null;
  }

  async mediaPostExists(id: string): Promise<boolean> {
    const post = await this.prisma.mediaPost.findUnique({ where: { id }, select: { id: true } });
    return Boolean(post);
  }

  /**
   * One atomic upsert per event. Increments rather than read-modify-write, so
   * concurrent hits on the same post cannot lose a count.
   */
  async record(event: TrackedEvent) {
    const where = { mediaPostId_date: { mediaPostId: event.mediaPostId, date: event.date } };
    const increments = this.incrementsFor(event);
    const created = this.seedFor(event);

    return this.prisma.mediaAnalytics.upsert({
      where,
      create: { mediaPostId: event.mediaPostId, date: event.date, ...created },
      update: increments,
    });
  }

  private incrementsFor(event: TrackedEvent): Prisma.MediaAnalyticsUpdateInput {
    if (event.event === 'read_complete') {
      return { read_completions: { increment: 1 } };
    }

    if (event.event === 'share') {
      const column = SHARE_COLUMN[event.platform ?? 'other'];
      return { [column]: { increment: 1 } } as Prisma.MediaAnalyticsUpdateInput;
    }

    const column = VIEW_SOURCE_COLUMN[event.source ?? 'direct'];
    return {
      views: { increment: 1 },
      [column]: { increment: 1 },
      ...(event.countsAsUnique ? { unique_views: { increment: 1 } } : {}),
    } as Prisma.MediaAnalyticsUpdateInput;
  }

  private seedFor(
    event: TrackedEvent
  ): Prisma.MediaAnalyticsCreateInput extends never ? never : Record<string, number> {
    if (event.event === 'read_complete') {
      return { read_completions: 1 };
    }

    if (event.event === 'share') {
      return { [SHARE_COLUMN[event.platform ?? 'other']]: 1 } as Record<string, number>;
    }

    return {
      views: 1,
      [VIEW_SOURCE_COLUMN[event.source ?? 'direct']]: 1,
      ...(event.countsAsUnique ? { unique_views: 1 } : {}),
    } as Record<string, number>;
  }

  async totals(from: Date, to: Date) {
    const totals = await this.prisma.mediaAnalytics.aggregate({
      where: { date: { gte: from, lte: to } },
      _sum: {
        views: true,
        unique_views: true,
        read_completions: true,
        views_direct: true,
        views_search: true,
        views_social: true,
        views_newsletter: true,
        views_referral: true,
        shares_facebook: true,
        shares_twitter: true,
        shares_linkedin: true,
        shares_whatsapp: true,
        shares_other: true,
      },
    });

    return totals._sum;
  }

  /** Per-post rollups for the window, ordered by the metric asked for. */
  async top(from: Date, to: Date, by: TopBy, limit: number) {
    const grouped = await this.prisma.mediaAnalytics.groupBy({
      by: ['mediaPostId'],
      where: { date: { gte: from, lte: to } },
      _sum: {
        views: true,
        unique_views: true,
        read_completions: true,
        shares_facebook: true,
        shares_twitter: true,
        shares_linkedin: true,
        shares_whatsapp: true,
        shares_other: true,
      },
      orderBy: { _sum: { views: 'desc' } },
      take: TOP_LIMIT,
    });

    const ranked = grouped
      .map(row => {
        const views = row._sum.views ?? 0;
        const completions = row._sum.read_completions ?? 0;
        const shares =
          (row._sum.shares_facebook ?? 0) +
          (row._sum.shares_twitter ?? 0) +
          (row._sum.shares_linkedin ?? 0) +
          (row._sum.shares_whatsapp ?? 0) +
          (row._sum.shares_other ?? 0);

        return {
          mediaPostId: row.mediaPostId,
          views,
          uniqueViews: row._sum.unique_views ?? 0,
          readCompletions: completions,
          shares,
          completionRate: views > 0 ? completions / views : 0,
        };
      })
      .sort((a, b) => this.rank(b, by) - this.rank(a, by))
      .slice(0, limit);

    if (!ranked.length) {
      return [];
    }

    const posts = await this.prisma.mediaPost.findMany({
      where: { id: { in: ranked.map(row => row.mediaPostId) } },
      select: { id: true, title: true, slug: true, category: true, published_at: true },
    });
    const byId = new Map(posts.map(post => [post.id, post]));

    return ranked.map(row => ({ ...row, post: byId.get(row.mediaPostId) ?? null }));
  }

  private rank(row: { views: number; shares: number; completionRate: number }, by: TopBy): number {
    if (by === 'shares') {
      return row.shares;
    }
    if (by === 'completion') {
      return row.completionRate;
    }
    return row.views;
  }

  async countByCategory(from: Date, to: Date) {
    return this.prisma.mediaPost.groupBy({
      by: ['category'],
      where: { published_at: { gte: from, lte: to } },
      _count: { _all: true },
    });
  }

  async countPublished(from: Date, to: Date): Promise<number> {
    return this.prisma.mediaPost.count({ where: { published_at: { gte: from, lte: to } } });
  }

  /** Website reach per day, for the trend line. */
  async websiteSeries(from: Date, to: Date) {
    return this.prisma.mediaAnalytics.groupBy({
      by: ['date'],
      where: { date: { gte: from, lte: to } },
      _sum: { views: true, unique_views: true, read_completions: true },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Social reach per day for one user's posts.
   *
   * `SocialMediaAnalytics` carries no user column, so the window is scoped by
   * post id. The id list is drawn from posts published in the window plus the
   * fortnight before it, because a post keeps accruing engagement for days
   * after it goes out and its later rows belong in the chart.
   */
  async socialSeries(userId: string, from: Date, to: Date) {
    const postIds = await this.publishedPostIds(userId, new Date(from.getTime() - TRAILING_MS), to);
    if (!postIds.length) {
      return [];
    }

    return this.prisma.socialMediaAnalytics.groupBy({
      by: ['date'],
      where: { postId: { in: postIds }, date: { gte: from, lte: to } },
      _sum: { engagements: true, impressions: true, reaches: true },
      orderBy: { date: 'asc' },
    });
  }

  private async publishedPostIds(userId: string, from: Date, to: Date): Promise<string[]> {
    const posts = await this.prisma.socialMediaPost.findMany({
      where: { userId, status: PUBLISHED_STATUS, publishedAt: { gte: from, lte: to } },
      select: { id: true },
      orderBy: { publishedAt: 'desc' },
      take: POST_SCAN_LIMIT,
    });
    return posts.map(post => post.id);
  }

  /** What each connected platform carried in the window. */
  async platformTotals(userId: string, from: Date, to: Date) {
    return this.prisma.socialMediaPost.groupBy({
      by: ['platform'],
      where: { userId, status: PUBLISHED_STATUS, publishedAt: { gte: from, lte: to } },
      _sum: {
        reach: true,
        impressions: true,
        views: true,
        likes: true,
        comments: true,
        shares: true,
      },
      _count: { _all: true },
    });
  }

  /**
   * Follower count per platform, taken from each account's most recent snapshot.
   *
   * Snapshots are a history, so the newest row per account is the current
   * number; accounts never snapshotted contribute nothing rather than a zero
   * that would read as "lost all followers".
   */
  async followersByPlatform(userId: string): Promise<Record<string, number>> {
    const accounts = await this.prisma.socialMediaAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true, platform: true },
      take: ACCOUNT_LIMIT,
    });

    if (!accounts.length) {
      return {};
    }

    const snapshots = await this.prisma.socialAccountSnapshot.findMany({
      where: { accountId: { in: accounts.map(account => account.id) } },
      select: { accountId: true, followers: true, date: true },
      orderBy: { date: 'desc' },
      take: SNAPSHOT_SCAN_LIMIT,
    });

    const latest = new Map<string, number>();
    for (const snapshot of snapshots) {
      if (!latest.has(snapshot.accountId)) {
        latest.set(snapshot.accountId, snapshot.followers);
      }
    }

    const byPlatform: Record<string, number> = {};
    for (const account of accounts) {
      const followers = latest.get(account.id);
      if (followers !== undefined) {
        byPlatform[account.platform] = (byPlatform[account.platform] ?? 0) + followers;
      }
    }

    return byPlatform;
  }

  /** Platforms the user has connected, whether or not they were posted to. */
  async connectedPlatforms(userId: string): Promise<string[]> {
    const accounts = await this.prisma.socialMediaAccount.groupBy({
      by: ['platform'],
      where: { userId, isActive: true },
    });
    return accounts.map(account => account.platform);
  }

  /**
   * Published posts with the columns every derived insight needs, fetched once.
   *
   * Ranking, best-window and format comparisons all read the same rows, so they
   * share one query rather than three near-identical ones.
   */
  async publishedPosts(userId: string, from: Date, to: Date) {
    return this.prisma.socialMediaPost.findMany({
      where: { userId, status: PUBLISHED_STATUS, publishedAt: { gte: from, lte: to } },
      select: {
        id: true,
        platform: true,
        postUrl: true,
        message: true,
        caption: true,
        name: true,
        mediaType: true,
        postFormat: true,
        publishedAt: true,
        tags: true,
        mediaPost: { select: { category: true } },
        reach: true,
        impressions: true,
        views: true,
        likes: true,
        comments: true,
        shares: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: POST_SCAN_LIMIT,
    });
  }

  /**
   * Published posts whose metrics may have moved since they were last read.
   *
   * The window is deliberately loose — the cadence rules decide what is
   * actually due — because the exact interval depends on each post's age and
   * cannot be expressed as one comparison in SQL.
   */
  async postsDueForMetrics(options: {
    platforms: string[];
    publishedFrom: Date;
    publishedBefore: Date;
    staleBefore: Date;
    limit: number;
  }) {
    return this.prisma.socialMediaPost.findMany({
      where: {
        status: PUBLISHED_STATUS,
        platform: { in: options.platforms },
        postId: { not: null },
        publishedAt: { gte: options.publishedFrom, lte: options.publishedBefore },
        OR: [{ lastMetricsUpdate: null }, { lastMetricsUpdate: { lt: options.staleBefore } }],
      },
      select: {
        id: true,
        userId: true,
        platform: true,
        pageId: true,
        postId: true,
        accessTokenEnc: true,
        publishedAt: true,
        lastMetricsUpdate: true,
      },
      orderBy: [{ lastMetricsUpdate: { sort: 'asc', nulls: 'first' } }, { publishedAt: 'desc' }],
      take: options.limit,
    });
  }

  /** Active accounts with no snapshot recorded for the given day. */
  async accountsNeedingSnapshot(date: Date, platforms: string[], limit: number) {
    const accounts = await this.prisma.socialMediaAccount.findMany({
      where: { isActive: true, platform: { in: platforms } },
      select: {
        id: true,
        userId: true,
        platform: true,
        pageId: true,
        pageName: true,
        accessToken: true,
      },
      take: limit,
    });

    if (!accounts.length) {
      return [];
    }

    const taken = await this.prisma.socialAccountSnapshot.findMany({
      where: { accountId: { in: accounts.map(account => account.id) }, date },
      select: { accountId: true },
    });
    const done = new Set(taken.map(row => row.accountId));

    return accounts.filter(account => !done.has(account.id));
  }

  async recordAccountSnapshot(
    accountId: string,
    date: Date,
    platform: string,
    metrics: {
      followers: number;
      follows: number;
      postsCount: number;
      reach: number;
      impressions: number;
      profileViews: number;
    }
  ) {
    return this.prisma.socialAccountSnapshot.upsert({
      where: { accountId_date: { accountId, date } },
      create: { accountId, date, platform, ...metrics },
      update: { platform, ...metrics },
    });
  }

  /** Every connected account, with the page details the dashboard shows. */
  async accountsForUser(userId: string) {
    return this.prisma.socialMediaAccount.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        platform: true,
        pageId: true,
        pageName: true,
        pageAvatar: true,
        createdAt: true,
      },
      orderBy: [{ platform: 'asc' }, { createdAt: 'asc' }],
      take: ACCOUNT_LIMIT,
    });
  }

  /** What each page carried in the window, keyed the way accounts are keyed. */
  async totalsByPage(userId: string, from: Date, to: Date) {
    return this.prisma.socialMediaPost.groupBy({
      by: ['platform', 'pageId'],
      where: { userId, status: PUBLISHED_STATUS, publishedAt: { gte: from, lte: to } },
      _sum: {
        reach: true,
        impressions: true,
        views: true,
        likes: true,
        comments: true,
        shares: true,
      },
      _count: { _all: true },
    });
  }

  /**
   * Follower snapshots for a set of accounts, newest first.
   *
   * The caller needs both the current number and one from the start of the
   * window to show a change, so this returns the rows rather than a single value.
   */
  async snapshotsSince(accountIds: string[], since: Date) {
    if (!accountIds.length) {
      return [];
    }

    return this.prisma.socialAccountSnapshot.findMany({
      where: { accountId: { in: accountIds }, date: { gte: since } },
      select: { accountId: true, date: true, followers: true, postsCount: true },
      orderBy: { date: 'desc' },
      take: SNAPSHOT_SCAN_LIMIT,
    });
  }

  /** The brand whose cadence a plan should be laid out on. */
  async planningBrand(userId: string) {
    return this.prisma.accountGroup.findFirst({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        slotWeekdays: true,
        slotHour: true,
        timezone: true,
        postsPerRun: true,
        defaultFormat: true,
        topics: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /** When the platforms were last read back for this user. */
  async lastMetricsSync(userId: string): Promise<Date | null> {
    const latest = await this.prisma.socialMediaPost.findFirst({
      where: { userId, lastMetricsUpdate: { not: null } },
      select: { lastMetricsUpdate: true },
      orderBy: { lastMetricsUpdate: 'desc' },
    });
    return latest?.lastMetricsUpdate ?? null;
  }

  /** The timezone the user's own posting schedule runs on. */
  async reportingTimezone(userId: string): Promise<string> {
    const group = await this.prisma.accountGroup.findFirst({
      where: { userId, isActive: true },
      select: { timezone: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return group?.timezone || 'UTC';
  }
}

export const analyticsRepository = new AnalyticsRepository();
