import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());

vi.mock('@/database/prismaClient', () => ({ prisma: { storyEpisode: { findMany } } }));

const { StoryEpisodeRepository } = await import('@/repositories/storyEpisode.repository');

describe('StoryEpisodeRepository.findEarlier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  it('reads every episode before the given one, oldest first, without the heavy body', async () => {
    await new StoryEpisodeRepository().findEarlier('story-1', 5);

    expect(findMany).toHaveBeenCalledWith({
      where: { storyId: 'story-1', episodeNumber: { lt: 5 } },
      orderBy: { episodeNumber: 'asc' },
      take: 200,
      select: {
        episodeNumber: true,
        title: true,
        hook: true,
        cliffhanger: true,
        metadata: true,
      },
    });
  });

  it('returns what it finds', async () => {
    findMany.mockResolvedValue([{ episodeNumber: 1, title: 'One' }]);

    await expect(new StoryEpisodeRepository().findEarlier('story-1', 2)).resolves.toEqual([
      { episodeNumber: 1, title: 'One' },
    ]);
  });
});
