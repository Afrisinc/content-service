import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { storyEpisodeService } from '@/services/storyEpisode.service';

const mocks = vi.hoisted(() => ({
  require: vi.fn(),
  markActive: vi.fn(),
  generateEpisode: vi.fn(),
  promote: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findByIdInStory: vi.fn(),
  findPublishedByNumber: vi.fn(),
  lastForStory: vi.fn(),
  list: vi.fn(),
  updateStatus: vi.fn(),
  recordView: vi.fn(),
  recordCompletion: vi.fn(),
  touch: vi.fn(),
  findByIdempotencyKey: vi.fn(),
  findByNumber: vi.fn(),
  updateContent: vi.fn(),
}));

vi.mock('@/services/story.service', () => ({
  storyService: { require: mocks.require, markActive: mocks.markActive },
}));
vi.mock('@/services/storyLlm.service', () => ({
  storyLlmService: { generateEpisode: mocks.generateEpisode },
}));
vi.mock('@/services/storyPromotion.service', () => ({
  storyPromotionService: { promote: mocks.promote },
}));
vi.mock('@/repositories/storyEpisode.repository', () => ({
  storyEpisodeRepository: {
    create: mocks.create,
    findById: mocks.findById,
    findByIdInStory: mocks.findByIdInStory,
    findPublishedByNumber: mocks.findPublishedByNumber,
    lastForStory: mocks.lastForStory,
    list: mocks.list,
    updateStatus: mocks.updateStatus,
    recordView: mocks.recordView,
    recordCompletion: mocks.recordCompletion,
    findByIdempotencyKey: mocks.findByIdempotencyKey,
    findByNumber: mocks.findByNumber,
    updateContent: mocks.updateContent,
  },
}));
vi.mock('@/repositories/readerDevice.repository', () => ({
  readerDeviceRepository: { touch: mocks.touch },
}));

const story = {
  id: 'story-1',
  userId: 'user-1',
  title: 'Static',
  premise: 'A radio that hears voices from the past.',
  genre: null,
  language: 'en',
  audience: null,
  tone: null,
  status: 'DRAFT',
  autoPromote: false,
};

const generationResult = {
  content: {
    title: 'Episode One',
    hook: 'It begins.',
    body: 'Once upon a time.',
    cliffhanger: 'To be continued.',
    themes: ['mystery'],
    content_warnings: [],
    promotion_caption: 'Read episode one now.',
    promotion_hashtags: ['#fiction'],
  },
  provider: 'chatgpt' as const,
  attempts: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.require.mockResolvedValue(story);
  mocks.generateEpisode.mockResolvedValue(generationResult);
  mocks.create.mockImplementation(async input => ({ id: 'episode-1', ...input }));
  mocks.findByIdempotencyKey.mockResolvedValue(null);
});

describe('storyEpisodeService.generateNext', () => {
  it('generates episode one with no prior context and activates a draft story', async () => {
    mocks.lastForStory.mockResolvedValue(null);

    const episode = await storyEpisodeService.generateNext('story-1');

    expect(episode.episodeNumber).toBe(1);
    expect(mocks.generateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ episodeNumber: 1, priorCliffhanger: undefined }),
      expect.any(String),
      'user-1'
    );
    expect(mocks.markActive).toHaveBeenCalledWith('story-1');
  });

  it('continues from the prior episode and does not re-activate an active story', async () => {
    mocks.require.mockResolvedValue({ ...story, status: 'ACTIVE' });
    mocks.lastForStory.mockResolvedValue({
      episodeNumber: 3,
      title: 'Episode Three',
      hook: 'The trail goes cold.',
      cliffhanger: 'A door creaks open.',
    });

    const episode = await storyEpisodeService.generateNext('story-1');

    expect(episode.episodeNumber).toBe(4);
    expect(mocks.generateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeNumber: 4,
        priorCliffhanger: 'A door creaks open.',
        priorSummary: expect.stringContaining('Episode Three'),
      }),
      expect.any(String),
      'user-1'
    );
    expect(mocks.markActive).not.toHaveBeenCalled();
  });
});

