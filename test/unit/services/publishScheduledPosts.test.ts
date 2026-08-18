import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiGenerationService } from '@/services/aiGeneration.service';
import { socialMediaPostRepository } from '@/repositories/socialMediaPost.repository';
import { socialMediaService } from '@/services/socialMedia.service';
import { SocialMediaPlatform } from '@/types/socialMedia.types';

vi.mock('@/repositories/socialMediaPost.repository');
vi.mock('@/services/socialMedia.service', () => ({
  socialMediaService: {
    publishScheduledPostNow: vi.fn(),
    postToSocialMedia: vi.fn(),
  },
}));

function pendingPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    userId: 'user-1',
    platform: 'facebook',
    pageId: '1234567890',
    postFormat: 'reel',
    status: 'pending',
    ...overrides,
  };
}

describe('publishScheduledPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(socialMediaPostRepository.markPostFailed).mockResolvedValue(undefined as never);
    vi.mocked(socialMediaPostRepository.updatePostAfterPublish).mockResolvedValue(
      undefined as never
    );
  });

  it('publishes through the real publisher, not the queueing entry point', async () => {
    vi.mocked(socialMediaPostRepository.getPostsReadyToPublish).mockResolvedValue([
      pendingPost(),
    ] as never);
    vi.mocked(socialMediaService.publishScheduledPostNow).mockResolvedValue({
      platform: SocialMediaPlatform.FACEBOOK,
      postId: 'fb-1',
      status: 'success',
      message: 'ok',
    });

    const result = await aiGenerationService.publishScheduledPosts();

    expect(socialMediaService.publishScheduledPostNow).toHaveBeenCalledWith('post-1', 'user-1');
    expect(socialMediaService.postToSocialMedia).not.toHaveBeenCalled();
    expect(result.published).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('does not re-persist a published post the publisher already wrote', async () => {
    vi.mocked(socialMediaPostRepository.getPostsReadyToPublish).mockResolvedValue([
      pendingPost(),
    ] as never);
    vi.mocked(socialMediaService.publishScheduledPostNow).mockResolvedValue({
      platform: SocialMediaPlatform.FACEBOOK,
      postId: 'fb-1',
      status: 'success',
      message: 'ok',
    });

    await aiGenerationService.publishScheduledPosts();

    expect(socialMediaPostRepository.updatePostAfterPublish).not.toHaveBeenCalled();
  });

  it('counts a pending result as a failure rather than a publish', async () => {
    vi.mocked(socialMediaPostRepository.getPostsReadyToPublish).mockResolvedValue([
      pendingPost(),
    ] as never);
    vi.mocked(socialMediaService.publishScheduledPostNow).mockResolvedValue({
      platform: SocialMediaPlatform.FACEBOOK,
      postId: 'post-1',
      status: 'pending',
      message: 'queued',
    });

    const result = await aiGenerationService.publishScheduledPosts();

    expect(result.published).toBe(0);
    expect(result.failed).toBe(1);
    expect(socialMediaPostRepository.markPostFailed).toHaveBeenCalledWith(
      'post-1',
      expect.stringContaining('queued')
    );
  });

  it('marks a failed publish and keeps going through the rest of the batch', async () => {
    vi.mocked(socialMediaPostRepository.getPostsReadyToPublish).mockResolvedValue([
      pendingPost({ id: 'post-1' }),
      pendingPost({ id: 'post-2', platform: 'instagram' }),
    ] as never);
    vi.mocked(socialMediaService.publishScheduledPostNow)
      .mockResolvedValueOnce({
        platform: SocialMediaPlatform.FACEBOOK,
        postId: 'post-1',
        status: 'failed',
        message: 'no linked instagram account',
      })
      .mockResolvedValueOnce({
        platform: SocialMediaPlatform.INSTAGRAM,
        postId: 'ig-1',
        status: 'success',
        message: 'ok',
      });

    const result = await aiGenerationService.publishScheduledPosts();

    expect(result.failed).toBe(1);
    expect(result.published).toBe(1);
    expect(socialMediaPostRepository.markPostFailed).toHaveBeenCalledWith(
      'post-1',
      expect.stringContaining('no linked instagram account')
    );
  });

  it('marks a post failed when the publisher throws', async () => {
    vi.mocked(socialMediaPostRepository.getPostsReadyToPublish).mockResolvedValue([
      pendingPost(),
    ] as never);
    vi.mocked(socialMediaService.publishScheduledPostNow).mockRejectedValue(
      new Error('token expired')
    );

    const result = await aiGenerationService.publishScheduledPosts();

    expect(result.failed).toBe(1);
    expect(socialMediaPostRepository.markPostFailed).toHaveBeenCalledWith(
      'post-1',
      'token expired'
    );
  });

  it('reports nothing to do on an empty queue', async () => {
    vi.mocked(socialMediaPostRepository.getPostsReadyToPublish).mockResolvedValue([] as never);

    await expect(aiGenerationService.publishScheduledPosts()).resolves.toEqual({
      published: 0,
      failed: 0,
      errors: [],
    });
  });
});
