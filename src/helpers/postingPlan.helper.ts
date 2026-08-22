import { engagementOf } from '@/helpers/analyticsInsights.helper';
import { nextFreeSlot, parseWeekdays } from '@/helpers/postingSlot.helper';
import type { PublishedPostRow } from '@/repositories/analytics.repository';

const MIN_POSTS_FOR_TOPIC = 2;
const MIN_POSTS_FOR_CONFIDENCE = 6;
const GOOD_EVIDENCE_POSTS = 20;
const MAX_SLOTS = 14;

export interface TopicPerformance {
  topic: string;
  posts: number;
  averageEngagement: number;
}

export interface PlannedSlot {
  when: string;
  platform: string;
  format: string;
  topic: string | null;
  reason: string;
}

export interface BrandCadence {
  slotWeekdays: string;
  slotHour: number;
  timezone: string;
  postsPerRun: number;
  defaultFormat: string;
  topics: string[];
}

export type PlanConfidence = 'none' | 'low' | 'good';

/** The label a post should be judged under: its source category, else its tags. */
function topicsOf(post: PublishedPostRow): string[] {
  const category = (post as { mediaPost?: { category?: string | null } }).mediaPost?.category;
  if (category) {
    return [category];
  }

  const tags = (post as { tags?: string[] }).tags ?? [];
  return tags.filter(tag => tag.trim().length > 0).slice(0, 3);
}

/**
 * Subjects ranked by what they earned per post, not by how often they ran.
 *
 * A topic posted twenty times to no response is not a strong topic; averaging
 * rather than summing stops volume from masquerading as performance.
 */
export function rankTopics(posts: PublishedPostRow[], limit: number): TopicPerformance[] {
  const buckets = new Map<string, { posts: number; engagements: number }>();

  for (const post of posts) {
    for (const topic of topicsOf(post)) {
      const bucket = buckets.get(topic) ?? { posts: 0, engagements: 0 };
      bucket.posts += 1;
      bucket.engagements += engagementOf(post);
      buckets.set(topic, bucket);
    }
  }

  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.posts >= MIN_POSTS_FOR_TOPIC)
    .map(([topic, bucket]) => ({
      topic,
      posts: bucket.posts,
      averageEngagement: bucket.engagements / bucket.posts,
    }))
    .sort((a, b) => b.averageEngagement - a.averageEngagement)
    .slice(0, limit);
}

export function planConfidence(posts: PublishedPostRow[]): PlanConfidence {
  const measured = posts.filter(post => engagementOf(post) > 0).length;

  if (posts.length < MIN_POSTS_FOR_CONFIDENCE || measured === 0) {
    return 'none';
  }
  return posts.length >= GOOD_EVIDENCE_POSTS ? 'good' : 'low';
}

/** Platforms ordered by how much room each has left, quietest first. */
function platformOrder(posts: PublishedPostRow[], connected: string[]): string[] {
  const counts = new Map<string, number>(connected.map(platform => [platform, 0]));
  for (const post of posts) {
    if (counts.has(post.platform)) {
      counts.set(post.platform, (counts.get(post.platform) ?? 0) + 1);
    }
  }

  return [...counts.entries()].sort((a, b) => a[1] - b[1]).map(([platform]) => platform);
}

function formatFor(posts: PublishedPostRow[], fallback: string): string {
  const buckets = new Map<string, { posts: number; engagements: number }>();

  for (const post of posts) {
    const format = post.mediaType ?? post.postFormat;
    if (!format) {
      continue;
    }
    const bucket = buckets.get(format) ?? { posts: 0, engagements: 0 };
    bucket.posts += 1;
    bucket.engagements += engagementOf(post);
    buckets.set(format, bucket);
  }

  const best = [...buckets.entries()]
    .filter(([, bucket]) => bucket.posts >= MIN_POSTS_FOR_TOPIC)
    .sort((a, b) => b[1].engagements / b[1].posts - a[1].engagements / a[1].posts)[0];

  return best?.[0] ?? fallback;
}

/**
 * A concrete week of posts laid out on the brand's own cadence.
 *
 * Slots come from the brand's configured posting days and hour rather than from
 * whatever the analytics liked best: a plan the agents cannot actually run is
 * not a plan. What the evidence decides is which platform, which format and
 * which subject fills each slot.
 */
export function buildWeeklyPlan(
  posts: PublishedPostRow[],
  connected: string[],
  cadence: BrandCadence,
  from: Date = new Date()
): PlannedSlot[] {
  const weekdays = parseWeekdays(cadence.slotWeekdays);
  if (!weekdays.length || !connected.length) {
    return [];
  }

  const perRun = Math.max(1, cadence.postsPerRun);
  const total = Math.min(MAX_SLOTS, weekdays.length * perRun);

  const platforms = platformOrder(posts, connected);
  const topics = rankTopics(posts, 5);
  const fallbackTopics = cadence.topics.filter(topic => topic.trim().length > 0);
  const format = formatFor(posts, cadence.defaultFormat);

  const taken: Date[] = [];
  const slots: PlannedSlot[] = [];

  for (let index = 0; index < total; index += 1) {
    // One slot per posting day: several posts on one day share the hour, so the
    // day only advances once every `perRun` entries.
    if (index % perRun === 0) {
      taken.push(
        nextFreeSlot(taken, {
          weekdays,
          hour: cadence.slotHour,
          from,
          timeZone: cadence.timezone,
        })
      );
    }

    const when = taken[taken.length - 1];
    const platform = platforms[index % platforms.length];
    const topic =
      topics[index % Math.max(1, topics.length)]?.topic ??
      fallbackTopics[index % Math.max(1, fallbackTopics.length)] ??
      null;

    slots.push({
      when: when.toISOString(),
      platform,
      format,
      topic,
      reason: reasonFor(topics, platforms, platform, index),
    });
  }

  return slots;
}

function reasonFor(
  topics: TopicPerformance[],
  platforms: string[],
  platform: string,
  index: number
): string {
  if (platforms.length > 1 && platform === platforms[0]) {
    return `${platform} has the most room left this window.`;
  }

  const topic = topics[index % Math.max(1, topics.length)];
  if (topic) {
    return `${topic.topic} averaged ${Math.round(topic.averageEngagement)} engagements per post.`;
  }

  return 'Keeps the brand on its configured cadence while evidence builds.';
}
