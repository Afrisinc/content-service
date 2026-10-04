import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { endingOf, readEpisodeMemory, storyEpisodeService } from '@/services/storyEpisode.service';

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
  findEarlier: vi.fn(),
  ensureCover: vi.fn(),
}));

vi.mock('@/services/story.service', () => ({
  storyService: { require: mocks.require, markActive: mocks.markActive },
}));
vi.mock('@/services/storyLlm.service', () => ({
  storyLlmService: { generateEpisode: mocks.generateEpisode },
}));
vi.mock('@/services/storyCover.service', () => ({
  storyCoverService: { ensure: mocks.ensureCover },
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
    findEarlier: mocks.findEarlier,
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
    summary: 'Amina finds the radio and hears her late father.',
    story_so_far: 'Amina, a Kigali radio engineer, hears her late father on a dead frequency.',
    continuity_notes: ['Amina is a radio engineer in Kigali'],
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
  mocks.findEarlier.mockResolvedValue([]);
  mocks.ensureCover.mockResolvedValue(undefined);
});

describe('storyEpisodeService.generateNext', () => {
  it('generates episode one with no prior context and activates a draft story', async () => {
    mocks.lastForStory.mockResolvedValue(null);

    const episode = await storyEpisodeService.generateNext('story-1');

    expect(episode.episodeNumber).toBe(1);
    expect(mocks.generateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeNumber: 1,
        priorCliffhanger: undefined,
        priorEpisodes: [],
        continuityNotes: [],
        previousEnding: undefined,
      }),
      expect.any(String),
      'user-1'
    );
    expect(mocks.markActive).toHaveBeenCalledWith('story-1');
  });

  it('keeps what the writer said happened, so later episodes can build on it', async () => {
    mocks.lastForStory.mockResolvedValue(null);

    await storyEpisodeService.generateNext('story-1');

    expect(mocks.create.mock.calls[0][0].metadata).toEqual({
      summary: 'Amina finds the radio and hears her late father.',
      storySoFar: 'Amina, a Kigali radio engineer, hears her late father on a dead frequency.',
      continuity: ['Amina is a radio engineer in Kigali'],
    });
  });

  it('starts drawing the story cover when it has none, without waiting for it', async () => {
    mocks.lastForStory.mockResolvedValue(null);

    await storyEpisodeService.generateNext('story-1');

    expect(mocks.ensureCover).toHaveBeenCalledWith(story);
  });

  it('continues from the prior episode and does not re-activate an active story', async () => {
    mocks.require.mockResolvedValue({ ...story, status: 'ACTIVE' });
    mocks.lastForStory.mockResolvedValue({
      episodeNumber: 3,
      title: 'Episode Three',
      hook: 'The trail goes cold.',
      cliffhanger: 'A door creaks open.',
      body: 'First paragraph.\n\nThe trail went cold.\n\nA door creaked open.',
    });
    mocks.findEarlier.mockResolvedValue([
      {
        episodeNumber: 1,
        title: 'Episode One',
        hook: 'It begins.',
        cliffhanger: 'To be continued.',
        metadata: { summary: 'Amina finds the radio.', continuity: ['Amina is an engineer'] },
      },
      {
        episodeNumber: 2,
        title: 'Episode Two',
        hook: 'The voice answers.',
        cliffhanger: null,
        metadata: null,
      },
    ]);

    const episode = await storyEpisodeService.generateNext('story-1');

    expect(episode.episodeNumber).toBe(4);
    expect(mocks.findEarlier).toHaveBeenCalledWith('story-1', 4);
    expect(mocks.generateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeNumber: 4,
        priorCliffhanger: 'A door creaks open.',
        priorEpisodes: [
          { episodeNumber: 1, title: 'Episode One', summary: 'Amina finds the radio.' },
          { episodeNumber: 2, title: 'Episode Two', summary: 'The voice answers.' },
        ],
        continuityNotes: ['Amina is an engineer'],
        previousEnding: 'The trail went cold.\n\nA door creaked open.',
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
      body: 'Opening.\n\nThe radio crackled to life.',
    });
    mocks.updateContent.mockResolvedValue({ id: 'episode-2', title: 'Episode One (Take Two)' });

    const result = await storyEpisodeService.regenerate('story-1', 'episode-2');

    expect(mocks.findByNumber).toHaveBeenCalledWith('story-1', 1);
    expect(mocks.findEarlier).toHaveBeenCalledWith('story-1', 2);
    expect(mocks.generateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeNumber: 2,
        priorCliffhanger: 'To be continued.',
        previousEnding: 'Opening.\n\nThe radio crackled to life.',
      }),
      expect.any(String),
      'user-1'
    );
    expect(mocks.updateContent).toHaveBeenCalledWith(
      'episode-2',
      expect.objectContaining({
        llmProvider: 'chatgpt',
        llmAttempts: 1,
        metadata: expect.objectContaining({ summary: expect.any(String) }),
      })
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
      expect.objectContaining({
        priorCliffhanger: undefined,
        priorEpisodes: [],
        previousEnding: undefined,
      }),
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

describe('readEpisodeMemory', () => {
  it('reads the summary and continuity notes the writer left', () => {
    expect(
      readEpisodeMemory({
        summary: ' It happened. ',
        storySoFar: ' So far. ',
        continuity: ['a', 'b'],
      })
    ).toEqual({
      summary: 'It happened.',
      storySoFar: 'So far.',
      continuity: ['a', 'b'],
    });
  });

  it.each([null, undefined, 'text', 4, [], {}])('is empty for %s', value => {
    expect(readEpisodeMemory(value)).toEqual({ summary: null, storySoFar: null, continuity: [] });
  });

  it('ignores notes that are not text or are blank', () => {
    expect(
      readEpisodeMemory({ summary: '', storySoFar: 4, continuity: ['keep', 4, '  ', null] })
    ).toEqual({
      summary: null,
      storySoFar: null,
      continuity: ['keep'],
    });
  });
});

describe('endingOf', () => {
  it('is the last two paragraphs', () => {
    expect(endingOf('One.\n\nTwo.\n\nThree.\n\nFour.')).toBe('Three.\n\nFour.');
  });

  it('is the whole text when it is short', () => {
    expect(endingOf('Only paragraph.')).toBe('Only paragraph.');
  });

  it('is empty for an empty body', () => {
    expect(endingOf('  ')).toBe('');
  });

  it('keeps no more than 700 characters, starting on a whole word', () => {
    const body = `${'word '.repeat(300).trim()}`;

    const ending = endingOf(body);

    expect(ending.length).toBeLessThanOrEqual(700);
    expect(ending.startsWith('word')).toBe(true);
  });
});

describe('the context a long series sends', () => {
  const earlierEpisodes = (count: number, synopsisAt: number[] = []) =>
    Array.from({ length: count }, (_, index) => ({
      episodeNumber: index + 1,
      title: `Episode ${index + 1}`,
      hook: `Hook ${index + 1}`,
      cliffhanger: null,
      metadata: {
        summary: `Summary ${index + 1}`,
        ...(synopsisAt.includes(index + 1) ? { storySoFar: `Synopsis to ${index + 1}` } : {}),
      },
    }));

  const briefFor = async (earlier: ReturnType<typeof earlierEpisodes>) => {
    mocks.require.mockResolvedValue({ ...story, status: 'ACTIVE' });
    mocks.lastForStory.mockResolvedValue({
      episodeNumber: earlier.length,
      title: 'Last',
      hook: 'h',
      cliffhanger: 'c',
      body: 'One.\n\nTwo.',
    });
    mocks.findEarlier.mockResolvedValue(earlier);
    await storyEpisodeService.generateNext('story-1');
    return mocks.generateEpisode.mock.calls[0][0];
  };

  it('sends the latest synopsis and only the last ten episodes', async () => {
    const brief = await briefFor(earlierEpisodes(50, [49, 50]));

    expect(brief.storySoFar).toBe('Synopsis to 50');
    expect(
      brief.priorEpisodes.map((episode: { episodeNumber: number }) => episode.episodeNumber)
    ).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
  });

  it('also sends every episode written after the latest synopsis', async () => {
    const brief = await briefFor(earlierEpisodes(30, [12]));

    expect(brief.storySoFar).toBe('Synopsis to 12');
    expect(brief.priorEpisodes[0].episodeNumber).toBe(13);
    expect(brief.priorEpisodes).toHaveLength(18);
  });

  it('sends every summary for an older series with no synopsis yet', async () => {
    const brief = await briefFor(earlierEpisodes(25));

    expect(brief.storySoFar).toBeUndefined();
    expect(brief.priorEpisodes).toHaveLength(25);
  });

  it('keeps a short series whole', async () => {
    const brief = await briefFor(earlierEpisodes(4, [4]));

    expect(brief.priorEpisodes).toHaveLength(4);
  });
});
