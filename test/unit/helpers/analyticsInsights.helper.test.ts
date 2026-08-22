import {
  bestFormat,
  bestPostingWindow,
  buildRecommendations,
  engagementOf,
  idlePlatform,
  rankPosts,
} from '@/helpers/analyticsInsights.helper';
import type { PublishedPostRow } from '@/repositories/analytics.repository';
import { describe, expect, it } from 'vitest';

function post(overrides: Partial<PublishedPostRow> = {}): PublishedPostRow {
  return {
    id: 'post-1',
    platform: 'instagram',
    postUrl: 'https://example.test/p/1',
    message: 'A message',
    caption: null,
    name: null,
    mediaType: 'image',
    postFormat: 'feed',
    publishedAt: new Date('2026-08-05T09:00:00Z'),
    reach: 100,
    impressions: 120,
    views: 90,
    likes: 5,
    comments: 2,
    shares: 1,
    ...overrides,
  } as PublishedPostRow;
}

/** `count` posts sharing one weekday/hour, each with the same engagement. */
function atHour(count: number, iso: string, likes: number, extra: Partial<PublishedPostRow> = {}) {
  return Array.from({ length: count }, (_, index) =>
    post({
      id: `p-${iso}-${index}`,
      publishedAt: new Date(iso),
      likes,
      comments: 0,
      shares: 0,
      ...extra,
    })
  );
}

describe('engagementOf', () => {
  it('sums the three interaction columns and ignores reach', () => {
    expect(engagementOf(post({ likes: 4, comments: 3, shares: 2, reach: 9999 }))).toBe(9);
  });

  it('is zero for a post nobody touched', () => {
    expect(engagementOf(post({ likes: 0, comments: 0, shares: 0 }))).toBe(0);
  });
});

describe('bestPostingWindow', () => {
  it('returns null below the evidence floor', () => {
    expect(bestPostingWindow(atHour(5, '2026-08-05T09:00:00Z', 10), 'UTC')).toBeNull();
  });

  it('returns null when a bucket has only one post, however good', () => {
    const posts = [
      ...atHour(1, '2026-08-05T09:00:00Z', 500),
      ...atHour(5, '2026-08-06T15:00:00Z', 0),
    ];
    expect(bestPostingWindow(posts, 'UTC')).toBeNull();
  });

  it('names the two-hour band with the best average engagement', () => {
    const posts = [
      ...atHour(3, '2026-08-05T09:00:00Z', 50),
      ...atHour(3, '2026-08-06T15:00:00Z', 2),
    ];

    const found = bestPostingWindow(posts, 'UTC');

    expect(found).not.toBeNull();
    expect(found?.kind).toBe('timing');
    expect(found?.title).toBe('Wednesday 08:00–10:00');
    expect(found?.detail).toContain('50');
  });

  it('reads the hour in the caller timezone, not UTC', () => {
    const posts = [
      ...atHour(3, '2026-08-05T09:00:00Z', 50),
      ...atHour(3, '2026-08-06T15:00:00Z', 2),
    ];

    // 09:00Z is 11:00 in Kigali, which lands in the 10–12 band.
    expect(bestPostingWindow(posts, 'Africa/Kigali')?.title).toBe('Wednesday 10:00–12:00');
  });

  it('returns null when every post earned nothing', () => {
    expect(bestPostingWindow(atHour(8, '2026-08-05T09:00:00Z', 0), 'UTC')).toBeNull();
  });

  it('skips posts that were never published', () => {
    const posts = [
      ...atHour(6, '2026-08-05T09:00:00Z', 10),
      post({ id: 'unpublished', publishedAt: null }),
    ];
    expect(bestPostingWindow(posts, 'UTC')?.title).toBe('Wednesday 08:00–10:00');
  });
});

describe('bestFormat', () => {
  const strong = Array.from({ length: 4 }, (_, index) =>
    post({ id: `v-${index}`, mediaType: 'video', likes: 40, comments: 0, shares: 0 })
  );
  const weak = Array.from({ length: 4 }, (_, index) =>
    post({ id: `i-${index}`, mediaType: 'image', likes: 4, comments: 0, shares: 0 })
  );

  it('returns null below the evidence floor', () => {
    expect(bestFormat(strong.slice(0, 3))).toBeNull();
  });

  it('returns null when no format clears the material lift', () => {
    const flat = [
      ...strong,
      ...strong.map((row, index) => ({ ...row, id: `x-${index}`, mediaType: 'image' })),
    ];
    expect(bestFormat(flat as PublishedPostRow[])).toBeNull();
  });

  it('reports the format that outperforms with its lift', () => {
    const found = bestFormat([...strong, ...weak]);

    expect(found?.kind).toBe('format');
    expect(found?.title).toContain('video');
    expect(found?.title).toMatch(/\d+% more/);
  });

  it('ignores a format with too few posts to judge', () => {
    const posts = [
      ...weak,
      ...weak.map((row, index) => ({ ...row, id: `w2-${index}` })),
      post({ id: 'lucky', mediaType: 'video', likes: 900, comments: 0, shares: 0 }),
    ];
    expect(bestFormat(posts as PublishedPostRow[])).toBeNull();
  });

  it('returns null when nothing carries a media type', () => {
    expect(
      bestFormat(strong.map(row => ({ ...row, mediaType: null })) as PublishedPostRow[])
    ).toBeNull();
  });

  it('returns null when every post earned nothing', () => {
    const silent = [...strong, ...weak].map(row => ({ ...row, likes: 0, comments: 0, shares: 0 }));
    expect(bestFormat(silent as PublishedPostRow[])).toBeNull();
  });
});

