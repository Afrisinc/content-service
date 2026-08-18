import { describe, expect, it } from 'vitest';
import build from 'fast-json-stringify';
import { ListSocialMediaPostsSchema } from '@/schemas/requests/socialMedia.schema';

const serialize = build(ListSocialMediaPostsSchema.response[200] as never);

function response(postOverrides: Record<string, unknown> = {}) {
  return {
    success: true,
    message: 'Posts retrieved successfully',
    data: {
      posts: [
        {
          id: 'post-1',
          userId: 'user-1',
          platform: 'instagram',
          pageId: '17841400000000000',
          postFormat: 'reel',
          mediaType: 'video',
          mediaUrls: ['https://cdn.example.com/clip.mp4'],
          message: 'Behind the scenes',
          tags: ['afrisinc'],
          status: 'published',
          createdAt: '2026-08-18T10:00:00.000Z',
          ...postOverrides,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    },
  };
}

describe('post list response serialization', () => {
  it('keeps postFormat on the wire instead of stripping it', () => {
    const parsed = JSON.parse(serialize(response()));

    expect(parsed.data.posts[0].postFormat).toBe('reel');
  });

  it('keeps every format value intact', () => {
    for (const format of ['feed', 'story', 'reel']) {
      const parsed = JSON.parse(serialize(response({ postFormat: format })));
      expect(parsed.data.posts[0].postFormat).toBe(format);
    }
  });

  it('passes a legacy null format through rather than dropping the field', () => {
    const parsed = JSON.parse(serialize(response({ postFormat: null })));

    expect(parsed.data.posts[0]).toHaveProperty('postFormat', null);
  });

  it('would have caught an undeclared field being dropped', () => {
    const parsed = JSON.parse(serialize(response({ undeclaredField: 'x' } as never)));

    expect(parsed.data.posts[0]).not.toHaveProperty('undeclaredField');
  });

  it('still carries the media fields a format depends on', () => {
    const parsed = JSON.parse(serialize(response()));

    expect(parsed.data.posts[0].mediaType).toBe('video');
    expect(parsed.data.posts[0].mediaUrls).toEqual(['https://cdn.example.com/clip.mp4']);
  });
});
