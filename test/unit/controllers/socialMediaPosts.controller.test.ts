import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

const service = vi.hoisted(() => ({
  getAllPosts: vi.fn(),
  getUserPosts: vi.fn(),
  repostPost: vi.fn(),
}));

vi.mock('@/services/socialMedia.service', () => ({
  SocialMediaService: vi.fn().mockImplementation(() => service),
}));

const { getAllSocialMediaPosts, getUserSocialMediaPosts, repostSocialMediaPost } =
  await import('@/controllers/socialMedia.controller');

function fakeReply() {
  const reply = {
    status: vi.fn(() => reply),
    send: vi.fn(() => reply),
  };
  return reply as unknown as FastifyReply & { send: ReturnType<typeof vi.fn> };
}

const request = (parts: Partial<FastifyRequest>) => parts as FastifyRequest;

beforeEach(() => {
  vi.clearAllMocks();
  service.getAllPosts.mockResolvedValue({ posts: [], total: 0, limit: 20, offset: 0 });
  service.getUserPosts.mockResolvedValue({ posts: [], total: 0, limit: 20, offset: 0 });
});

describe('getAllSocialMediaPosts', () => {
  it('passes the search term through alongside the other filters', async () => {
    await getAllSocialMediaPosts(
      request({ query: { search: 'launch', platform: 'facebook', status: 'published' } }),
      fakeReply()
    );

    expect(service.getAllPosts).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'launch', platform: 'facebook', status: 'published' })
    );
  });

  it('caps the limit at 100 even when a larger value is requested', async () => {
    await getAllSocialMediaPosts(request({ query: { limit: 500 } }), fakeReply());

    expect(service.getAllPosts).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });
});

describe('getUserSocialMediaPosts', () => {
  it('passes the search term through for the authenticated user', async () => {
    await getUserSocialMediaPosts(
      request({ query: { search: 'launch' }, user: { userId: 'user-1' } as never }),
      fakeReply()
    );

    expect(service.getUserPosts).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        search: 'launch',
      })
    );
  });
});

describe('repostSocialMediaPost', () => {
  it('answers 201 when the repost is queued', async () => {
    service.repostPost.mockResolvedValue({
      platform: 'facebook',
      postId: 'post-2',
      status: 'pending',
      message: 'Post queued for repost.',
    });
    const reply = fakeReply();

    await repostSocialMediaPost(
      request({
        params: { postId: 'post-1' },
        body: { scheduledAt: 1798797600 },
        user: { userId: 'user-1' } as never,
      }),
      reply
    );

    expect(service.repostPost).toHaveBeenCalledWith('post-1', 'user-1', 1798797600);
    expect(reply.status).toHaveBeenCalledWith(201);
  });

  it('answers 400 when the service reports failure', async () => {
    service.repostPost.mockResolvedValue({
      platform: 'facebook',
      postId: 'post-1',
      status: 'failed',
      message: "Unauthorized: Cannot repost another user's post",
    });
    const reply = fakeReply();

    await repostSocialMediaPost(
      request({ params: { postId: 'post-1' }, body: {}, user: { userId: 'user-2' } as never }),
      reply
    );

    expect(reply.status).toHaveBeenCalledWith(400);
  });
});
