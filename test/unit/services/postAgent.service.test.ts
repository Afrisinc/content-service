import { PostAgentService } from '@/services/postAgent.service';
import { PostCopy, RenderResult } from '@/types/post.types';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/http-error';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/repositories/socialMediaPost.repository', () => ({
  socialMediaPostRepository: {
    createPost: vi.fn(async () => ({ id: 'post-1' })),
    setStatusForPosts: vi.fn(async () => ({ count: 1 })),
    reschedulePosts: vi.fn(async () => ({ count: 1 })),
  },
}));

const { socialMediaPostRepository } = await import('@/repositories/socialMediaPost.repository');

const COPY: PostCopy = {
  concept: 'The design performs the sentence.',
  caption: 'Your process. Not a template.',
  hashtags: ['#AFRISINC'],
  claims: ['Free scoping session'],
  slides: [
    { role: 'hook', eyebrow: 'A', eyebrowKind: 'label', headline: ['Your process.'] },
    { role: 'proof', eyebrow: 'B', eyebrowKind: 'claim', headline: ['Web apps.'] },
    { role: 'method', eyebrow: 'C', eyebrowKind: 'label', headline: ['Ship in weeks,'] },
    { role: 'cta', eyebrow: 'D', eyebrowKind: 'claim', headline: ['Tell us.'], cta: 'afrisinc.com' },
  ],
};

const RENDER_OK: RenderResult = {
  slug: 'topic-abc123',
  format: 'post',
  width: 1080,
  height: 1080,
  slides: [
    { index: 0, filename: 'slide-01.png', surface: 'azure', headline_size: 108, bytes: 1 },
    { index: 1, filename: 'slide-02.png', surface: 'photo', headline_size: 108, bytes: 1 },
  ],
  findings: [],
  passed: true,
};

