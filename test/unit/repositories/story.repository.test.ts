import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const count = vi.fn();
const groupBy = vi.fn();

vi.mock('@/database/prismaClient', () => ({
  prisma: { story: { findMany, count }, storyEpisode: { groupBy } },
}));

const { StoryRepository } = await import('@/repositories/story.repository');

const story = (id: string) => ({ id, userId: 'user-1', title: `Story ${id}`, status: 'ACTIVE' });

describe('StoryRepository.list episode totals', () => {
  const repository = new StoryRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    count.mockResolvedValue(2);
  });

  it('adds episode counts, views and reads to every story on the page', async () => {
    findMany.mockResolvedValue([story('s1'), story('s2')]);
    groupBy.mockResolvedValue([
      {
        storyId: 's1',
        status: 'PUBLISHED',
        _count: { _all: 2 },
        _sum: { viewCount: 120, completedReads: 45 },
      },
      {
        storyId: 's1',
        status: 'READY_FOR_REVIEW',
        _count: { _all: 1 },
        _sum: { viewCount: 0, completedReads: 0 },
      },
      {
        storyId: 's2',
        status: 'DRAFT',
        _count: { _all: 1 },
        _sum: { viewCount: null, completedReads: null },
      },
    ]);

    const result = await repository.list({ userId: 'user-1' });

    expect(result.items[0]).toMatchObject({
      id: 's1',
      episodeCount: 3,
      publishedEpisodeCount: 2,
      totalViews: 120,
      totalReads: 45,
    });
    expect(result.items[1]).toMatchObject({
      id: 's2',
      episodeCount: 1,
      publishedEpisodeCount: 0,
      totalViews: 0,
      totalReads: 0,
    });
    expect(result).toMatchObject({ total: 2, page: 1, limit: 20 });
  });

  it('reports zeros for a story that has no episodes yet', async () => {
    findMany.mockResolvedValue([story('s1')]);
    groupBy.mockResolvedValue([]);

    const result = await repository.list({ userId: 'user-1' });

    expect(result.items[0]).toMatchObject({
      episodeCount: 0,
      publishedEpisodeCount: 0,
      totalViews: 0,
      totalReads: 0,
    });
  });

  it('aggregates the whole page in a single grouped query scoped to its stories', async () => {
    findMany.mockResolvedValue([story('s1'), story('s2')]);
    groupBy.mockResolvedValue([]);

    await repository.list({ userId: 'user-1' });

    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy.mock.calls[0][0].where).toEqual({ storyId: { in: ['s1', 's2'] } });
  });

  it('skips the aggregate entirely when the page is empty', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    const result = await repository.list({ userId: 'user-1' });

    expect(groupBy).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
  });
});
