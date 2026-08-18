import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const update = vi.fn();

vi.mock('@/database/prismaClient', () => ({
  prisma: { socialMediaPost: { findMany, update } },
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

describe('updatePost', () => {
  const repository = new SocialMediaPostRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({});
  });

  it('persists a format change so editing a post cannot silently keep the old one', async () => {
    await repository.updatePost('post-1', { postFormat: 'story' });

    expect(update.mock.calls[0][0].data.postFormat).toBe('story');
  });

  it('leaves the stored format untouched when the caller omits it', async () => {
    await repository.updatePost('post-1', { message: 'edited' });

    expect(update.mock.calls[0][0].data.postFormat).toBeUndefined();
  });
});

describe('updatePost scheduling', () => {
  const repository = new SocialMediaPostRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({});
  });

  it('moves a scheduled time when one is given', async () => {
    const when = new Date('2026-09-01T10:00:00.000Z');

    await repository.updatePost('post-1', { scheduledAt: when });

    expect(update.mock.calls[0][0].data.scheduledAt).toEqual(when);
  });

  it('clears the schedule when explicitly set to null', async () => {
    await repository.updatePost('post-1', { scheduledAt: null });

    expect(update.mock.calls[0][0].data.scheduledAt).toBeNull();
  });

  it('leaves the schedule alone when the caller omits it', async () => {
    await repository.updatePost('post-1', { message: 'edited' });

    expect(update.mock.calls[0][0].data.scheduledAt).toBeUndefined();
  });
});
