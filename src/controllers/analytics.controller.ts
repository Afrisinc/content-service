import {
  analyticsRepository,
  type SharePlatform,
  type TopBy,
  type ViewSource,
} from '@/repositories/analytics.repository';
import { METRICS_SUPPORTED_PLATFORMS } from '@/helpers/analyticsCadence.helper';
import { buildRecommendations, rankPosts } from '@/helpers/analyticsInsights.helper';
import { buildWeeklyPlan, planConfidence, rankTopics } from '@/helpers/postingPlan.helper';
import { BadRequestError, UnauthorizedError } from '@/utils/http-error';
import { cacheGet, cacheSet, cacheThrough } from '@/utils/cache';
import { success } from '@/utils/response';
import { FastifyReply, FastifyRequest } from 'fastify';

interface TrackPayload {
  mediaPostId?: string;
  slug?: string;
  event: 'view' | 'read_complete' | 'share';
  source?: ViewSource;
  platform?: SharePlatform;
  visitorId?: string;
}

const VISITOR_TTL_SECONDS = 86400;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;
/**
 * Dashboard reads are rolled up daily and cost several aggregates each, so they
 * are cached long enough to absorb a page refresh but not long enough for a
 * fresh pull to go unnoticed.
 */
const REPORT_TTL_SECONDS = 300;
const TOP_MEDIA_LIMIT = 5;
const DEFAULT_SLOT_WEEKDAYS = '2,5';
const DEFAULT_SLOT_HOUR = 9;

function windowKey(prefix: string, userId: string, from: Date, to: Date): string {
  return `analytics:${prefix}:${userId}:${from.toISOString().slice(0, 10)}:${to
    .toISOString()
    .slice(0, 10)}`;
}

/** Every day in the window, so a gap in the data reads as a gap in the chart. */
function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  for (let day = from.getTime(); day <= to.getTime(); day += 86400000) {
    days.push(new Date(day).toISOString().slice(0, 10));
  }
  return days;
}

function startOfDay(when: Date): Date {
  return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()));
}

function daysAgo(days: number): Date {
  return startOfDay(new Date(Date.now() - days * 86400000));
}

function requireUserId(request: FastifyRequest): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw new UnauthorizedError('authentication required');
  }
  return userId;
}

function parseWindow(query: { from?: string; to?: string }): { from: Date; to: Date } {
  const to = query.to ? startOfDay(new Date(query.to)) : startOfDay(new Date());
  const from = query.from ? startOfDay(new Date(query.from)) : daysAgo(DEFAULT_WINDOW_DAYS);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestError('from and to must be valid dates');
  }
  if (from > to) {
    throw new BadRequestError('from must not be after to');
  }
  if ((to.getTime() - from.getTime()) / 86400000 > MAX_WINDOW_DAYS) {
    throw new BadRequestError(`the window may not exceed ${MAX_WINDOW_DAYS} days`);
  }

  return { from, to };
}

export async function trackAnalyticsEvent(request: FastifyRequest, reply: FastifyReply) {
  const payload = request.body as TrackPayload;

  const mediaPostId = payload.mediaPostId
    ? payload.mediaPostId
    : payload.slug
      ? await analyticsRepository.resolveMediaPostId(payload.slug)
      : null;

  if (!mediaPostId) {
    throw new BadRequestError('a known mediaPostId or slug is required');
  }

  if (payload.mediaPostId && !(await analyticsRepository.mediaPostExists(mediaPostId))) {
    throw new BadRequestError('a known mediaPostId or slug is required');
  }

  const date = startOfDay(new Date());
  const countsAsUnique =
    payload.event === 'view' && payload.visitorId
      ? await claimVisitor(mediaPostId, date, payload.visitorId)
      : false;

  await analyticsRepository.record({
    mediaPostId,
    date,
    event: payload.event,
    source: payload.source,
    platform: payload.platform,
    countsAsUnique,
  });

  return success(reply, 202, 'Recorded', 1004, {});
}

/**
 * True the first time a visitor is seen on a post today. Redis absent means
 * unique_views under-counts rather than the request failing, which is the right
 * trade for a call a reader is waiting on.
 */
async function claimVisitor(mediaPostId: string, date: Date, visitorId: string) {
  const key = `analytics:${mediaPostId}:${date.toISOString().slice(0, 10)}:${visitorId}`;

  if (await cacheGet<number>(key)) {
    return false;
  }

  await cacheSet(key, 1, VISITOR_TTL_SECONDS);
  return true;
}

