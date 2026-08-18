import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();

vi.mock('@/database/prismaClient', () => ({
  prisma: { socialMediaPost: { findMany } },
}));

const { SocialMediaPostRepository } = await import('@/repositories/socialMediaPost.repository');

describe('getPostsReadyToPublish', () => {
  const repository = new SocialMediaPostRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  it('claims posts that are due as well as posts with no schedule', async () => {
    await repository.getPostsReadyToPublish();

    const where = findMany.mock.calls[0][0].where;

    expect(where.status).toBe('pending');
    expect(where.OR).toEqual([{ scheduledAt: null }, { scheduledAt: { lte: expect.any(Date) } }]);
  });

  it('never returns posts that already published or failed', async () => {
    await repository.getPostsReadyToPublish();

    expect(findMany.mock.calls[0][0].where.status).toBe('pending');
  });

  it('publishes in the order the posts were created', async () => {
    await repository.getPostsReadyToPublish();

    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
  });
});
