import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  env: { STORY_AGENT_INTERVAL_HOURS: 24, STORY_AGENT_MAX_PER_RUN: 2 },
}));

import { episodeOutcome, isStoryDue, StoryAgentService } from '@/services/storyAgent.service';

const NOW = new Date('2026-09-24T08:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

const story = (id: string, userId = 'user-1') => ({
  id,
  userId,
  groupId: 'group-1',
  title: `Story ${id}`,
});

const episode = {
  id: 'ep-1',
  episodeNumber: 3,
  title: 'The river',
  wordCount: 1200,
  llmProvider: 'openai',
};

const episodes = { generateNext: vi.fn(), regenerate: vi.fn() };
const stories = { list: vi.fn() };
const storyLookup = { require: vi.fn() };
const episodeRows = { lastForStory: vi.fn() };
const policies = { findRunnablePolicies: vi.fn() };
const recorder = {
  record: vi.fn(async (input: { execute: () => Promise<unknown> }) => input.execute()),
};

describe('isStoryDue', () => {
  it('is due when the story has no episode yet', () => {
    expect(isStoryDue(null, NOW, 24)).toBe(true);
  });

  it('waits while the last episode is still waiting for review', () => {
    expect(
      isStoryDue(
        { status: 'READY_FOR_REVIEW', createdAt: hoursAgo(72), publishedAt: null },
        NOW,
        24
      )
    ).toBe(false);
  });

  it('waits for the interval after the last episode was published', () => {
    expect(
      isStoryDue(
        { status: 'PUBLISHED', createdAt: hoursAgo(72), publishedAt: hoursAgo(5) },
        NOW,
        24
      )
    ).toBe(false);
    expect(
      isStoryDue(
        { status: 'PUBLISHED', createdAt: hoursAgo(72), publishedAt: hoursAgo(25) },
        NOW,
        24
      )
    ).toBe(true);
  });

  it('falls back to the creation time when no publish time was stored', () => {
    expect(
      isStoryDue({ status: 'PUBLISHED', createdAt: hoursAgo(30), publishedAt: null }, NOW, 24)
    ).toBe(true);
  });
});

describe('episodeOutcome', () => {
  it('summarises the written episode', () => {
    expect(episodeOutcome(episode as never)).toEqual({
      status: 'succeeded',
      detail: 'Episode 3: The river · 1,200 words · by openai',
    });
  });
});

describe('StoryAgentService', () => {
  const service = new StoryAgentService(
    episodes as never,
    stories as never,
    storyLookup as never,
    episodeRows as never,
    policies as never,
    recorder as never
  );

  beforeEach(() => {
    vi.clearAllMocks();
    storyLookup.require.mockImplementation(async (id: string) => story(id));
    episodes.generateNext.mockResolvedValue(episode);
    episodes.regenerate.mockResolvedValue(episode);
  });

  it('records a manual write against the story owner and brand', async () => {
    const result = await service.writeNext('s1', { instructions: 'darker' }, 'manual');

    expect(result).toBe(episode);
    expect(episodes.generateNext).toHaveBeenCalledWith('s1', { instructions: 'darker' });
    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'story',
        ownerId: 'user-1',
        groupId: 'group-1',
        trigger: 'manual',
        topic: 'Story s1',
        stepLabel: 'Write episode',
      })
    );
  });

  it('records a rewrite as a manual run', async () => {
    await service.rewrite('s1', 'ep-1', {});

    expect(episodes.regenerate).toHaveBeenCalledWith('s1', 'ep-1', {});
    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'manual', stepLabel: 'Rewrite episode' })
    );
  });

  it('does not record anything for a story that does not exist', async () => {
    storyLookup.require.mockRejectedValue(new Error('story not found'));

    await expect(service.writeNext('missing', {}, 'manual')).rejects.toThrow('story not found');
    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('writes only due stories, for users with the story switch on, up to the cap', async () => {
    policies.findRunnablePolicies.mockResolvedValue([
      { userId: 'user-1', agents: { story: true } },
      { userId: 'user-2', agents: {} },
      { userId: 'user-3', agents: { story: false } },
    ]);
    stories.list.mockResolvedValue({
      items: [story('fresh'), story('waiting'), story('published'), story('third')],
    });
    const lastEpisodes: Record<string, object | null> = {
      fresh: null,
      waiting: {
        episodeNumber: 2,
        status: 'READY_FOR_REVIEW',
        createdAt: hoursAgo(90),
        publishedAt: null,
      },
    };
    episodeRows.lastForStory.mockImplementation(async (id: string) =>
      id in lastEpisodes
        ? lastEpisodes[id]
        : {
            episodeNumber: 4,
            status: 'PUBLISHED',
            createdAt: hoursAgo(90),
            publishedAt: hoursAgo(48),
          }
    );

    const result = await service.runScheduled(NOW);

    expect(stories.list).toHaveBeenCalledTimes(1);
    expect(stories.list).toHaveBeenCalledWith({ userId: 'user-1', status: 'ACTIVE', limit: 50 });
    expect(episodes.generateNext.mock.calls).toEqual([
      ['fresh', { idempotencyKey: 'story-agent:0' }],
      ['published', { idempotencyKey: 'story-agent:4' }],
    ]);
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'schedule' }));
    expect(result).toEqual({ users: 1, written: 2, failed: 0 });
  });

  it('keeps going when one story fails', async () => {
    policies.findRunnablePolicies.mockResolvedValue([
      { userId: 'user-1', agents: { story: true } },
    ]);
    stories.list.mockResolvedValue({ items: [story('a'), story('b')] });
    episodeRows.lastForStory.mockResolvedValue(null);
    episodes.generateNext.mockRejectedValueOnce(new Error('LLM down')).mockResolvedValue(episode);

    const result = await service.runScheduled(NOW);

    expect(result).toEqual({ users: 1, written: 1, failed: 1 });
  });
});