export async function getAnalyticsSummary(request: FastifyRequest, reply: FastifyReply) {
  requireUserId(request);

  const { from, to } = parseWindow(request.query as { from?: string; to?: string });

  const payload = await cacheThrough(
    windowKey('summary', 'all', from, to),
    REPORT_TTL_SECONDS,
    () => loadSummary(from, to)
  );

  return success(reply, 200, 'Analytics summary retrieved', 1000, payload);
}

async function loadSummary(from: Date, to: Date) {
  const [totals, categories, published, top] = await Promise.all([
    analyticsRepository.totals(from, to),
    analyticsRepository.countByCategory(from, to),
    analyticsRepository.countPublished(from, to),
    analyticsRepository.top(from, to, 'views', 5),
  ]);

  const views = totals.views ?? 0;
  const completions = totals.read_completions ?? 0;

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    views,
    uniqueViews: totals.unique_views ?? 0,
    readCompletions: completions,
    readCompletionRate: views > 0 ? completions / views : 0,
    articlesPublished: published,
    sources: {
      direct: totals.views_direct ?? 0,
      search: totals.views_search ?? 0,
      social: totals.views_social ?? 0,
      newsletter: totals.views_newsletter ?? 0,
      referral: totals.views_referral ?? 0,
    },
    shares: {
      facebook: totals.shares_facebook ?? 0,
      twitter: totals.shares_twitter ?? 0,
      linkedin: totals.shares_linkedin ?? 0,
      whatsapp: totals.shares_whatsapp ?? 0,
      other: totals.shares_other ?? 0,
    },
    categories: categories.map(row => ({ category: row.category, posts: row._count._all })),
    topPosts: top,
  };
}

export async function getTopAnalytics(request: FastifyRequest, reply: FastifyReply) {
  requireUserId(request);

  const query = request.query as { days?: number; limit?: number; by?: TopBy };
  const from = daysAgo(query.days ?? 7);
  const to = startOfDay(new Date());

  const posts = await analyticsRepository.top(from, to, query.by ?? 'views', query.limit ?? 5);

  return success(reply, 200, 'Top posts retrieved', 1000, { posts });
}

/**
 * Everything the analytics dashboard draws below the headline strip.
 *
 * One call rather than four: the panels must agree on the window, and the
 * derived insights all read the same set of published posts, so splitting them
 * would cost four round trips to say one thing.
 */
export async function getAnalyticsOverview(request: FastifyRequest, reply: FastifyReply) {
  const userId = requireUserId(request);
  const { from, to } = parseWindow(request.query as { from?: string; to?: string });

  const payload = await cacheThrough(
    windowKey('overview', userId, from, to),
    REPORT_TTL_SECONDS,
    () => loadOverview(userId, from, to)
  );

  return success(reply, 200, 'Analytics overview retrieved', 1000, payload);
}

async function loadOverview(userId: string, from: Date, to: Date) {
  const [websiteSeries, socialSeries, platformTotals, followers, connected, posts, timeZone] =
    await Promise.all([
      analyticsRepository.websiteSeries(from, to),
      analyticsRepository.socialSeries(userId, from, to),
      analyticsRepository.platformTotals(userId, from, to),
      analyticsRepository.followersByPlatform(userId),
      analyticsRepository.connectedPlatforms(userId),
      analyticsRepository.publishedPosts(userId, from, to),
      analyticsRepository.reportingTimezone(userId),
    ]);

  const websiteByDay = new Map(
    websiteSeries.map(row => [row.date.toISOString().slice(0, 10), row._sum.views ?? 0])
  );
  const socialByDay = new Map(
    socialSeries.map(row => [row.date.toISOString().slice(0, 10), row._sum.engagements ?? 0])
  );

  const series = eachDay(from, to).map(date => ({
    date,
    websiteViews: websiteByDay.get(date) ?? 0,
    socialEngagements: socialByDay.get(date) ?? 0,
  }));

  const posted = new Map(platformTotals.map(row => [row.platform, row]));

  // Driven by what is connected, not by what was posted: a silent platform is
  // exactly the thing the user needs to see on this page.
  const platforms = connected.map(platform => {
    const row = posted.get(platform);
    return {
      platform,
      posts: row?._count._all ?? 0,
      reach: row?._sum.reach ?? 0,
      impressions: row?._sum.impressions ?? 0,
      views: row?._sum.views ?? 0,
      engagements: (row?._sum.likes ?? 0) + (row?._sum.comments ?? 0) + (row?._sum.shares ?? 0),
      followers: followers[platform] ?? null,
    };
  });

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    timeZone,
    series,
    platforms: platforms.sort((a, b) => b.reach - a.reach || b.posts - a.posts),
    topMedia: rankPosts(posts, TOP_MEDIA_LIMIT),
    recommendations: buildRecommendations(posts, connected, timeZone),
    postsAnalysed: posts.length,
  };
}

