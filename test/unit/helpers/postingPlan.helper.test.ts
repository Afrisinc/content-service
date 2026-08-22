import {
  buildWeeklyPlan,
  planConfidence,
  rankTopics,
  type BrandCadence,
} from '@/helpers/postingPlan.helper';
import type { PublishedPostRow } from '@/repositories/analytics.repository';
import { describe, expect, it } from 'vitest';

function post(overrides: Record<string, unknown> = {}): PublishedPostRow {
  return {
    id: 'p-1',
    platform: 'instagram',
    postUrl: null,
    message: 'text',
    caption: null,
    name: null,
    mediaType: 'image',
    postFormat: 'feed',
    publishedAt: new Date('2026-08-05T09:00:00Z'),
    tags: [],
    mediaPost: null,
    reach: 100,
    impressions: 100,
    views: 0,
    likes: 5,
    comments: 0,
    shares: 0,
    ...overrides,
  } as unknown as PublishedPostRow;
}

function many(count: number, overrides: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => post({ id: `p-${index}`, ...overrides }));
}

const cadence: BrandCadence = {
  slotWeekdays: '2,5',
  slotHour: 9,
  timezone: 'UTC',
  postsPerRun: 1,
  defaultFormat: 'post',
  topics: ['fallback topic'],
};

const MONDAY = new Date('2026-08-03T06:00:00Z');

describe('rankTopics', () => {
  it('is empty when nothing carries a topic', () => {
    expect(rankTopics(many(4), 5)).toEqual([]);
  });

  it('ignores a topic seen only once', () => {
    expect(rankTopics([post({ mediaPost: { category: 'finance' } })], 5)).toEqual([]);
  });

  it('reads the source category first', () => {
    const posts = many(3, { mediaPost: { category: 'finance' }, tags: ['ignored'] });

    expect(rankTopics(posts, 5)).toEqual([{ topic: 'finance', posts: 3, averageEngagement: 5 }]);
  });

  it('falls back to tags when there is no source article', () => {
    const posts = many(2, { tags: ['property'] });

    expect(rankTopics(posts, 5)[0].topic).toBe('property');
  });

  it('ranks on engagement per post, not on how often a topic ran', () => {
    const loud = many(2, { mediaPost: { category: 'rare' }, likes: 90 });
    const frequent = many(10, { mediaPost: { category: 'common' }, likes: 1 }).map(
      (row, index) => ({ ...row, id: `c-${index}` })
    );

    const ranked = rankTopics([...frequent, ...loud] as PublishedPostRow[], 5);

    expect(ranked[0].topic).toBe('rare');
  });

  it('honours the limit', () => {
    const posts = [
      ...many(2, { mediaPost: { category: 'a' } }),
      ...many(2, { mediaPost: { category: 'b' } }).map((row, i) => ({ ...row, id: `b-${i}` })),
    ];

    expect(rankTopics(posts as PublishedPostRow[], 1)).toHaveLength(1);
  });
});

describe('planConfidence', () => {
  it('is none below the evidence floor', () => {
    expect(planConfidence(many(3))).toBe('none');
  });

  it('is none when nothing has earned anything, however many posts', () => {
    expect(planConfidence(many(30, { likes: 0, comments: 0, shares: 0 }))).toBe('none');
  });

  it('is low with some evidence', () => {
    expect(planConfidence(many(8))).toBe('low');
  });

  it('is good once there is plenty', () => {
    expect(planConfidence(many(25))).toBe('good');
  });
});

describe('buildWeeklyPlan', () => {
  it('returns nothing when no account is connected', () => {
    expect(buildWeeklyPlan(many(10), [], cadence, MONDAY)).toEqual([]);
  });

  it('returns nothing when the brand has no posting day set', () => {
    const noDays = { ...cadence, slotWeekdays: '' };

    expect(buildWeeklyPlan(many(10), ['instagram'], noDays, MONDAY)).toEqual([]);
  });

  it('lays slots on the brand cadence, not on whatever performed best', () => {
    const slots = buildWeeklyPlan(many(10), ['instagram'], cadence, MONDAY);

    expect(slots).toHaveLength(2);
    // Tuesday and Friday at 09:00, the brand's own schedule.
    expect(slots[0].when).toBe('2026-08-04T09:00:00.000Z');
    expect(slots[1].when).toBe('2026-08-07T09:00:00.000Z');
  });

  it('groups several posts per run onto the same day', () => {
    const slots = buildWeeklyPlan(many(10), ['instagram'], { ...cadence, postsPerRun: 2 }, MONDAY);

    expect(slots).toHaveLength(4);
    expect(slots[0].when).toBe(slots[1].when);
    expect(slots[2].when).not.toBe(slots[0].when);
  });

  it('leads with the platform that has the most room left', () => {
    const posts = many(10, { platform: 'instagram' });

    const slots = buildWeeklyPlan(posts, ['instagram', 'linkedin'], cadence, MONDAY);

    expect(slots[0].platform).toBe('linkedin');
    expect(slots[0].reason).toContain('room left');
  });

  it('fills slots with the topic that performed, and says why', () => {
    const posts = many(6, { mediaPost: { category: 'finance' }, likes: 40 });

    const slots = buildWeeklyPlan(posts, ['instagram'], cadence, MONDAY);

    expect(slots[0].topic).toBe('finance');
    expect(slots[0].reason).toContain('finance');
  });

  it("falls back to the brand's declared topics when nothing has performed", () => {
    const slots = buildWeeklyPlan([], ['instagram'], cadence, MONDAY);

    expect(slots[0].topic).toBe('fallback topic');
  });

  it('leaves the topic empty rather than inventing one', () => {
    const bare = { ...cadence, topics: [] };

    expect(buildWeeklyPlan([], ['instagram'], bare, MONDAY)[0].topic).toBeNull();
  });

  it('picks the format that earned most, over the brand default', () => {
    const posts = [
      ...many(4, { mediaType: 'video', likes: 90 }),
      ...many(4, { mediaType: 'image', likes: 1 }).map((row, i) => ({ ...row, id: `i-${i}` })),
    ];

    expect(
      buildWeeklyPlan(posts as PublishedPostRow[], ['instagram'], cadence, MONDAY)[0].format
    ).toBe('video');
  });

  it('uses the brand default format when nothing has performed', () => {
    expect(buildWeeklyPlan([], ['instagram'], cadence, MONDAY)[0].format).toBe('post');
  });

  it('respects the brand timezone when placing the hour', () => {
    const kigali = { ...cadence, timezone: 'Africa/Kigali' };

    // 09:00 in Kigali is 07:00Z.
    expect(buildWeeklyPlan([], ['instagram'], kigali, MONDAY)[0].when).toBe(
      '2026-08-04T07:00:00.000Z'
    );
  });
});
