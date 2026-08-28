import { beforeEach, describe, expect, it, vi } from 'vitest';
import { socialMediaPostRepository } from '@/repositories/socialMediaPost.repository';
import { socialMediaService } from '@/services/socialMedia.service';

vi.mock('@/repositories/socialMediaPost.repository');

function publishedPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    userId: 'user-1',
    platform: 'facebook',
    pageId: '1234567890',
    postId: 'fb-1',
    postUrl: 'https://facebook.com/fb-1',
    message: 'hello world',
    link: null,
    description: null,
    picture: null,
    name: null,
    caption: null,
    tags: ['tag1'],
    postFormat: 'feed',
    mediaType: null,
    mediaUrls: [],
    altText: null,
    ageMin: null,
    ageMax: null,
    genders: [],
    countries: [],
    regions: [],
    cities: [],
    interests: [],
    keywords: [],
    aiGenerated: false,
    aiProvider: null,
    aiModel: null,
    aiPrompt: null,
    status: 'published',
    accessTokenEnc: 'enc-token',
    metadata: null,
    ...overrides,
  };
}

describe('repostPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clones a published post into a new pending post', async () => {
    vi.mocked(socialMediaPostRepository.getPostById).mockResolvedValue(publishedPost() as never);
    vi.mocked(socialMediaPostRepository.createPost).mockResolvedValue({
      id: 'post-2',
      platform: 'facebook',
      scheduledAt: null,
    } as never);

    const result = await socialMediaService.repostPost('post-1', 'user-1');

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        platform: 'facebook',
        pageId: '1234567890',
        message: 'hello world',
        status: 'pending',
        accessTokenEnc: 'enc-token',
        scheduledAt: undefined,
      })
    );
    expect(result.status).toBe('pending');
    expect(result.postId).toBe('post-2');
  });

  it('schedules the repost for a specific time when given', async () => {
    vi.mocked(socialMediaPostRepository.getPostById).mockResolvedValue(publishedPost() as never);
    vi.mocked(socialMediaPostRepository.createPost).mockResolvedValue({
      id: 'post-2',
      platform: 'facebook',
      scheduledAt: new Date(1798797600 * 1000),
    } as never);

    await socialMediaService.repostPost('post-1', 'user-1', 1798797600);

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: new Date(1798797600 * 1000) })
    );
  });

  it('fails when the post does not exist', async () => {
    vi.mocked(socialMediaPostRepository.getPostById).mockResolvedValue(null as never);

    const result = await socialMediaService.repostPost('missing', 'user-1');

    expect(result.status).toBe('failed');
    expect(result.message).toContain('not found');
    expect(socialMediaPostRepository.createPost).not.toHaveBeenCalled();
  });

  it('fails when the post belongs to another user', async () => {
    vi.mocked(socialMediaPostRepository.getPostById).mockResolvedValue(
      publishedPost({ userId: 'someone-else' }) as never
    );

    const result = await socialMediaService.repostPost('post-1', 'user-1');

    expect(result.status).toBe('failed');
    expect(result.message).toContain('Unauthorized');
    expect(socialMediaPostRepository.createPost).not.toHaveBeenCalled();
  });

  it('fails when the post is not yet published', async () => {
    vi.mocked(socialMediaPostRepository.getPostById).mockResolvedValue(
      publishedPost({ status: 'pending' }) as never
    );

    const result = await socialMediaService.repostPost('post-1', 'user-1');

    expect(result.status).toBe('failed');
    expect(result.message).toContain('Only published posts');
    expect(socialMediaPostRepository.createPost).not.toHaveBeenCalled();
  });
});
