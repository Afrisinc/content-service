import {
  engagementOf,
  leadingFormat,
  platformName,
  type ContentFormat,
} from '@/helpers/analyticsInsights.helper';
import { median, scorerFor } from '@/helpers/postScore.helper';
import { nextFreeSlot, parseWeekdays } from '@/helpers/postingSlot.helper';
import type { PublishedPostRow } from '@/repositories/analytics.repository';

const MIN_POSTS_FOR_TOPIC = 2;
const MIN_POSTS_FOR_CONFIDENCE = 6;
const GOOD_EVIDENCE_POSTS = 20;
const MAX_SLOTS = 14;
const UBIQUITOUS_SHARE = 0.8;
const MIN_POSTS_FOR_UBIQUITY = 5;
const PRODUCIBLE_FORMATS: readonly ContentFormat[] = ['post', 'single'];

export interface TopicPerformance {
  topic: string;
  posts: number;
  averageEngagement: number;
  score: number;
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
function topicsOf(post: PublishedPostRow): { topics: string[]; fromTags: boolean } {
  const category = (post as { mediaPost?: { category?: string | null } }).mediaPost?.category;
  if (category) {
    return { topics: [category], fromTags: false };
  }

  const tags = (post as { tags?: string[] }).tags ?? [];
  return {
    topics: tags
      .map(tag => tag.replace(/^#+/, '').trim())
      .filter(tag => tag.length > 0)
      .slice(0, 3),
    fromTags: true,
  };
}

/**
 * Subjects ranked by what they earned per post, not by how often they ran.
 *
 * A topic posted twenty times to no response is not a strong topic; averaging
 * rather than summing stops volume from masquerading as performance.
 */
export function rankTopics(posts: PublishedPostRow[], limit: number): TopicPerformance[] {
  const { scoreOf } = scorerFor(posts);
  const buckets = new Map<
    string,
    { label: string; posts: number; engagements: number; tagged: number; scores: number[] }
  >();

  for (const post of posts) {
    const seen = new Set<string>();
    const { topics, fromTags } = topicsOf(post);
    for (const topic of topics) {
      const key = topic.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const bucket = buckets.get(key) ?? {
        label: topic,
        posts: 0,
        engagements: 0,
        tagged: 0,
        scores: [],
      };
      const score = scoreOf(post);
      bucket.posts += 1;
      bucket.tagged += fromTags ? 1 : 0;
      bucket.engagements += engagementOf(post);
      if (score !== null) {
        bucket.scores.push(score);
      }
      buckets.set(key, bucket);
    }
  }

  const isHouseTag = (tagged: number) =>
    posts.length >= MIN_POSTS_FOR_UBIQUITY && tagged / posts.length >= UBIQUITOUS_SHARE;

  return [...buckets.values()]
    .filter(bucket => bucket.posts >= MIN_POSTS_FOR_TOPIC && !isHouseTag(bucket.tagged))
    .map(bucket => ({
      topic: bucket.label,
      posts: bucket.posts,
      averageEngagement: bucket.engagements / bucket.posts,
      score: median(bucket.scores),
    }))
    .sort((a, b) => b.score - a.score || b.posts - a.posts)
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
  return leadingFormat(posts, PRODUCIBLE_FORMATS)?.format ?? fallback;
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
  from: Date = new Date(),
  evidence: PublishedPostRow[] = posts
): PlannedSlot[] {
  const weekdays = parseWeekdays(cadence.slotWeekdays);
  if (!weekdays.length || !connected.length) {
    return [];
  }

  const perRun = Math.max(1, cadence.postsPerRun);
  const total = Math.min(MAX_SLOTS, weekdays.length * perRun);

  const platforms = platformOrder(posts, connected);
  const topics = rankTopics(evidence, 5);
  const { describe } = scorerFor(evidence);
  const fallbackTopics = cadence.topics.filter(topic => topic.trim().length > 0);
  const format = formatFor(evidence, cadence.defaultFormat);

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
      reason: reasonFor(topics, platforms, platform, index, describe),
    });
  }

  return slots;
}

function reasonFor(
  topics: TopicPerformance[],
  platforms: string[],
  platform: string,
  index: number,
  describe: (value: number) => string
): string {
  if (platforms.length > 1 && platform === platforms[0]) {
    return (
      `${platformName(platform)} has had the fewest posts this window, ` +
      'so it has the most room to grow.'
    );
  }

  const topic = topics[index % Math.max(1, topics.length)];
  if (topic) {
    return (
      `${topic.topic} is one of your strongest subjects: ` +
      `${describe(topic.score)} on a typical post.`
    );
  }

  return 'Keeps the brand on its configured cadence while evidence builds.';
}
