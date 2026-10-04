import {
  mostSaved,
  comparablePosts,
  contentFormatOf,
  leadingFormat,
  platformName,
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
      ...atHour(3, '2026-08-05T09:00:00Z', 50),
      ...atHour(3, '2026-08-06T15:00:00Z', 2),
      post({ id: 'unpublished', publishedAt: null, likes: 9000 }),
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
    expect(found?.title).toBe('Videos earn 10× the engagement');
    expect(found?.detail).toBe(
      '40.0% engagement rate across 4 posts, against 4.0% for everything else (4 posts).'
    );
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
    expect(found?.title).toBe('LinkedIn is underused');
    expect(found?.detail).toContain('nothing went out there this window while Instagram');
  });

  it('flags a platform carrying under half the busiest one', () => {
    const posts = [
      ...Array.from({ length: 8 }, (_, index) => post({ id: `i-${index}` })),
      post({ id: 'f-1', platform: 'facebook' }),
    ];

    expect(idlePlatform(posts, ['instagram', 'facebook'])?.detail).toBe(
      '1 post against 8 on Instagram. Reuse your best posts there first.'
    );
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

describe('bestPostingWindow, held to the evidence', () => {
  it('stays quiet when every post shares one window, since there is nothing to compare', () => {
    expect(bestPostingWindow(atHour(6, '2026-08-05T09:00:00Z', 10), 'UTC')).toBeNull();
  });

  it('stays quiet when the best window is not materially above average', () => {
    const posts = [
      ...atHour(3, '2026-08-05T09:00:00Z', 11),
      ...atHour(3, '2026-08-06T15:00:00Z', 10),
    ];
    expect(bestPostingWindow(posts, 'UTC')).toBeNull();
  });

  it('prefers a steady window over a two-post fluke when shrunk toward the average', () => {
    const posts = [
      ...atHour(2, '2026-08-05T09:00:00Z', 60),
      ...atHour(8, '2026-08-06T15:00:00Z', 50),
      ...atHour(10, '2026-08-07T19:00:00Z', 1),
    ];
    expect(bestPostingWindow(posts, 'UTC')?.title).toBe('Thursday 14:00–16:00');
  });

  it('states the average, the lift over the account and the sample size', () => {
    const posts = [
      ...atHour(3, '2026-08-05T09:00:00Z', 50),
      ...atHour(3, '2026-08-06T15:00:00Z', 2),
    ];
    expect(bestPostingWindow(posts, 'UTC')?.detail).toBe(
      '50.0% engagement rate, 92% above your typical post, across 3 posts.'
    );
  });

  it('suggests moving the slot when the brand posts outside the best window', () => {
    const posts = [
      ...atHour(3, '2026-08-05T09:00:00Z', 50),
      ...atHour(3, '2026-08-06T15:00:00Z', 2),
    ];
    expect(bestPostingWindow(posts, 'UTC', 18)?.detail).toContain(
      'Your brand posts at 18:00 — try moving a slot into this window.'
    );
    expect(bestPostingWindow(posts, 'UTC', 9)?.detail).not.toContain('Your brand posts');
  });
});

describe('contentFormatOf', () => {
  it.each([
    [{ postFormat: 'story', mediaType: 'image' }, 'story'],
    [{ postFormat: 'reel', mediaType: 'video' }, 'reel'],
    [{ postFormat: 'feed', mediaType: 'carousel' }, 'post'],
    [{ postFormat: 'feed', mediaType: 'image' }, 'single'],
    [{ postFormat: 'feed', mediaType: 'video' }, 'video'],
    [{ postFormat: 'feed', mediaType: null }, null],
  ])('reads %j as %s', (fields, expected) => {
    expect(contentFormatOf(post(fields as Partial<PublishedPostRow>))).toBe(expected);
  });
});

describe('leadingFormat', () => {
  const rows = (count: number, mediaType: string, likes: number) =>
    Array.from({ length: count }, (_, index) =>
      post({ id: `${mediaType}-${index}`, mediaType, likes, comments: 0, shares: 0 })
    );

  it('compares the leader with the other formats, not with an average that includes it', () => {
    const lead = leadingFormat([...rows(4, 'carousel', 30), ...rows(4, 'image', 10)]);

    expect(lead).toMatchObject({ format: 'post', average: 0.3, restAverage: 0.1 });
    expect(lead?.lift).toBeCloseTo(2);
  });

  it('only weighs the formats it is told to', () => {
    const posts = [...rows(4, 'video', 90), ...rows(4, 'carousel', 30), ...rows(4, 'image', 10)];

    expect(leadingFormat(posts, ['post', 'single'])?.format).toBe('post');
  });

  it('says nothing when the other formats earned nothing to compare against', () => {
    expect(leadingFormat([...rows(4, 'carousel', 30), ...rows(4, 'image', 0)])).toBeNull();
  });

  it('says nothing when only one format has been used', () => {
    expect(leadingFormat(rows(8, 'carousel', 30))).toBeNull();
  });
});

describe('comparablePosts', () => {
  const NOW = new Date('2026-08-10T12:00:00Z');
  const synced = new Date('2026-08-09T00:00:00Z');

  it('keeps posts that are settled and have had their numbers read', () => {
    const settled = post({
      publishedAt: new Date('2026-08-08T11:00:00Z'),
      lastMetricsUpdate: synced,
    } as Partial<PublishedPostRow>);

    expect(comparablePosts([settled], NOW)).toEqual([settled]);
  });

  it('leaves out posts younger than 48 hours, which are still collecting engagement', () => {
    const fresh = post({
      publishedAt: new Date('2026-08-09T13:00:00Z'),
      lastMetricsUpdate: synced,
    } as Partial<PublishedPostRow>);

    expect(comparablePosts([fresh], NOW)).toEqual([]);
  });

  it('leaves out posts whose numbers were never read, rather than counting them as zero', () => {
    const unread = post({
      publishedAt: new Date('2026-08-01T00:00:00Z'),
      lastMetricsUpdate: null,
    } as Partial<PublishedPostRow>);

    expect(comparablePosts([unread], NOW)).toEqual([]);
  });

  it('leaves out stories, which earn views and replies rather than likes', () => {
    const story = post({
      postFormat: 'story',
      publishedAt: new Date('2026-08-01T00:00:00Z'),
      lastMetricsUpdate: synced,
    } as Partial<PublishedPostRow>);

    expect(comparablePosts([story], NOW)).toEqual([]);
  });

  it('leaves out posts that were never published', () => {
    expect(comparablePosts([post({ publishedAt: null })], NOW)).toEqual([]);
  });
});

describe('platformName', () => {
  it.each([
    ['instagram', 'Instagram'],
    ['linkedin', 'LinkedIn'],
    ['TWITTER', 'X'],
    ['tiktok', 'TikTok'],
    ['mastodon', 'Mastodon'],
  ])('names %s as %s', (key, name) => {
    expect(platformName(key)).toBe(name);
  });
});

describe('buildRecommendations', () => {
  it('judges the idle platform on everything published, not only the settled evidence', () => {
    const evidence = [post({ id: 'e', platform: 'instagram' })];
    const volume = Array.from({ length: 6 }, (_, index) =>
      post({ id: `v-${index}`, platform: 'instagram' })
    );

    const found = buildRecommendations(evidence, ['instagram', 'facebook'], 'UTC', { volume });

    expect(found.find(entry => entry.kind === 'platform')?.detail).toContain('6 posts');
  });
});

describe('mostSaved', () => {
  const rows = (count: number, mediaType: string, saves: number, extra = {}) =>
    Array.from({ length: count }, (_, index) =>
      post({ id: `${mediaType}-${index}`, mediaType, saves, ...extra } as Partial<PublishedPostRow>)
    );

  it('names the format people save, click and visit the profile from most', () => {
    const found = mostSaved([...rows(4, 'carousel', 6), ...rows(4, 'image', 2)]);

    expect(found).toMatchObject({ kind: 'intent', title: 'Carousels get 3× the saves and clicks' });
    expect(found?.detail).toContain('60.0 per 1,000 people reached, against 20.0 for other');
  });

  it('counts per post when reach was not reported', () => {
    const found = mostSaved([
      ...rows(4, 'carousel', 6, { reach: 0 }),
      ...rows(4, 'image', 2, { reach: 0 }),
    ]);

    expect(found?.detail).toContain('6.0 per post, against 2.0 for other');
  });

  it('stays quiet when nobody saved or clicked anything', () => {
    expect(mostSaved([...rows(4, 'carousel', 0), ...rows(4, 'image', 0)])).toBeNull();
  });
});

describe('describing the typical post', () => {
  it('speaks in engagements per post when reach is missing', () => {
    const posts = [
      ...atHour(3, '2026-08-05T09:00:00Z', 50, { reach: 0 }),
      ...atHour(3, '2026-08-06T15:00:00Z', 2, { reach: 0 }),
    ];

    expect(bestPostingWindow(posts, 'UTC')?.detail).toContain('50 engagements per post');
  });
});