describe('idlePlatform', () => {
  it('returns null with fewer than two platforms connected', () => {
    expect(idlePlatform([post()], ['instagram'])).toBeNull();
  });

  it('flags a connected platform that was never posted to', () => {
    const posts = Array.from({ length: 6 }, (_, index) => post({ id: `p-${index}` }));

    const found = idlePlatform(posts, ['instagram', 'linkedin']);

    expect(found?.kind).toBe('platform');
    expect(found?.title).toContain('linkedin');
    expect(found?.detail).toContain('nothing published');
  });

  it('flags a platform carrying under half the busiest one', () => {
    const posts = [
      ...Array.from({ length: 8 }, (_, index) => post({ id: `i-${index}` })),
      post({ id: 'f-1', platform: 'facebook' }),
    ];

    expect(idlePlatform(posts, ['instagram', 'facebook'])?.detail).toContain('1 post(s) against 8');
  });

  it('stays quiet when platforms are used evenly', () => {
    const posts = [
      ...Array.from({ length: 4 }, (_, index) => post({ id: `i-${index}` })),
      ...Array.from({ length: 4 }, (_, index) => post({ id: `f-${index}`, platform: 'facebook' })),
    ];
    expect(idlePlatform(posts, ['instagram', 'facebook'])).toBeNull();
  });

  it('stays quiet when nothing was posted anywhere', () => {
    expect(idlePlatform([], ['instagram', 'facebook'])).toBeNull();
  });
});

describe('buildRecommendations', () => {
  it('drops the insights that had nothing to say', () => {
    expect(buildRecommendations([], [], 'UTC')).toEqual([]);
  });

  it('returns each insight that cleared its floor', () => {
    const posts = [
      ...atHour(4, '2026-08-05T09:00:00Z', 60, { mediaType: 'video' }),
      ...atHour(4, '2026-08-06T15:00:00Z', 2, { mediaType: 'image' }),
    ];

    const kinds = buildRecommendations(posts, ['instagram', 'linkedin'], 'UTC').map(
      entry => entry.kind
    );

    expect(kinds).toContain('timing');
    expect(kinds).toContain('format');
    expect(kinds).toContain('platform');
  });
});

describe('rankPosts', () => {
  it('orders by engagement and honours the limit', () => {
    const posts = [
      post({ id: 'low', likes: 1, comments: 0, shares: 0 }),
      post({ id: 'high', likes: 50, comments: 0, shares: 0 }),
      post({ id: 'mid', likes: 10, comments: 0, shares: 0 }),
    ];

    expect(rankPosts(posts, 2).map(row => row.id)).toEqual(['high', 'mid']);
  });

  it('breaks an engagement tie on reach', () => {
    const posts = [
      post({ id: 'narrow', likes: 5, comments: 0, shares: 0, reach: 10 }),
      post({ id: 'wide', likes: 5, comments: 0, shares: 0, reach: 900 }),
    ];

    expect(rankPosts(posts, 2).map(row => row.id)).toEqual(['wide', 'narrow']);
  });

  it('takes the first non-empty line as the title', () => {
    expect(rankPosts([post({ name: null, message: '\n\nReal headline\nmore' })], 1)[0].title).toBe(
      'Real headline'
    );
  });

  it('prefers the post name over the message', () => {
    expect(rankPosts([post({ name: 'Named' })], 1)[0].title).toBe('Named');
  });

  it('truncates a long title rather than letting it break the row', () => {
    const title = rankPosts([post({ name: 'x'.repeat(200) })], 1)[0].title;
    expect(title).toHaveLength(88);
    expect(title.endsWith('…')).toBe(true);
  });

  it('labels a post with no text at all', () => {
    expect(rankPosts([post({ name: null, message: null, caption: null })], 1)[0].title).toBe(
      'Untitled post'
    );
  });

  it('falls back to the post format when no media type was recorded', () => {
    expect(rankPosts([post({ mediaType: null, postFormat: 'story' })], 1)[0].mediaType).toBe(
      'story'
    );
  });

  it('serialises publishedAt, and tolerates a post without one', () => {
    expect(rankPosts([post()], 1)[0].publishedAt).toBe('2026-08-05T09:00:00.000Z');
    expect(rankPosts([post({ publishedAt: null })], 1)[0].publishedAt).toBeNull();
  });
});
