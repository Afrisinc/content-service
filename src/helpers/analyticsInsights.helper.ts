import type { PublishedPostRow } from '@/repositories/analytics.repository';

/**
 * What the numbers mean, kept apart from how they are fetched.
 *
 * Every function here is pure: the repository hands over one set of published
 * rows and each insight reads it, so a dashboard costs one query rather than
 * one per panel.
 */

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Below this a "best time to post" is a coincidence, not a finding. */
const MIN_POSTS_FOR_WINDOW = 6;
const MIN_POSTS_PER_BUCKET = 2;
const MIN_POSTS_PER_FORMAT = 3;
/** How much better a format must do before it is worth changing plans over. */
const MATERIAL_LIFT = 0.15;
const WINDOW_HOURS = 2;

export interface Recommendation {
  kind: 'timing' | 'format' | 'platform' | 'volume';
  title: string;
  detail: string;
}

export function engagementOf(post: PublishedPostRow): number {
  return post.likes + post.comments + post.shares;
}

/** The hour and weekday an instant reads as in the user's own timezone. */
function localParts(when: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(when);

  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '';

  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(find('weekday'));
  const hour = Number(find('hour'));

  return { weekday, hour: Number.isFinite(hour) ? hour % 24 : 0 };
}

interface Bucket {
  posts: number;
  engagements: number;
}

function averagesByKey(
  posts: PublishedPostRow[],
  keyOf: (post: PublishedPostRow) => string | null
): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();

  for (const post of posts) {
    const key = keyOf(post);
    if (key === null) {
      continue;
    }
    const bucket = buckets.get(key) ?? { posts: 0, engagements: 0 };
    bucket.posts += 1;
    bucket.engagements += engagementOf(post);
    buckets.set(key, bucket);
  }

  return buckets;
}

function meanEngagement(posts: PublishedPostRow[]): number {
  if (!posts.length) {
    return 0;
  }
  return posts.reduce((total, post) => total + engagementOf(post), 0) / posts.length;
}

/**
 * The weekday-and-hour band that has earned the most engagement per post.
 *
 * Reported as a band rather than an exact hour: a platform's delivery does not
 * turn on the minute, and a two-hour window is what somebody can actually act on.
 */
export function bestPostingWindow(
  posts: PublishedPostRow[],
  timeZone: string
): Recommendation | null {
  const dated = posts.filter(post => post.publishedAt !== null);
  if (dated.length < MIN_POSTS_FOR_WINDOW) {
    return null;
  }

  const buckets = averagesByKey(dated, post => {
    const { weekday, hour } = localParts(post.publishedAt as Date, timeZone);
    if (weekday < 0) {
      return null;
    }
    return `${weekday}:${Math.floor(hour / WINDOW_HOURS) * WINDOW_HOURS}`;
  });

  let best: { key: string; average: number } | null = null;
  for (const [key, bucket] of buckets) {
    if (bucket.posts < MIN_POSTS_PER_BUCKET) {
      continue;
    }
    const average = bucket.engagements / bucket.posts;
    if (!best || average > best.average) {
      best = { key, average };
    }
  }

  if (!best || best.average <= 0) {
    return null;
  }

  const [weekday, hour] = best.key.split(':').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    kind: 'timing',
    title: `${WEEKDAY_NAMES[weekday]} ${pad(hour)}:00–${pad(hour + WINDOW_HOURS)}:00`,
    detail: `Best window so far — ${Math.round(best.average)} engagements per post on average.`,
  };
}

/** Whether one media type is reliably outperforming the rest. */
export function bestFormat(posts: PublishedPostRow[]): Recommendation | null {
  const typed = posts.filter(post => Boolean(post.mediaType));
  if (typed.length < MIN_POSTS_FOR_WINDOW) {
    return null;
  }

  const overall = meanEngagement(typed);
  if (overall <= 0) {
    return null;
  }

  const buckets = averagesByKey(typed, post => post.mediaType);

  let best: { format: string; average: number } | null = null;
  for (const [format, bucket] of buckets) {
    if (bucket.posts < MIN_POSTS_PER_FORMAT) {
      continue;
    }
    const average = bucket.engagements / bucket.posts;
    if (!best || average > best.average) {
      best = { format, average };
    }
  }

  if (!best) {
    return null;
  }

  const lift = best.average / overall - 1;
  if (lift < MATERIAL_LIFT) {
    return null;
  }

  return {
    kind: 'format',
    title: `${best.format} earns ${Math.round(lift * 100)}% more`,
    detail:
      `${best.format} averages ${Math.round(best.average)} engagements ` +
      `against ${Math.round(overall)} across everything else.`,
  };
}

/** A platform that is connected but barely used is the cheapest reach available. */
export function idlePlatform(
  posts: PublishedPostRow[],
  connected: string[]
): Recommendation | null {
  if (connected.length < 2) {
    return null;
  }

  const counts = new Map<string, number>(connected.map(platform => [platform, 0]));
  for (const post of posts) {
    counts.set(post.platform, (counts.get(post.platform) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => a[1] - b[1]);
  const [quietest, quietestCount] = sorted[0];
  const busiest = sorted[sorted.length - 1][1];

  if (busiest === 0 || quietestCount >= busiest / 2) {
    return null;
  }

  return {
    kind: 'platform',
    title: `${quietest} is underused`,
    detail:
      quietestCount === 0
        ? 'Connected but nothing published to it this window, while the ' +
          `busiest platform took ${busiest}.`
        : `${quietestCount} post(s) against ${busiest} on the busiest platform.`,
  };
}

/** Nothing to say is a legitimate answer; it is not an error. */
export function buildRecommendations(
  posts: PublishedPostRow[],
  connected: string[],
  timeZone: string
): Recommendation[] {
  return [
    bestPostingWindow(posts, timeZone),
    bestFormat(posts),
    idlePlatform(posts, connected),
  ].filter((entry): entry is Recommendation => entry !== null);
}

export interface RankedPost {
  id: string;
  platform: string;
  title: string;
  mediaType: string | null;
  postUrl: string | null;
  publishedAt: string | null;
  engagements: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
}

function titleOf(post: PublishedPostRow): string {
  const text = post.name || post.message || post.caption || '';
  const firstLine = text.split('\n').find(line => line.trim().length > 0) ?? '';
  const trimmed = firstLine.trim();
  return trimmed.length > 90 ? `${trimmed.slice(0, 87)}…` : trimmed || 'Untitled post';
}

export function rankPosts(posts: PublishedPostRow[], limit: number): RankedPost[] {
  return posts
    .map(post => ({
      id: post.id,
      platform: post.platform,
      title: titleOf(post),
      mediaType: post.mediaType ?? post.postFormat ?? null,
      postUrl: post.postUrl,
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      engagements: engagementOf(post),
      reach: post.reach,
      impressions: post.impressions,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
    }))
    .sort((a, b) => b.engagements - a.engagements || b.reach - a.reach)
    .slice(0, limit);
}
