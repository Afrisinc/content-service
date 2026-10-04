import {
  engagementOf,
  intentOf,
  leadBy,
  median,
  perReach,
  scorerFor,
  scoredValues,
  type Lead,
} from '@/helpers/postScore.helper';
import type { PublishedPostRow } from '@/repositories/analytics.repository';

export { engagementOf } from '@/helpers/postScore.helper';

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
const SETTLE_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;
const PRIOR_POSTS = 2;

const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  twitter: 'X',
  x: 'X',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  threads: 'Threads',
};

export type ContentFormat = 'post' | 'single' | 'story' | 'video' | 'reel';

const FORMAT_NAMES: Record<ContentFormat, string> = {
  post: 'Carousels',
  single: 'Single images',
  story: 'Stories',
  video: 'Videos',
  reel: 'Reels',
};

export interface FormatLead {
  format: ContentFormat;
  average: number;
  posts: number;
  restAverage: number;
  restPosts: number;
  lift: number;
}

export interface Recommendation {
  kind: 'timing' | 'format' | 'platform' | 'volume' | 'intent';
  title: string;
  detail: string;
}

export function platformName(platform: string): string {
  return (
    PLATFORM_NAMES[platform.toLowerCase()] ?? platform.charAt(0).toUpperCase() + platform.slice(1)
  );
}

export function contentFormatOf(post: PublishedPostRow): ContentFormat | null {
  if (post.postFormat === 'story' || post.postFormat === 'reel') {
    return post.postFormat;
  }
  switch (post.mediaType) {
    case 'carousel':
      return 'post';
    case 'image':
      return 'single';
    case 'video':
      return 'video';
    default:
      return null;
  }
}

export function comparablePosts(posts: PublishedPostRow[], now: Date = new Date()) {
  const settledBefore = now.getTime() - SETTLE_HOURS * HOUR_MS;
  return posts.filter(
    post =>
      post.publishedAt !== null &&
      post.publishedAt.getTime() <= settledBefore &&
      post.lastMetricsUpdate !== null &&
      post.postFormat !== 'story'
  );
}

