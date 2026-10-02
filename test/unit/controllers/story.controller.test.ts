import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@/utils/http-error';

const mocks = vi.hoisted(() => ({
  getOwned: vi.fn(),
  requireOwned: vi.fn(),
  writeNext: vi.fn(),
  rewrite: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  approve: vi.fn(),
  publish: vi.fn(),
  retryPromotion: vi.fn(),
  generateCover: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/services/story.service', () => ({
  assertStoryBrief: vi.fn(),
  storyService: { getOwned: mocks.getOwned, requireOwned: mocks.requireOwned },
}));
vi.mock('@/services/storyAgent.service', () => ({
  storyAgentService: { writeNext: mocks.writeNext, rewrite: mocks.rewrite },
}));
vi.mock('@/services/storyEpisode.service', () => ({
  storyEpisodeService: {
    list: mocks.list,
    get: mocks.get,
    approve: mocks.approve,
    publish: mocks.publish,
    retryPromotion: mocks.retryPromotion,
  },
}));
vi.mock('@/services/storyCover.service', () => ({
  storyCoverService: { generate: mocks.generateCover },
}));
vi.mock('@/utils/response', () => ({ success: mocks.success }));

const controller = await import('@/controllers/story.controller');

const reply = {} as never;
const request = (extra: Record<string, unknown> = {}) =>
  ({ user: { userId: 'user-1' }, params: { id: 'story-1', episodeId: 'ep-1' }, ...extra }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwned.mockResolvedValue({ id: 'story-1', userId: 'user-1' });
});

describe('story controller ownership', () => {
  it('shows a story only through its owner', async () => {
    mocks.getOwned.mockResolvedValue({ id: 'story-1' });

    await controller.getStory(request(), reply);

    expect(mocks.getOwned).toHaveBeenCalledWith('story-1', 'user-1');
  });

  it.each([
    [
      'generateEpisode',
      () => controller.generateEpisode(request({ body: {}, headers: {} }), reply),
      'writeNext',
    ],
    [
      'regenerateEpisode',
      () => controller.regenerateEpisode(request({ body: {} }), reply),
      'rewrite',
    ],
    [
      'listStoryEpisodes',
      () => controller.listStoryEpisodes(request({ query: {} }), reply),
      'list',
    ],
    ['getStoryEpisode', () => controller.getStoryEpisode(request(), reply), 'get'],
    ['approveStoryEpisode', () => controller.approveStoryEpisode(request(), reply), 'approve'],
    ['publishStoryEpisode', () => controller.publishStoryEpisode(request(), reply), 'publish'],
    [
      'retryEpisodePromotion',
      () => controller.retryEpisodePromotion(request(), reply),
      'retryPromotion',
    ],
    ['generateStoryCover', () => controller.generateStoryCover(request(), reply), 'generateCover'],
  ] as const)('%s does nothing for a story that is not the caller’s', async (_name, call, work) => {
    mocks.requireOwned.mockRejectedValue(new NotFoundError('story not found'));

    await expect(call()).rejects.toThrow('story not found');

    expect(mocks.requireOwned).toHaveBeenCalledWith('story-1', 'user-1');
    expect(mocks[work]).not.toHaveBeenCalled();
  });

  it('refuses a request with no signed-in user', async () => {
    await expect(
      controller.getStory({ params: { id: 'story-1' } } as never, reply)
    ).rejects.toThrow('authentication required');
  });
});

describe('generateStoryCover', () => {
  it('draws the cover for the owner’s story and returns its address', async () => {
    mocks.generateCover.mockResolvedValue('https://cdn.afrisinc.com/cover.png');

    await controller.generateStoryCover(request(), reply);

    expect(mocks.generateCover).toHaveBeenCalledWith({ id: 'story-1', userId: 'user-1' });
    expect(mocks.success).toHaveBeenCalledWith(reply, 200, 'Cover generated', 1109, {
      coverImageUrl: 'https://cdn.afrisinc.com/cover.png',
    });
  });
});