function build(overrides: Record<string, unknown> = {}) {
  const draft = {
    id: 'draft-1',
    userId: 'user-1',
    status: 'awaiting_approval',
    format: 'post',
    auditPassed: true,
    slideUrls: ['https://render/slide-01.png'],
    caption: 'caption',
    hashtags: ['#AFRISINC'],
    aiProvider: 'anthropic',
    aiModel: null,
    spec: { slug: 'topic-abc123', slides: [] },
    socialPostIds: [],
    scheduledAt: null,
    ...overrides,
  };

  const drafts = {
    create: vi.fn(async () => draft),
    findTakenSlots: vi.fn(async () => []),
    markQueued: vi.fn(async () => draft),
    findById: vi.fn(async () => draft),
    list: vi.fn(async () => ({ items: [draft], total: 1, page: 1, limit: 20 })),
    markRendered: vi.fn(async () => draft),
    approve: vi.fn(async () => ({ ...draft, status: 'approved' })),
    reject: vi.fn(async () => ({ ...draft, status: 'rejected' })),
    markScheduled: vi.fn(async () => ({ ...draft, status: 'scheduled' })),
    markFailed: vi.fn(async () => ({ ...draft, status: 'failed' })),
  };

  const copyService = { generate: vi.fn(async () => ({ copy: COPY, attempts: 1 })) };
  const artDirection = {
    assignPhotos: vi.fn(async () => ({ photosByIndex: { 1: 'bench.png' }, assetIds: ['a1'] })),
    recordUse: vi.fn(async () => undefined),
  };
  const render = {
    render: vi.fn(async () => RENDER_OK),
    fetchSlide: vi.fn(async (_slug: string, file: string) => Buffer.from(`png:${file}`)),
    slideUrl: vi.fn((slug: string, file: string) => `https://render/${slug}/${file}`),
    healthy: vi.fn(async () => true),
  };
  const slideAssets = {
    publish: vi.fn(async (slug: string, files: { filename: string }[]) =>
      files.map(file => `https://assets.afrisinc.com/${slug}-${file.filename}`)
    ),
  };

  const service = new PostAgentService(
    drafts as never,
    copyService as never,
    artDirection as never,
    render as never,
    slideAssets as never
  );

  return { service, drafts, copyService, artDirection, render, slideAssets, draft };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createFromBrief', () => {
  it('runs copy, art direction and render in order and persists the draft', async () => {
    const { service, drafts, copyService, artDirection, render } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(copyService.generate).toHaveBeenCalledOnce();
    expect(artDirection.assignPhotos).toHaveBeenCalledOnce();
    expect(render.render).toHaveBeenCalledOnce();
    expect(drafts.create).toHaveBeenCalledOnce();
    expect(drafts.markRendered).toHaveBeenCalledOnce();
  });

  it('stores the public asset url per rendered frame, not the internal render url', async () => {
    const { service, drafts } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    const call = drafts.markRendered.mock.calls[0][1] as { slideUrls: string[] };
    expect(call.slideUrls).toEqual([
      'https://assets.afrisinc.com/topic-abc123-slide-01.png',
      'https://assets.afrisinc.com/topic-abc123-slide-02.png',
    ]);
    expect(call.slideUrls.every(url => !url.includes('render/'))).toBe(true);
  });

  it('fetches every rendered frame from the render service before publishing', async () => {
    const { service, render, slideAssets } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(render.fetchSlide).toHaveBeenCalledTimes(2);
    expect(render.fetchSlide).toHaveBeenCalledWith('topic-abc123', 'slide-01.png');
    expect(slideAssets.publish).toHaveBeenCalledWith('topic-abc123', [
      { filename: 'slide-01.png', body: Buffer.from('png:slide-01.png') },
      { filename: 'slide-02.png', body: Buffer.from('png:slide-02.png') },
    ]);
  });

  it('fails the draft when the assets service will not take the slides', async () => {
    const { service, drafts, slideAssets } = build();
    slideAssets.publish.mockRejectedValueOnce(new Error('assets down'));

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).rejects.toThrow('assets down');

    expect(drafts.markRendered).not.toHaveBeenCalled();
    expect(drafts.markFailed).toHaveBeenCalledWith('draft-1', 'assets down');
  });

  it('fails the draft when a rendered frame cannot be fetched back', async () => {
    const { service, drafts, render, slideAssets } = build();
    render.fetchSlide.mockRejectedValueOnce(new Error('render gone'));

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).rejects.toThrow('render gone');

    expect(slideAssets.publish).not.toHaveBeenCalled();
    expect(drafts.markFailed).toHaveBeenCalledWith('draft-1', 'render gone');
  });

  it('only counts a photograph as used once the render succeeded', async () => {
    const { service, artDirection, render } = build();
    render.render.mockRejectedValueOnce(new Error('render down'));

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).rejects.toThrow('render down');

    expect(artDirection.recordUse).not.toHaveBeenCalled();
  });

  it('marks the draft failed when rendering throws', async () => {
    const { service, drafts, render } = build();
    render.render.mockRejectedValueOnce(new Error('render down'));

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).rejects.toThrow();

    expect(drafts.markFailed).toHaveBeenCalledWith('draft-1', 'render down');
  });

  it('refuses an ownerless brief', async () => {
    const { service, copyService } = build();

    await expect(service.createFromBrief({ topic: 'Software development' })).rejects.toThrow(
      BadRequestError
    );
    expect(copyService.generate).not.toHaveBeenCalled();
  });
});

describe('approve', () => {
  it('approves a draft that rendered and passed the audit', async () => {
    const { service, drafts } = build();

    await service.approve('draft-1', 'user-1');

    expect(drafts.approve).toHaveBeenCalledWith('draft-1', 'user-1');
  });

  it('refuses to approve when the audit failed', async () => {
    const { service, drafts } = build({ auditPassed: false });

    await expect(service.approve('draft-1', 'user-1')).rejects.toThrow(ConflictError);
    expect(drafts.approve).not.toHaveBeenCalled();
  });

  it('refuses to approve when nothing has been rendered', async () => {
    const { service, drafts } = build({ slideUrls: [] });

    await expect(service.approve('draft-1', 'user-1')).rejects.toThrow(ConflictError);
    expect(drafts.approve).not.toHaveBeenCalled();
  });

  it('refuses to approve a scheduled carousel', async () => {
    const { service } = build({ status: 'scheduled' });

    await expect(service.approve('draft-1', 'user-1')).rejects.toThrow(ConflictError);
  });

  it('404s on an unknown draft', async () => {
    const { service, drafts } = build();
    drafts.findById.mockResolvedValueOnce(null as never);

    await expect(service.approve('missing', 'user-1')).rejects.toThrow(NotFoundError);
  });
});