/**
 * Every connected account with how it is performing.
 *
 * Follower movement is read from the snapshot history rather than a single
 * current value, since "4,200 followers" says far less than "up 180 this month".
 */
export async function getAnalyticsAccounts(request: FastifyRequest, reply: FastifyReply) {
  const userId = requireUserId(request);
  const { from, to } = parseWindow(request.query as { from?: string; to?: string });

  const payload = await cacheThrough(
    windowKey('accounts', userId, from, to),
    REPORT_TTL_SECONDS,
    () => loadAccounts(userId, from, to)
  );

  return success(reply, 200, 'Connected accounts retrieved', 1000, payload);
}

async function loadAccounts(userId: string, from: Date, to: Date) {
  const accounts = await analyticsRepository.accountsForUser(userId);

  const [totals, snapshots, lastSyncedAt] = await Promise.all([
    analyticsRepository.totalsByPage(userId, from, to),
    analyticsRepository.snapshotsSince(
      accounts.map(account => account.id),
      from
    ),
    analyticsRepository.lastMetricsSync(userId),
  ]);

  const byPage = new Map(totals.map(row => [`${row.platform}:${row.pageId}`, row]));

  const history = new Map<string, Array<{ date: Date; followers: number }>>();
  for (const snapshot of snapshots) {
    const rows = history.get(snapshot.accountId) ?? [];
    rows.push({ date: snapshot.date, followers: snapshot.followers });
    history.set(snapshot.accountId, rows);
  }

  const rows = accounts.map(account => {
    const totalsRow = byPage.get(`${account.platform}:${account.pageId}`);
    // snapshotsSince returns newest first, so the tail is the start of the window.
    const trend = history.get(account.id) ?? [];
    const current = trend[0]?.followers ?? null;
    const earliest = trend.length > 1 ? trend[trend.length - 1].followers : null;

    return {
      id: account.id,
      platform: account.platform,
      pageId: account.pageId,
      pageName: account.pageName,
      pageAvatar: account.pageAvatar,
      connectedAt: account.createdAt.toISOString(),
      metricsSupported: METRICS_SUPPORTED_PLATFORMS.includes(account.platform),
      followers: current,
      followerChange: current !== null && earliest !== null ? current - earliest : null,
      lastSnapshotAt: trend[0]?.date.toISOString().slice(0, 10) ?? null,
      posts: totalsRow?._count._all ?? 0,
      reach: totalsRow?._sum.reach ?? 0,
      impressions: totalsRow?._sum.impressions ?? 0,
      views: totalsRow?._sum.views ?? 0,
      engagements:
        (totalsRow?._sum.likes ?? 0) +
        (totalsRow?._sum.comments ?? 0) +
        (totalsRow?._sum.shares ?? 0),
    };
  });

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
    accounts: rows.sort((a, b) => b.reach - a.reach || (b.followers ?? 0) - (a.followers ?? 0)),
  };
}

/**
 * What to post next week, derived from what has actually performed.
 *
 * The slots come from the brand's own posting cadence — a plan the agents
 * cannot run is not a plan — and the evidence decides what fills them.
 */
export async function getAnalyticsPlan(request: FastifyRequest, reply: FastifyReply) {
  const userId = requireUserId(request);
  const { from, to } = parseWindow(request.query as { from?: string; to?: string });

  const payload = await cacheThrough(windowKey('plan', userId, from, to), REPORT_TTL_SECONDS, () =>
    loadPlan(userId, from, to)
  );

  return success(reply, 200, 'Posting plan retrieved', 1000, payload);
}

async function loadPlan(userId: string, from: Date, to: Date) {
  const [posts, connected, brand] = await Promise.all([
    analyticsRepository.publishedPosts(userId, from, to),
    analyticsRepository.connectedPlatforms(userId),
    analyticsRepository.planningBrand(userId),
  ]);

  const timeZone = brand?.timezone || 'UTC';
  const confidence = planConfidence(posts);

  const cadence = {
    slotWeekdays: brand?.slotWeekdays ?? DEFAULT_SLOT_WEEKDAYS,
    slotHour: brand?.slotHour ?? DEFAULT_SLOT_HOUR,
    timezone: timeZone,
    postsPerRun: brand?.postsPerRun ?? 1,
    defaultFormat: brand?.defaultFormat ?? 'post',
    topics: brand?.topics ?? [],
  };

  const slots = brand ? buildWeeklyPlan(posts, connected, cadence) : [];

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    timeZone,
    confidence,
    brand: brand ? { id: brand.id, name: brand.name } : null,
    topics: rankTopics(posts, 5),
    recommendations: buildRecommendations(posts, connected, timeZone),
    slots,
    postsAnalysed: posts.length,
  };
}
