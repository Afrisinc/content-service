import { describe, expect, it } from 'vitest';
import { socialMediaHelper } from '@/helpers/socialMedia.helper';
import { SocialMediaPlatform, SocialPostFormat } from '@/types/socialMedia.types';
import type { SocialMediaPostPayload } from '@/types/socialMedia.types';

const IMAGE = 'https://cdn.example.com/frame.jpg';
const VIDEO = 'https://cdn.example.com/clip.mp4';

function payload(overrides: Partial<SocialMediaPostPayload> = {}): SocialMediaPostPayload {
  return {
    platform: SocialMediaPlatform.FACEBOOK,
    pageId: '1234567890',
    accessToken: 'page-token',
    content: {},
    ...overrides,
  };
}

describe('validatePayload post formats', () => {
  it('accepts a story that carries media but no text', () => {
    const result = socialMediaHelper.validatePayload(
      payload({ format: SocialPostFormat.STORY, media: { type: 'image', url: IMAGE } })
    );

    expect(result.valid).toBe(true);
  });

  it('rejects a story with no media', () => {
    const result = socialMediaHelper.validatePayload(
      payload({ format: SocialPostFormat.STORY, content: { message: 'text only' } })
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('A story requires an image or a video');
  });

  it('rejects a reel with no media', () => {
    const result = socialMediaHelper.validatePayload(
      payload({ format: SocialPostFormat.REEL, content: { message: 'text only' } })
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('A reel requires a video');
  });

  it('rejects a carousel story', () => {
    const result = socialMediaHelper.validatePayload(
      payload({
        format: SocialPostFormat.STORY,
        media: { type: 'carousel', urls: [IMAGE, IMAGE] },
      })
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Stories take a single image or video, not a carousel');
  });

  it('rejects a carousel reel', () => {
    const result = socialMediaHelper.validatePayload(
      payload({
        format: SocialPostFormat.REEL,
        media: { type: 'carousel', urls: [VIDEO, VIDEO] },
      })
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Reels take a single video, not a carousel');
  });

  it('still requires text or media on a feed post', () => {
    const result = socialMediaHelper.validatePayload(payload());

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'At least one of message, link, picture, or media must be provided'
    );
  });

  it('accepts a feed post carrying only media', () => {
    const result = socialMediaHelper.validatePayload(
      payload({ media: { type: 'image', url: IMAGE } })
    );

    expect(result.valid).toBe(true);
  });

  it('still requires media on an instagram feed post', () => {
    const result = socialMediaHelper.validatePayload(
      payload({ platform: SocialMediaPlatform.INSTAGRAM, content: { message: 'hello' } })
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Instagram posts require an image or video');
  });
});