describe('storyEpisodeService.generateNext idempotency', () => {
  it('replays the existing episode instead of generating again for a known key', async () => {
    const existing = { id: 'episode-existing', episodeNumber: 1 };
    mocks.findByIdempotencyKey.mockResolvedValue(existing);

    const episode = await storyEpisodeService.generateNext('story-1', {
      idempotencyKey: 'key-1',
    });

    expect(episode).toBe(existing);
    expect(mocks.findByIdempotencyKey).toHaveBeenCalledWith('story-1', 'key-1');
    expect(mocks.generateEpisode).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('generates and stores the key when nothing matches it yet', async () => {
    mocks.lastForStory.mockResolvedValue(null);

    await storyEpisodeService.generateNext('story-1', { idempotencyKey: 'key-2' });

    const [createArgs] = mocks.create.mock.calls[0];
    expect(createArgs.idempotencyKey).toBe('key-2');
  });

  it('reads back the winner when two requests race on the same key', async () => {
    mocks.lastForStory.mockResolvedValue(null);
    const raceError = Object.assign(new Error('duplicate'), { code: 'P2002' });
    Object.setPrototypeOf(raceError, Prisma.PrismaClientKnownRequestError.prototype);
    mocks.create.mockRejectedValueOnce(raceError);
    const winner = { id: 'episode-winner', episodeNumber: 1 };
    mocks.findByIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);

    const episode = await storyEpisodeService.generateNext('story-1', {
      idempotencyKey: 'key-3',
    });

    expect(episode).toBe(winner);
  });

  it('does not swallow an unrelated database error', async () => {
    mocks.lastForStory.mockResolvedValue(null);
    mocks.create.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      storyEpisodeService.generateNext('story-1', { idempotencyKey: 'key-4' })
    ).rejects.toThrow('connection lost');
  });
});

describe('storyEpisodeService.regenerate', () => {
  it('rejects regenerating an episode that is not awaiting review', async () => {
    mocks.findByIdInStory.mockResolvedValue({ id: 'episode-1', status: 'APPROVED' });

    await expect(storyEpisodeService.regenerate('story-1', 'episode-1')).rejects.toThrow(
      /awaiting review/
    );
    expect(mocks.generateEpisode).not.toHaveBeenCalled();
  });

  it('writes fresh content over the same episode using the prior episode for context', async () => {
    mocks.findByIdInStory.mockResolvedValue({
      id: 'episode-2',
      episodeNumber: 2,
      status: 'READY_FOR_REVIEW',
    });
    mocks.findByNumber.mockResolvedValue({
      episodeNumber: 1,
      title: 'Episode One',
      hook: 'It begins.',
      cliffhanger: 'To be continued.',
    });
    mocks.updateContent.mockResolvedValue({ id: 'episode-2', title: 'Episode One (Take Two)' });

    const result = await storyEpisodeService.regenerate('story-1', 'episode-2');

    expect(mocks.findByNumber).toHaveBeenCalledWith('story-1', 1);
    expect(mocks.generateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ episodeNumber: 2, priorCliffhanger: 'To be continued.' }),
      expect.any(String),
      'user-1'
    );
    expect(mocks.updateContent).toHaveBeenCalledWith(
      'episode-2',
      expect.objectContaining({ llmProvider: 'chatgpt', llmAttempts: 1 })
    );
    expect(result).toEqual({ id: 'episode-2', title: 'Episode One (Take Two)' });
  });

  it('skips the prior-episode lookup for episode one', async () => {
    mocks.findByIdInStory.mockResolvedValue({
      id: 'episode-1',
      episodeNumber: 1,
      status: 'READY_FOR_REVIEW',
    });
    mocks.updateContent.mockResolvedValue({ id: 'episode-1' });

    await storyEpisodeService.regenerate('story-1', 'episode-1');

    expect(mocks.findByNumber).not.toHaveBeenCalled();
    expect(mocks.generateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ priorCliffhanger: undefined, priorSummary: undefined }),
      expect.any(String),
      'user-1'
    );
  });
});

describe('storyEpisodeService.approve', () => {
  it('rejects approving an episode that is not awaiting review', async () => {
    mocks.findByIdInStory.mockResolvedValue({ id: 'episode-1', status: 'DRAFT' });

    await expect(storyEpisodeService.approve('story-1', 'episode-1')).rejects.toThrow(
      /awaiting review/
    );
  });

  it('approves an episode awaiting review', async () => {
    mocks.findByIdInStory.mockResolvedValue({ id: 'episode-1', status: 'READY_FOR_REVIEW' });

    await storyEpisodeService.approve('story-1', 'episode-1');

    expect(mocks.updateStatus).toHaveBeenCalledWith('episode-1', 'APPROVED');
  });
});

describe('storyEpisodeService.publish', () => {
  it('rejects publishing an episode that is not approved', async () => {
    mocks.findByIdInStory.mockResolvedValue({ id: 'episode-1', status: 'READY_FOR_REVIEW' });

    await expect(storyEpisodeService.publish('story-1', 'episode-1')).rejects.toThrow(
      /must be approved/
    );
    expect(mocks.promote).not.toHaveBeenCalled();
  });

  it('publishes an approved episode without promoting when autoPromote is off', async () => {
    mocks.findByIdInStory.mockResolvedValue({ id: 'episode-1', status: 'APPROVED' });
    mocks.findById.mockResolvedValue({ id: 'episode-1', status: 'PUBLISHED' });

    await storyEpisodeService.publish('story-1', 'episode-1');

    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'episode-1',
      'PUBLISHED',
      expect.objectContaining({ publishedAt: expect.any(Date) })
    );
    expect(mocks.promote).not.toHaveBeenCalled();
  });

  it('promotes a published episode when the story has autoPromote on', async () => {
    mocks.require.mockResolvedValue({ ...story, autoPromote: true });
    mocks.findByIdInStory.mockResolvedValue({ id: 'episode-1', status: 'APPROVED' });
    const published = { id: 'episode-1', status: 'PUBLISHED' };
    mocks.findById.mockResolvedValue(published);

    await storyEpisodeService.publish('story-1', 'episode-1');

    expect(mocks.promote).toHaveBeenCalledWith(
      expect.objectContaining({ autoPromote: true }),
      published
    );
  });
});

