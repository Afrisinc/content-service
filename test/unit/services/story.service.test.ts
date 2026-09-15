import { describe, expect, it, vi, beforeEach } from 'vitest';
import { assertStoryBrief, storyService } from '@/services/story.service';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  findWithEpisodes: vi.fn(),
  list: vi.fn(),
  updateStatus: vi.fn(),
  findPublishedById: vi.fn(),
  listPublished: vi.fn(),
  readingStateForDevice: vi.fn(),
}));

vi.mock('@/repositories/story.repository', () => ({
  storyRepository: mocks,
}));
vi.mock('@/repositories/storyEpisode.repository', () => ({
  storyEpisodeRepository: { readingStateForDevice: mocks.readingStateForDevice },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertStoryBrief', () => {
  it('rejects a title under three characters', () => {
    expect(() => assertStoryBrief({ title: 'Hi', premise: 'x'.repeat(20) })).toThrow(
      /title of at least three characters/
    );
  });

  it('rejects a premise under twenty characters', () => {
    expect(() => assertStoryBrief({ title: 'Static', premise: 'too short' })).toThrow(
      /twenty characters/
    );
  });

  it('accepts a valid brief', () => {
    expect(() =>
      assertStoryBrief({ title: 'Static', premise: 'A radio that hears voices from the past.' })
    ).not.toThrow();
  });
});

describe('storyService', () => {
  it('creates a story through the repository', async () => {
    mocks.create.mockResolvedValue({ id: 'story-1', title: 'Static' });

    const story = await storyService.create({
      userId: 'user-1',
      title: 'Static',
      premise: 'A radio that hears voices from the past.',
    });

    expect(story).toEqual({ id: 'story-1', title: 'Static' });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', title: 'Static' })
    );
  });

  it('returns a story with its episodes', async () => {
    mocks.findWithEpisodes.mockResolvedValue({ id: 'story-1', episodes: [] });

    await expect(storyService.get('story-1')).resolves.toEqual({ id: 'story-1', episodes: [] });
  });

  it('throws NotFoundError when the story does not exist', async () => {
    mocks.findWithEpisodes.mockResolvedValue(null);

    await expect(storyService.get('missing')).rejects.toThrow('story not found');
  });

  it('require() throws NotFoundError when the story does not exist', async () => {
    mocks.findById.mockResolvedValue(null);

    await expect(storyService.require('missing')).rejects.toThrow('story not found');
  });

  it('delegates listing to the repository', async () => {
    mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await storyService.list({ userId: 'user-1' });

    expect(mocks.list).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('marks a story active and complete', async () => {
    await storyService.markActive('story-1');
    expect(mocks.updateStatus).toHaveBeenCalledWith('story-1', 'ACTIVE');

    await storyService.complete('story-1');
    expect(mocks.updateStatus).toHaveBeenCalledWith('story-1', 'COMPLETED');
  });

  it('returns a public story with only its published episodes', async () => {
    mocks.findPublishedById.mockResolvedValue({
      id: 'story-1',
      status: 'ACTIVE',
      episodes: [{ status: 'PUBLISHED' }],
    });

    await expect(storyService.getPublic('story-1')).resolves.toEqual({
      id: 'story-1',
      status: 'ongoing',
      episodes: [{ status: 'PUBLISHED' }],
    });
  });

  it('maps a completed or archived story to the public "completed" status', async () => {
    mocks.findPublishedById.mockResolvedValue({ id: 'story-2', status: 'COMPLETED', episodes: [] });
    await expect(storyService.getPublic('story-2')).resolves.toMatchObject({ status: 'completed' });

    mocks.findPublishedById.mockResolvedValue({ id: 'story-3', status: 'ARCHIVED', episodes: [] });
    await expect(storyService.getPublic('story-3')).resolves.toMatchObject({ status: 'completed' });
  });

  it('enriches each episode with viewed/completed state for a known device', async () => {
    mocks.findPublishedById.mockResolvedValue({
      id: 'story-1',
      status: 'ACTIVE',
      episodes: [
        { id: 'ep-1', status: 'PUBLISHED' },
        { id: 'ep-2', status: 'PUBLISHED' },
        { id: 'ep-3', status: 'PUBLISHED' },
      ],
    });
    mocks.readingStateForDevice.mockResolvedValue([
      { episodeId: 'ep-1', completed: true },
      { episodeId: 'ep-2', completed: false },
    ]);

    const result = await storyService.getPublic('story-1', 'device-1');

    expect(mocks.readingStateForDevice).toHaveBeenCalledWith('device-1', ['ep-1', 'ep-2', 'ep-3']);
    expect(result.episodes).toEqual([
      { id: 'ep-1', status: 'PUBLISHED', viewed: true, completed: true },
      { id: 'ep-2', status: 'PUBLISHED', viewed: true, completed: false },
      { id: 'ep-3', status: 'PUBLISHED', viewed: false, completed: false },
    ]);
  });

  it('skips the reading-state lookup entirely when no device id is given', async () => {
    mocks.findPublishedById.mockResolvedValue({
      id: 'story-1',
      status: 'ACTIVE',
      episodes: [{ id: 'ep-1', status: 'PUBLISHED' }],
    });

    const result = await storyService.getPublic('story-1');

    expect(mocks.readingStateForDevice).not.toHaveBeenCalled();
    expect(result.episodes).toEqual([{ id: 'ep-1', status: 'PUBLISHED' }]);
  });

  it('throws NotFoundError for a public story with no published episodes', async () => {
    mocks.findPublishedById.mockResolvedValue(null);

    await expect(storyService.getPublic('unpublished')).rejects.toThrow('story not found');
  });

  it('delegates the public listing to the repository and maps each story status', async () => {
    mocks.listPublished.mockResolvedValue({
      items: [{ id: 'story-1', status: 'DRAFT' }],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await storyService.listPublic({ page: 2 });

    expect(mocks.listPublished).toHaveBeenCalledWith({ page: 2 });
    expect(result.items).toEqual([{ id: 'story-1', status: 'ongoing' }]);
  });
});