describe('schedule', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it('creates one social post carrying the rendered slides', async () => {
    const { service, drafts } = build({ status: 'approved', socialPostIds: [] });

    await service.schedule('draft-1', {
      platform: 'instagram',
      pageId: 'page-1',
      scheduledAt: future,
    });

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'instagram',
        mediaType: 'carousel',
        mediaUrls: ['https://render/slide-01.png'],
        aiGenerated: true,
      })
    );
    expect(drafts.markQueued).toHaveBeenCalledWith('draft-1', ['post-1'], expect.any(Date));
  });

  it('queues an unapproved draft in review rather than pending', async () => {
    const { service } = build({ status: 'awaiting_approval', socialPostIds: [] });

    await service.schedule('draft-1', { platform: 'instagram', pageId: 'p', scheduledAt: future });

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_review' })
    );
  });

  it('refuses a past timestamp', async () => {
    const { service } = build({ status: 'approved', socialPostIds: [] });

    await expect(
      service.schedule('draft-1', {
        platform: 'instagram',
        pageId: 'p',
        scheduledAt: '2020-01-01T00:00:00.000Z',
      })
    ).rejects.toThrow(BadRequestError);
    expect(socialMediaPostRepository.createPost).not.toHaveBeenCalled();
  });

  it('refuses an unparseable timestamp', async () => {
    const { service } = build({ status: 'approved', socialPostIds: [] });

    await expect(
      service.schedule('draft-1', { platform: 'instagram', pageId: 'p', scheduledAt: 'soon' })
    ).rejects.toThrow(BadRequestError);
  });
});

describe('queueing for review', () => {
  it('queues the draft into a slot as soon as it renders', async () => {
    const { service, drafts } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(drafts.markQueued).toHaveBeenCalledOnce();
    const [, postIds, scheduledAt] = drafts.markQueued.mock.calls[0];
    expect(postIds).toEqual(['post-1']);
    expect(scheduledAt).toBeInstanceOf(Date);
  });

  it('creates the post held in review so the cron cannot pick it up', async () => {
    const { service } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_review' })
    );
  });

  it('asks for a slot that is not already taken by another draft', async () => {
    const { service, drafts } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(drafts.findTakenSlots).toHaveBeenCalledOnce();
  });

  it('releases the queued posts on approval instead of creating new ones', async () => {
    const { service, drafts } = build({ socialPostIds: ['post-1'], scheduledAt: new Date() });

    await service.approve('draft-1', 'user-1');

    expect(socialMediaPostRepository.setStatusForPosts).toHaveBeenCalledWith(
      ['post-1'],
      'pending'
    );
    expect(socialMediaPostRepository.createPost).not.toHaveBeenCalled();
    expect(drafts.markScheduled).toHaveBeenCalled();
  });

  it('cancels the queued posts on rejection so nothing is left in the queue', async () => {
    const { service } = build({ socialPostIds: ['post-1', 'post-2'] });

    await service.reject('draft-1', 'off brand');

    expect(socialMediaPostRepository.setStatusForPosts).toHaveBeenCalledWith(
      ['post-1', 'post-2'],
      'deleted'
    );
  });

  it('reschedules the existing rows rather than duplicating them', async () => {
    const { service, drafts } = build({ socialPostIds: ['post-1'] });
    const future = new Date(Date.now() + 86_400_000).toISOString();

    await service.schedule('draft-1', { scheduledAt: future });

    expect(socialMediaPostRepository.reschedulePosts).toHaveBeenCalledWith(
      ['post-1'],
      expect.any(Date)
    );
    expect(socialMediaPostRepository.createPost).not.toHaveBeenCalled();
    expect(drafts.markQueued).toHaveBeenCalled();
  });

  it('keeps the artwork when queuing fails', async () => {
    const { service, drafts } = build();
    drafts.markQueued.mockRejectedValueOnce(new Error('slot table down'));

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).resolves.toBeDefined();

    expect(drafts.markFailed).not.toHaveBeenCalled();
  });

  it('refuses to schedule a rejected draft', async () => {
    const { service } = build({ status: 'rejected' });

    await expect(service.schedule('draft-1', {})).rejects.toThrow(ConflictError);
  });
});