describe('storyEpisodeService.retryPromotion', () => {
  it('rejects retrying promotion on an episode that is not published', async () => {
    mocks.findByIdInStory.mockResolvedValue({ id: 'episode-1', status: 'APPROVED' });

    await expect(storyEpisodeService.retryPromotion('story-1', 'episode-1')).rejects.toThrow(
      /only a published episode/
    );
    expect(mocks.promote).not.toHaveBeenCalled();
  });

  it('rejects retrying promotion that did not actually fail', async () => {
    mocks.findByIdInStory.mockResolvedValue({
      id: 'episode-1',
      status: 'PUBLISHED',
      promotionStatus: 'queued',
    });

    await expect(storyEpisodeService.retryPromotion('story-1', 'episode-1')).rejects.toThrow(
      /does not have a failed promotion/
    );
    expect(mocks.promote).not.toHaveBeenCalled();
  });

  it('re-promotes a published episode whose promotion failed', async () => {
    const episode = { id: 'episode-1', status: 'PUBLISHED', promotionStatus: 'failed' };
    mocks.findByIdInStory.mockResolvedValue(episode);
    mocks.findById.mockResolvedValue({ ...episode, promotionStatus: 'queued' });

    const result = await storyEpisodeService.retryPromotion('story-1', 'episode-1');

    expect(mocks.promote).toHaveBeenCalledWith(story, episode);
    expect(result).toEqual({ ...episode, promotionStatus: 'queued' });
  });
});

describe('storyEpisodeService.get/list', () => {
  it('throws NotFoundError when the episode does not exist', async () => {
    mocks.findByIdInStory.mockResolvedValue(null);

    await expect(storyEpisodeService.get('story-1', 'missing')).rejects.toThrow(
      'episode not found'
    );
  });

  it('lists episodes after confirming the story exists', async () => {
    mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await storyEpisodeService.list('story-1', { page: 2 });

    expect(mocks.require).toHaveBeenCalledWith('story-1');
    expect(mocks.list).toHaveBeenCalledWith('story-1', { page: 2 });
  });
});

describe('storyEpisodeService.getPublicByNumber', () => {
  it('returns a published episode', async () => {
    mocks.findPublishedByNumber.mockResolvedValue({ id: 'episode-1', status: 'PUBLISHED' });

    await expect(storyEpisodeService.getPublicByNumber('story-1', 2)).resolves.toEqual({
      id: 'episode-1',
      status: 'PUBLISHED',
    });
    expect(mocks.findPublishedByNumber).toHaveBeenCalledWith('story-1', 2);
  });

  it('throws NotFoundError when the episode is not published', async () => {
    mocks.findPublishedByNumber.mockResolvedValue(null);

    await expect(storyEpisodeService.getPublicByNumber('story-1', 99)).rejects.toThrow(
      'episode not found'
    );
  });
});

describe('storyEpisodeService.recordView', () => {
  it('touches the device and records a view for a published episode', async () => {
    mocks.findPublishedByNumber.mockResolvedValue({ id: 'episode-1' });

    await storyEpisodeService.recordView('story-1', 2, 'device-1');

    expect(mocks.touch).toHaveBeenCalledWith('device-1');
    expect(mocks.recordView).toHaveBeenCalledWith('device-1', 'episode-1');
  });

  it('throws NotFoundError when the episode is not published', async () => {
    mocks.findPublishedByNumber.mockResolvedValue(null);

    await expect(storyEpisodeService.recordView('story-1', 99, 'device-1')).rejects.toThrow(
      'episode not found'
    );
    expect(mocks.recordView).not.toHaveBeenCalled();
  });
});

describe('storyEpisodeService.recordCompletedRead', () => {
  it('touches the device and records a completion for a published episode', async () => {
    mocks.findPublishedByNumber.mockResolvedValue({ id: 'episode-1' });

    await storyEpisodeService.recordCompletedRead('story-1', 2, 'device-1');

    expect(mocks.touch).toHaveBeenCalledWith('device-1');
    expect(mocks.recordCompletion).toHaveBeenCalledWith('device-1', 'episode-1');
  });

  it('throws NotFoundError when nothing published matches', async () => {
    mocks.findPublishedByNumber.mockResolvedValue(null);

    await expect(
      storyEpisodeService.recordCompletedRead('story-1', 99, 'device-1')
    ).rejects.toThrow('episode not found');
    expect(mocks.recordCompletion).not.toHaveBeenCalled();
  });
});