const percent = (lift: number) => `${Math.round(lift * 100)}%`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The hour and weekday an instant reads as in the user's own timezone. */
function localParts(when: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
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

/**
 * The weekday-and-hour band that has earned the most engagement per post.
 *
 * Reported as a band rather than an exact hour: a platform's delivery does not
 * turn on the minute, and a two-hour window is what somebody can actually act on.
 */
export function bestPostingWindow(
  posts: PublishedPostRow[],
  timeZone: string,
  slotHour?: number
): Recommendation | null {
  const dated = posts.filter(post => post.publishedAt !== null);
  if (dated.length < MIN_POSTS_FOR_WINDOW) {
    return null;
  }

  const scorer = scorerFor(dated);
  const overall = median(scoredValues(dated, scorer.scoreOf));
  if (overall <= 0) {
    return null;
  }

  const buckets = new Map<string, number[]>();
  for (const post of dated) {
    const score = scorer.scoreOf(post);
    const { weekday, hour } = localParts(post.publishedAt as Date, timeZone);
    if (score === null || weekday < 0) {
      continue;
    }
    const key = `${weekday}:${Math.floor(hour / WINDOW_HOURS) * WINDOW_HOURS}`;
    buckets.set(key, [...(buckets.get(key) ?? []), score]);
  }

  let best: { key: string; value: number; posts: number; shrunk: number } | null = null;
  for (const [key, scores] of buckets) {
    if (scores.length < MIN_POSTS_PER_BUCKET) {
      continue;
    }
    const value = median(scores);
    const shrunk = (scores.length * value + PRIOR_POSTS * overall) / (scores.length + PRIOR_POSTS);
    if (!best || shrunk > best.shrunk) {
      best = { key, value, posts: scores.length, shrunk };
    }
  }

  if (!best) {
    return null;
  }

  const lift = best.value / overall - 1;
  if (lift < MATERIAL_LIFT) {
    return null;
  }

  const [weekday, hour] = best.key.split(':').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');
  const outsideSlot =
    slotHour !== undefined && (slotHour < hour || slotHour >= hour + WINDOW_HOURS);

  return {
    kind: 'timing',
    title: `${WEEKDAY_NAMES[weekday]} ${pad(hour)}:00–${pad(hour + WINDOW_HOURS)}:00`,
    detail:
      `${scorer.describe(best.value)}, ${percent(lift)} above your typical post, ` +
      `across ${plural(best.posts, 'post')}.` +
      (outsideSlot
        ? ` Your brand posts at ${pad(slotHour)}:00 — try moving a slot into this window.`
        : ''),
  };
}

export function leadingFormat(
  posts: PublishedPostRow[],
  allowed?: readonly ContentFormat[]
): FormatLead | null {
  const scorer = scorerFor(posts);
  const lead = leadBy<ContentFormat>(posts, {
    keyOf: post => {
      const format = contentFormatOf(post);
      return format !== null && (!allowed || allowed.includes(format)) ? format : null;
    },
    valueOf: scorer.scoreOf,
    minPerGroup: MIN_POSTS_PER_FORMAT,
    minTotal: MIN_POSTS_FOR_WINDOW,
    minLift: MATERIAL_LIFT,
  });
  return lead && formatLead(lead);
}

function formatLead(lead: Lead<ContentFormat>): FormatLead {
  return {
    format: lead.key,
    average: lead.value,
    posts: lead.posts,
    restAverage: lead.restValue,
    restPosts: lead.restPosts,
    lift: lead.lift,
  };
}

const multiple = (lift: number) => `${(lift + 1).toFixed(1).replace(/\.0$/, '')}×`;

const howMuchMore = (lift: number, noun: string) =>
  lift >= 1 ? `${multiple(lift)} the ${noun}` : `${percent(lift)} more ${noun}`;

/** Whether one media type is reliably outperforming the rest. */
export function bestFormat(posts: PublishedPostRow[]): Recommendation | null {
  const lead = leadingFormat(posts);
  if (!lead) {
    return null;
  }

  const { describe, figure } = scorerFor(posts);

  return {
    kind: 'format',
    title: `${FORMAT_NAMES[lead.format]} earn ${howMuchMore(lead.lift, 'engagement')}`,
    detail:
      `${describe(lead.average)} across ${plural(lead.posts, 'post')}, against ` +
      `${figure(lead.restAverage)} for everything else (${plural(lead.restPosts, 'post')}).`,
  };
}

export function mostSaved(posts: PublishedPostRow[]): Recommendation | null {
  const valueOf = perReach(posts, intentOf);
  const lead = leadBy<ContentFormat>(posts, {
    keyOf: contentFormatOf,
    valueOf,
    minPerGroup: MIN_POSTS_PER_FORMAT,
    minTotal: MIN_POSTS_FOR_WINDOW,
    minLift: MATERIAL_LIFT,
    aggregate: 'mean',
  });
  if (!lead) {
    return null;
  }

  const rate = scorerFor(posts).mode === 'rate';
  const figure = (value: number) => (rate ? (value * 1000).toFixed(1) : value.toFixed(1));
  const unit = rate ? 'per 1,000 people reached' : 'per post';

  return {
    kind: 'intent',
    title: `${FORMAT_NAMES[lead.key]} get ${howMuchMore(lead.lift, 'saves and clicks')}`,
    detail:
      `Saves, link clicks and profile visits: ${figure(lead.value)} ${unit}, against ` +
      `${figure(lead.restValue)} for other formats. These are the people most likely ` +
      'to come back, so lead with this format for content you want followed.',
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

  const busiestName = platformName(sorted[sorted.length - 1][0]);

  return {
    kind: 'platform',
    title: `${platformName(quietest)} is underused`,
    detail:
      quietestCount === 0
        ? `Connected, but nothing went out there this window while ${busiestName} ` +
          `took ${plural(busiest, 'post')}. Reuse your best posts there first.`
        : `${plural(quietestCount, 'post')} against ${busiest} on ${busiestName}. ` +
          'Reuse your best posts there first.',
  };
}

/** Nothing to say is a legitimate answer; it is not an error. */
export function buildRecommendations(
  posts: PublishedPostRow[],
  connected: string[],
  timeZone: string,
  options: { slotHour?: number; volume?: PublishedPostRow[] } = {}
): Recommendation[] {
  return [
    bestPostingWindow(posts, timeZone, options.slotHour),
    bestFormat(posts),
    mostSaved(posts),
    idlePlatform(options.volume ?? posts, connected),
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