describe('single post', () => {
  it('asks the copy agent for a one-frame brief', async () => {
    const { service, copyService } = build();

    await service.createFromBrief({ topic: 'We fix what we sell', userId: 'user-1', format: 'single' });

    expect(copyService.generate).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'single' })
    );
  });

  it('publishes a lone frame as a single image, not a carousel', async () => {
    const { service } = build({
      status: 'approved',
      format: 'single',
      slideUrls: ['https://assets/main-01.png'],
      socialPostIds: [],
    });
    const future = new Date(Date.now() + 86_400_000).toISOString();

    await service.schedule('draft-1', { platform: 'instagram', pageId: 'p', scheduledAt: future });

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'image', postFormat: 'feed' })
    );
  });
});

describe('story format', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it('asks the copy agent for story copy', async () => {
    const { service, copyService } = build();

    await service.createFromBrief({
      topic: 'Repairs',
      userId: 'user-1',
      format: 'story',
    });

    expect(copyService.generate).toHaveBeenCalledWith(expect.objectContaining({ format: 'story' }));
  });

  it('publishes one post per frame, because a story is not swipeable', async () => {
    const { service } = build({
      status: 'approved',
      format: 'story',
      socialPostIds: [],
      slideUrls: ['https://render/story-01.png', 'https://render/story-02.png'],
    });

    await service.schedule('draft-1', {
      platform: 'instagram',
      pageId: 'page-1',
      scheduledAt: future,
    });

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledTimes(2);
    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ postFormat: 'story', mediaUrls: ['https://render/story-01.png'] })
    );
  });

  it('carries hashtags on a feed post but never on a story', async () => {
    const { service } = build({
      status: 'approved',
      format: 'story',
      socialPostIds: [],
      slideUrls: ['https://render/story-01.png'],
    });

    await service.schedule('draft-1', {
      platform: 'instagram',
      pageId: 'page-1',
      scheduledAt: future,
    });

    const payload = socialMediaPostRepository.createPost.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.tags).toBeUndefined();
    expect(payload.message).toBeUndefined();
  });

  it('publishes a carousel as a single post carrying every frame', async () => {
    const { service } = build({
      status: 'approved',
      format: 'post',
      socialPostIds: [],
      slideUrls: ['https://render/slide-01.png', 'https://render/slide-02.png'],
    });

    await service.schedule('draft-1', {
      platform: 'instagram',
      pageId: 'page-1',
      scheduledAt: future,
    });

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledTimes(1);
    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'carousel', postFormat: 'feed' })
    );
  });
});

describe('rerender', () => {
  it('re-renders from the stored spec rather than regenerating copy', async () => {
    const { service, copyService, render } = build();

    await service.rerender('draft-1');

    expect(copyService.generate).not.toHaveBeenCalled();
    expect(render.render).toHaveBeenCalledOnce();
  });

  it('republishes the frames so the draft never points at a stale asset', async () => {
    const { service, slideAssets } = build();

    await service.rerender('draft-1');

    expect(slideAssets.publish).toHaveBeenCalledOnce();
  });

  it('refuses to re-render a scheduled carousel', async () => {
    const { service, render } = build({ status: 'scheduled' });

    await expect(service.rerender('draft-1')).rejects.toThrow(ConflictError);
    expect(render.render).not.toHaveBeenCalled();
  });
});
