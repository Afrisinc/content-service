import { describe, expect, it, vi, beforeEach } from 'vitest';
import { storyPromotionService } from '@/services/storyPromotion.service';

const mocks = vi.hoisted(() => ({
  createFromBrief: vi.fn(),
  setPromotionResult: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  STORY_PUBLIC_BASE_URL: 'https://afrisinc.com/media/stories',
}));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('@/services/postAgent.service', () => ({
  postAgentService: { createFromBrief: mocks.createFromBrief },
}));
vi.mock('@/repositories/storyEpisode.repository', () => ({
  storyEpisodeRepository: { setPromotionResult: mocks.setPromotionResult },
}));

const story = {
  id: 'story-1',
  userId: 'user-1',
  groupId: 'group-1',
  audience: 'sci-fi readers',
  autoApprovePromotion: false,
} as never;

const episode = {
  id: 'episode-1',
  episodeNumber: 2,
  title: 'The Signal Returns',
  hook: 'It never really stopped.',
  themes: ['mystery'],
  promotionHashtags: ['#fiction', '#story'],
} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('storyPromotionService.promote', () => {
  it('hands the episode to the existing post agent and records the draft', async () => {
    mocks.createFromBrief.mockResolvedValue({ id: 'draft-1' });

    await storyPromotionService.promote(story, episode);

    expect(mocks.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        groupId: 'group-1',
        format: 'single',
        link: 'https://afrisinc.com/media/stories/story-1/episodes/2',
        autoPublish: false,
      })
    );
    expect(mocks.setPromotionResult).toHaveBeenCalledWith('episode-1', {
      promotionDraftId: 'draft-1',
      promotionStatus: 'awaiting_review',
    });
  });

  it('queues immediately when the story auto-approves promotion', async () => {
    mocks.createFromBrief.mockResolvedValue({ id: 'draft-2' });

    await storyPromotionService.promote({ ...story, autoApprovePromotion: true } as never, episode);

    expect(mocks.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ autoPublish: true })
    );
    expect(mocks.setPromotionResult).toHaveBeenCalledWith('episode-1', {
      promotionDraftId: 'draft-2',
      promotionStatus: 'queued',
    });
  });

  it('never throws when the post agent fails, and records the failure instead', async () => {
    mocks.createFromBrief.mockRejectedValue(new Error('no connected accounts'));

    await expect(storyPromotionService.promote(story, episode)).resolves.toBeUndefined();

    expect(mocks.setPromotionResult).toHaveBeenCalledWith('episode-1', {
      promotionStatus: 'failed',
      promotionError: 'no connected accounts',
    });
  });

  it('records a failure when the post agent throws something other than an Error', async () => {
    mocks.createFromBrief.mockRejectedValue('rate limited');

    await storyPromotionService.promote(story, episode);

    expect(mocks.setPromotionResult).toHaveBeenCalledWith('episode-1', {
      promotionStatus: 'failed',
      promotionError: 'rate limited',
    });
  });

  it('omits the audience and falls back to themes when there are no hashtags', async () => {
    mocks.createFromBrief.mockResolvedValue({ id: 'draft-3' });

    await storyPromotionService.promote(
      { ...story, audience: null } as never,
      { ...episode, promotionHashtags: [] } as never
    );

    expect(mocks.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ audience: undefined, keywords: 'mystery' })
    );
  });

  it('falls back to the post agent default brand when no group is set', async () => {
    mocks.createFromBrief.mockResolvedValue({ id: 'draft-4' });

    await storyPromotionService.promote({ ...story, groupId: null } as never, episode);

    expect(mocks.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: undefined })
    );
  });
});
