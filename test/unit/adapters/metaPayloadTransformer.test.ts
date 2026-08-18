import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaPayloadTransformer } from '@/adapters/meta/metaPayloadTransformer';
import { MetaPostKind } from '@/adapters/meta/meta.types';
import { SocialMediaPlatform, SocialPostFormat } from '@/types/socialMedia.types';
import type { SocialMediaPostPayload } from '@/types/socialMedia.types';

const IMAGE = 'https://cdn.example.com/frame.jpg';
const VIDEO = 'https://cdn.example.com/clip.mp4';

function payload(overrides: Partial<SocialMediaPostPayload> = {}): SocialMediaPostPayload {
  return {
    platform: SocialMediaPlatform.FACEBOOK,
    pageId: '1234567890',
    accessToken: 'page-token',
    content: { message: 'Launch day' },
    ...overrides,
  };
}

describe('MetaPayloadTransformer story and reel formats', () => {
  let transformer: MetaPayloadTransformer;

  beforeEach(() => {
    transformer = new MetaPayloadTransformer();
    vi.clearAllMocks();
  });

  describe('facebook', () => {
    it('routes an image story through an unpublished photo upload', async () => {
      const result = await transformer.transformForFacebook(
        payload({
          format: SocialPostFormat.STORY,
          media: { type: 'image', url: IMAGE },
        })
      );

      expect(result.kind).toBe(MetaPostKind.PHOTO_STORY);
      expect(result.photo?.published).toBe(false);
      expect(result.photo?.url).toBe(IMAGE);
    });

    it('carries no caption on an image story', async () => {
      const result = await transformer.transformForFacebook(
        payload({
          format: SocialPostFormat.STORY,
          media: { type: 'image', url: IMAGE },
        })
      );

      expect(result.photo?.caption).toBeUndefined();
    });

    it('routes a video story to a resumable upload', async () => {
      const result = await transformer.transformForFacebook(
        payload({
          format: SocialPostFormat.STORY,
          media: { type: 'video', url: VIDEO },
        })
      );

      expect(result.kind).toBe(MetaPostKind.VIDEO_STORY);
      expect(result.videoUpload?.fileUrl).toBe(VIDEO);
      expect(result.videoUpload?.access_token).toBe('page-token');
    });

    it('rejects a story with no media', async () => {
      await expect(
        transformer.transformForFacebook(payload({ format: SocialPostFormat.STORY }))
      ).rejects.toThrow('A Facebook story requires an image or a video');
    });

    it('builds a reel from a video and keeps the message as the description', async () => {
      const result = await transformer.transformForFacebook(
        payload({
          format: SocialPostFormat.REEL,
          media: { type: 'video', url: VIDEO },
          content: { message: 'Behind the scenes', tags: ['afrisinc'] },
        })
      );

      expect(result.kind).toBe(MetaPostKind.REEL);
      expect(result.videoUpload?.fileUrl).toBe(VIDEO);
      expect(result.videoUpload?.description).toContain('Behind the scenes');
      expect(result.videoUpload?.description).toContain('#afrisinc');
    });

    it('rejects a reel with no video', async () => {
      await expect(
        transformer.transformForFacebook(
          payload({ format: SocialPostFormat.REEL, media: { type: 'image', url: IMAGE } })
        )
      ).rejects.toThrow('A Facebook reel requires a video');
    });

    it('keeps a reel schedule inside the tighter reel window', async () => {
      const inWindow = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60;

      const result = await transformer.transformForFacebook(
        payload({
          format: SocialPostFormat.REEL,
          media: { type: 'video', url: VIDEO },
          scheduling: { scheduled_publish_time: inWindow },
        })
      );

      expect(result.videoUpload?.scheduledPublishTime).toBe(inWindow);
    });

    it('drops a reel schedule beyond the reel window that a feed post would accept', async () => {
      const beyondReelWindow = Math.floor(Date.now() / 1000) + 40 * 24 * 60 * 60;

      const result = await transformer.transformForFacebook(
        payload({
          format: SocialPostFormat.REEL,
          media: { type: 'video', url: VIDEO },
          scheduling: { scheduled_publish_time: beyondReelWindow },
        })
      );

      expect(result.videoUpload?.scheduledPublishTime).toBeUndefined();
    });

    it('leaves feed posts on their existing path', async () => {
      const result = await transformer.transformForFacebook(
        payload({ media: { type: 'image', url: IMAGE } })
      );

      expect(result.kind).toBe(MetaPostKind.PHOTO);
    });
  });

  describe('instagram', () => {
    const igPayload = (overrides: Partial<SocialMediaPostPayload> = {}) =>
      payload({ platform: SocialMediaPlatform.INSTAGRAM, ...overrides });

    it('creates a STORIES container for an image story', async () => {
      const result = await transformer.transformForInstagram(
        igPayload({ format: SocialPostFormat.STORY, media: { type: 'image', url: IMAGE } })
      );

      expect(result.container.media_type).toBe('STORIES');
      expect(result.container.image_url).toBe(IMAGE);
    });

    it('creates a STORIES container for a video story', async () => {
      const result = await transformer.transformForInstagram(
        igPayload({ format: SocialPostFormat.STORY, media: { type: 'video', url: VIDEO } })
      );

      expect(result.container.media_type).toBe('STORIES');
      expect(result.container.video_url).toBe(VIDEO);
    });

    it('omits the caption on a story, which instagram does not render', async () => {
      const result = await transformer.transformForInstagram(
        igPayload({
          format: SocialPostFormat.STORY,
          media: { type: 'image', url: IMAGE },
          content: { message: 'ignored on stories' },
        })
      );

      expect(result.container.caption).toBeUndefined();
    });

    it('rejects a story with no media', async () => {
      await expect(
        transformer.transformForInstagram(igPayload({ format: SocialPostFormat.STORY }))
      ).rejects.toThrow('An Instagram story requires an image or a video');
    });

    it('creates a REELS container for a reel', async () => {
      const result = await transformer.transformForInstagram(
        igPayload({ format: SocialPostFormat.REEL, media: { type: 'video', url: VIDEO } })
      );

      expect(result.container.media_type).toBe('REELS');
      expect(result.container.video_url).toBe(VIDEO);
    });

    it('rejects a reel with no video', async () => {
      await expect(
        transformer.transformForInstagram(
          igPayload({ format: SocialPostFormat.REEL, media: { type: 'image', url: IMAGE } })
        )
      ).rejects.toThrow('An Instagram reel requires a video');
    });

    it('rejects story media that is not publicly fetchable', async () => {
      await expect(
        transformer.transformForInstagram(
          igPayload({
            format: SocialPostFormat.STORY,
            media: { type: 'image', url: 'http://localhost/frame.jpg' },
          })
        )
      ).rejects.toThrow('public https URL');
    });
  });
});
