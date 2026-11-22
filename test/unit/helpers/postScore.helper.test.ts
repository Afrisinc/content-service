import { describe, expect, it } from 'vitest';
import {
  aggregate,
  engagementOf,
  intentOf,
  leadBy,
  mean,
  median,
  perReach,
  scoreMode,
  scorerFor,
  scoredValues,
} from '@/helpers/postScore.helper';
import type { PublishedPostRow } from '@/repositories/analytics.repository';

const post = (fields: Record<string, unknown> = {}) =>
  ({
    likes: 1,
    comments: 0,
    shares: 0,
    saves: 0,
    clicks: 0,
    profileVisits: 0,
    reach: 100,
    ...fields,
  }) as unknown as PublishedPostRow;

describe('engagementOf and intentOf', () => {
  it('counts saves as engagement alongside likes, comments and shares', () => {
    expect(engagementOf(post({ likes: 4, comments: 3, shares: 2, saves: 1 }))).toBe(10);
  });

  it('treats metrics a row does not carry as zero', () => {
    expect(engagementOf(post({ saves: undefined }))).toBe(1);
    expect(intentOf(post({ saves: undefined, clicks: undefined, profileVisits: undefined }))).toBe(
      0
    );
  });

  it('adds up saves, clicks and profile visits as intent', () => {
    expect(intentOf(post({ saves: 2, clicks: 3, profileVisits: 4 }))).toBe(9);
  });
});

describe('median, mean and aggregate', () => {
  it('takes the middle value, or the mean of the two middle ones', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('averages, and is zero for nothing', () => {
    expect(mean([1, 2, 6])).toBe(3);
    expect(mean([])).toBe(0);
  });

  it('uses the median unless told otherwise', () => {
    expect(aggregate([1, 1, 10])).toBe(1);
    expect(aggregate([1, 1, 10], 'mean')).toBe(4);
  });
});

describe('scoreMode', () => {
  it('scores by rate when nearly every post reports reach', () => {
    expect(scoreMode([post(), post(), post(), post(), post({ reach: 0 })])).toBe('rate');
  });

  it('scores by count when reach is too patchy', () => {
    expect(scoreMode([post(), post({ reach: 0 }), post({ reach: 0 })])).toBe('count');
  });

  it('scores by count with nothing to go on', () => {
    expect(scoreMode([])).toBe('count');
  });
});

describe('perReach and scorerFor', () => {
  it('divides by reach in rate mode and skips posts with no reach', () => {
    const posts = [post({ likes: 5 }), post(), post(), post(), post({ reach: 0 })];
    const valueOf = perReach(posts, engagementOf);

    expect(valueOf(posts[0])).toBe(0.05);
    expect(valueOf(posts[4])).toBeNull();
  });

  it('describes a rate as a percentage and a count per post', () => {
    expect(scorerFor([post()]).describe(0.0425)).toBe('4.3% engagement rate');
    expect(scorerFor([post({ reach: 0 })]).describe(12.4)).toBe('12 engagements per post');
    expect(scorerFor([post()]).figure(0.0425)).toBe('4.3%');
    expect(scorerFor([post({ reach: 0 })]).figure(12.4)).toBe('12');
  });

  it('keeps only the posts that could be scored', () => {
    expect(scoredValues([post(), post()], row => (row.likes ? 1 : null))).toEqual([1, 1]);
    expect(scoredValues([post({ likes: 0 })], row => (row.likes ? 1 : null))).toEqual([]);
  });
});

describe('leadBy', () => {
  const rows = (count: number, key: string, value: number) =>
    Array.from({ length: count }, () => post({ key, value }));
  const options = {
    keyOf: (row: PublishedPostRow) => (row as unknown as { key: string }).key,
    valueOf: (row: PublishedPostRow) => (row as unknown as { value: number }).value,
    minPerGroup: 3,
    minTotal: 6,
    minLift: 0.15,
  };

  it('reports the leader against everything else, with the lift', () => {
    expect(leadBy([...rows(3, 'a', 30), ...rows(3, 'b', 10)], options)).toEqual({
      key: 'a',
      value: 30,
      posts: 3,
      restValue: 10,
      restPosts: 3,
      lift: 2,
    });
  });

  it('needs enough posts overall and in the leading group', () => {
    expect(leadBy([...rows(2, 'a', 30), ...rows(3, 'b', 10)], options)).toBeNull();
    expect(
      leadBy([...rows(2, 'a', 30), ...rows(2, 'b', 10), ...rows(2, 'c', 5)], options)
    ).toBeNull();
  });

  it('needs the lead to be material', () => {
    expect(leadBy([...rows(3, 'a', 11), ...rows(3, 'b', 10)], options)).toBeNull();
  });

  it('needs something to compare against', () => {
    expect(leadBy(rows(6, 'a', 30), options)).toBeNull();
    expect(leadBy([...rows(3, 'a', 30), ...rows(3, 'b', 0)], options)).toBeNull();
  });

  it('skips rows with no key or no value', () => {
    const lead = leadBy(
      [...rows(3, 'a', 30), ...rows(3, 'b', 10), post({ key: null, value: 999 })],
      options
    );

    expect(lead?.restPosts).toBe(3);
  });

  it('can compare means instead of medians', () => {
    const lead = leadBy([...rows(2, 'a', 0), post({ key: 'a', value: 90 }), ...rows(3, 'b', 10)], {
      ...options,
      aggregate: 'mean' as const,
    });

    expect(lead).toMatchObject({ key: 'a', value: 30, lift: 2 });
  });
});
