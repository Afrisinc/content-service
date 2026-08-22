import { isRunCancellable, resetRunCancellations } from '@/helpers/runCancellation.helper';
import { PostAgentService } from '@/services/postAgent.service';
import { PostCopy, RenderResult } from '@/types/post.types';
import { BadRequestError, ConflictError, NotFoundError, ServerError } from '@/utils/http-error';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/cache', () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => undefined),
  cacheDelete: vi.fn(async () => undefined),
}));

vi.mock('@/repositories/socialMediaPost.repository', () => ({
  socialMediaPostRepository: {
    createPost: vi.fn(async () => ({ id: 'post-1' })),
    setStatusForPosts: vi.fn(async () => ({ count: 1 })),
    reschedulePosts: vi.fn(async () => ({ count: 1 })),
  },
}));

vi.mock('@/utils/notify', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/notify')>()),
  sendNotification: vi.fn(async () => ({ sent: [{ id: 'notif-1' }], failed: 0, skipped: null })),
}));

const { socialMediaPostRepository } = await import('@/repositories/socialMediaPost.repository');
const { cacheDelete } = await import('@/utils/cache');
const { sendNotification } = await import('@/utils/notify');

const COPY: PostCopy = {
  concept: 'The design performs the sentence.',
  caption: 'Your process. Not a template.',
  hashtags: ['#AFRISINC'],
  claims: ['Free scoping session'],
  slides: [
    { role: 'hook', eyebrow: 'A', eyebrowKind: 'label', headline: ['Your process.'] },
    { role: 'proof', eyebrow: 'B', eyebrowKind: 'claim', headline: ['Web apps.'] },
    { role: 'method', eyebrow: 'C', eyebrowKind: 'label', headline: ['Ship in weeks,'] },
    {
      role: 'cta',
      eyebrow: 'D',
      eyebrowKind: 'claim',
      headline: ['Tell us.'],
      cta: 'afrisinc.com',
    },
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
    topic: 'Software development',
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
    refreshSpec: vi.fn(async () => draft),
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

  const accounts = {
    findAllByUser: vi.fn(async () => [
      {
        id: 'acc-1',
        platform: 'instagram',
        pageId: 'page-1',
        pageName: 'AFRISINC',
        isActive: true,
      },
    ]),
  };
  const groups = {
    findDefaultForUser: vi.fn(async () => null),
    findActiveTargets: vi.fn(async () => [
      { accountId: 'acc-1', platform: 'instagram', pageId: 'page-1', pageName: 'AFRISINC' },
      { accountId: 'acc-2', platform: 'facebook', pageId: 'page-2', pageName: 'AFRISINC FB' },
    ]),
    findCadence: vi.fn(async () => null),
  };
  const policies = { findByUser: vi.fn(async () => null) };

  const tracker = {
    begin: vi.fn(async () => 'run-1'),
    // The real tracker runs the operation it is tracing; the mock must too.
    track: vi.fn(async (_runId: unknown, _key: unknown, operation: () => Promise<unknown>) =>
      operation()
    ),
    succeed: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    skip: vi.fn(async () => undefined),
    waitingOn: vi.fn(async () => undefined),
    finish: vi.fn(async () => undefined),
  };

  const runs = {
    findLatestByDraftId: vi.fn(async () => ({ id: 'run-1' })),
    // No draft on the run by default, so a build() is a fresh draft, not a resume.
    findById: vi.fn(async () => ({
      id: 'run-1',
      userId: 'user-1',
      draftId: null,
      status: 'running',
      groupId: null,
    })),
  };

  const users = {
    findById: vi.fn(async () => ({ id: 'user-1', email: 'editor@example.com', name: 'Amina' })),
  };

  const service = new PostAgentService(
    drafts as never,
    copyService as never,
    artDirection as never,
    render as never,
    slideAssets as never,
    accounts as never,
    groups as never,
    policies as never,
    tracker as never,
    runs as never,
    users as never
  );

  return {
    service,
    drafts,
    copyService,
    artDirection,
    render,
    slideAssets,
    accounts,
    groups,
    policies,
    tracker,
    runs,
    users,
    draft,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRunCancellations();
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
    const { service, drafts } = build({
      status: 'approved',
      socialPostIds: [],
      slideUrls: ['https://render/slide-01.png', 'https://render/slide-02.png'],
    });

    await service.schedule('draft-1', {
      platform: 'instagram',
      pageId: 'page-1',
      scheduledAt: future,
    });

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'instagram',
        mediaType: 'carousel',
        mediaUrls: ['https://render/slide-01.png', 'https://render/slide-02.png'],
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

    expect(socialMediaPostRepository.setStatusForPosts).toHaveBeenCalledWith(['post-1'], 'pending');
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

describe('asking for a review', () => {
  it('notifies the owner to review and approve once the post is held in review', async () => {
    const { service } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(sendNotification).toHaveBeenCalledOnce();
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'post-review-requested',
        priority: 'high',
        dedupeKey: 'notify:post-review:draft-1',
        data: expect.objectContaining({
          draft_id: 'draft-1',
          topic: 'Software development',
          action: 'review-and-approve',
          review_url: expect.stringContaining('/posts/draft-1'),
        }),
      })
    );
  });

  it('addresses the owner on their own account details', async () => {
    const { service, users } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(users.findById).toHaveBeenCalledWith('user-1');
    const request = vi.mocked(sendNotification).mock.calls[0][0];
    expect(request.targets).toEqual(expect.arrayContaining([{ channel: 'in_app', to: 'user-1' }]));
    expect(request.data).toMatchObject({ name: 'Amina' });
  });

  it('reports how much the approval would release', async () => {
    const { service } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(vi.mocked(sendNotification).mock.calls[0][0].data).toMatchObject({
      post_count: 1,
      slide_count: 1,
      format: 'post',
    });
  });

  it('stays quiet when the post goes straight to the publish queue', async () => {
    const { service } = build();

    await service.createFromBrief({
      topic: 'Software development',
      userId: 'user-1',
      autoPublish: true,
    });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('still asks for the review when the owner record cannot be read', async () => {
    const { service, users } = build();
    users.findById.mockRejectedValueOnce(new Error('users table down'));

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).resolves.toBeDefined();

    const request = vi.mocked(sendNotification).mock.calls[0][0];
    expect(request.targets).toEqual([{ channel: 'in_app', to: 'user-1' }]);
  });

  it('does not ask for a review on a draft that never made it into the queue', async () => {
    const { service, drafts } = build();
    drafts.markQueued.mockRejectedValueOnce(new Error('slot table down'));

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('keeps the post when the notification cannot be delivered', async () => {
    const { service, drafts } = build();
    vi.mocked(sendNotification).mockRejectedValueOnce(new Error('notify down'));

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).resolves.toBeDefined();

    expect(drafts.markFailed).not.toHaveBeenCalled();
  });
});

describe('single post', () => {
  it('asks the copy agent for a one-frame brief', async () => {
    const { service, copyService } = build();

    await service.createFromBrief({
      topic: 'We fix what we sell',
      userId: 'user-1',
      format: 'single',
    });

    expect(copyService.generate).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'single' }),
      expect.any(AbortSignal)
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

    expect(copyService.generate).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'story' }),
      expect.any(AbortSignal)
    );
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

    const payload = socialMediaPostRepository.createPost.mock.calls[0][0] as Record<
      string,
      unknown
    >;
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

describe('publishing to a brand group', () => {
  it('creates one post per switched-on account in the group', async () => {
    const { service, groups } = build();

    await service.createFromBrief({
      topic: 'Software development',
      userId: 'user-1',
      groupId: 'group-1',
    });

    expect(groups.findActiveTargets).toHaveBeenCalledWith('group-1');
    expect(socialMediaPostRepository.createPost).toHaveBeenCalledTimes(2);
    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'instagram', pageId: 'page-1' })
    );
    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'facebook', pageId: 'page-2' })
    );
  });

  it('publishes nowhere rather than falling back when every account is muted', async () => {
    const { service, groups, drafts } = build();
    groups.findActiveTargets.mockResolvedValueOnce([] as never);

    await service.createFromBrief({
      topic: 'Software development',
      userId: 'user-1',
      groupId: 'group-1',
    });

    expect(socialMediaPostRepository.createPost).not.toHaveBeenCalled();
    expect(drafts.markQueued).not.toHaveBeenCalled();
  });

  it('falls back to the workspace default group when the brief names none', async () => {
    const { service, groups } = build();
    groups.findDefaultForUser.mockResolvedValueOnce({ id: 'default-group' } as never);

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(groups.findActiveTargets).toHaveBeenCalledWith('default-group');
    expect(socialMediaPostRepository.createPost).toHaveBeenCalledTimes(2);
  });

  it('books the slot on the group cadence rather than the service default', async () => {
    const { service, groups, drafts } = build();
    // Sunday at 06:00, which the env default (Tue/Fri at 09:00) never produces.
    groups.findCadence.mockResolvedValueOnce({
      slotWeekdays: '0',
      slotHour: 6,
      postsPerRun: 1,
      timezone: 'UTC',
    } as never);

    await service.createFromBrief({
      topic: 'Software development',
      userId: 'user-1',
      groupId: 'group-1',
    });

    const [, , scheduledAt] = drafts.markQueued.mock.calls[0] as [string, string[], Date];
    // The cadence names UTC, so the slot reads 06:00 there — not on whatever
    // clock the test machine happens to keep.
    expect(scheduledAt.getUTCDay()).toBe(0);
    expect(scheduledAt.getUTCHours()).toBe(6);
  });

  it('ignores a group cadence with no usable weekdays', async () => {
    const { service, groups, drafts } = build();
    groups.findCadence.mockResolvedValueOnce({
      slotWeekdays: 'none',
      slotHour: 6,
      postsPerRun: 1,
      timezone: 'UTC',
    } as never);

    await service.createFromBrief({
      topic: 'Software development',
      userId: 'user-1',
      groupId: 'group-1',
    });

    const [, , scheduledAt] = drafts.markQueued.mock.calls[0] as [string, string[], Date];
    expect([2, 5]).toContain(scheduledAt.getDay());
    expect(scheduledAt.getHours()).toBe(9);
  });

  it('releases straight to the publish queue when the workspace is on autopilot', async () => {
    const { service, policies } = build();
    policies.findByUser.mockResolvedValueOnce({
      mode: 'autopilot',
      autoPublish: true,
    } as never);

    await service.createFromBrief({
      topic: 'Software development',
      userId: 'user-1',
      groupId: 'group-1',
    });

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    );
  });

  it('still holds for review when autopilot is on but auto-publish is off', async () => {
    const { service, policies } = build();
    policies.findByUser.mockResolvedValueOnce({
      mode: 'autopilot',
      autoPublish: false,
    } as never);

    await service.createFromBrief({
      topic: 'Software development',
      userId: 'user-1',
      groupId: 'group-1',
    });

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_review' })
    );
  });

  it('refuses to schedule onto a group with nothing switched on', async () => {
    const { service, groups } = build({ status: 'approved', socialPostIds: [] });
    groups.findActiveTargets.mockResolvedValueOnce([] as never);

    await expect(
      service.schedule('draft-1', {
        groupId: 'group-1',
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
    ).rejects.toThrow(BadRequestError);

    expect(socialMediaPostRepository.createPost).not.toHaveBeenCalled();
  });

  it('fans a story out to every frame on every account in the group', async () => {
    const { service } = build({
      format: 'story',
      slideUrls: ['https://render/a.png', 'https://render/b.png'],
    });

    await service.createFromBrief({
      topic: 'Software development',
      format: 'story',
      userId: 'user-1',
      groupId: 'group-1',
    });

    expect(socialMediaPostRepository.createPost).toHaveBeenCalledTimes(4);
  });
});

describe('run tracing', () => {
  it('opens a run and traces every stage of a successful draft', async () => {
    const { service, tracker } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(tracker.begin).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', agent: 'post-agent', trigger: 'manual' })
    );

    const traced = tracker.track.mock.calls.map(call => call[1]);
    expect(traced).toEqual(['copy', 'art', 'render', 'assets']);

    expect(tracker.succeed).toHaveBeenCalledWith('run-1', 'brief', 'Software development');
    expect(tracker.succeed).toHaveBeenCalledWith('run-1', 'audit', 'passed');
    expect(tracker.finish).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'succeeded', draftId: 'draft-1' })
    );
  });

  it('adopts the run the automation service opened instead of starting a second', async () => {
    const { service, tracker } = build();

    await service.createFromBrief({
      topic: 'Software development',
      userId: 'user-1',
      trigger: 'autopilot',
      runId: 'existing-run',
    });

    expect(tracker.begin).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'existing-run', trigger: 'autopilot' })
    );
  });

  it('closes the run as failed when a stage throws', async () => {
    const { service, tracker, render } = build();
    render.render.mockRejectedValueOnce(new Error('render down'));

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).rejects.toThrow('render down');

    expect(tracker.finish).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', errorMessage: 'render down' })
    );
  });

  it('marks the audit failed rather than passed when the render did not pass', async () => {
    const { service, tracker, render } = build();
    render.render.mockResolvedValueOnce({
      ...RENDER_OK,
      passed: false,
      findings: [
        { slide: 1, rule: 'headline', detail: 'too long', severity: 'error' },
        { slide: 2, rule: 'contrast', detail: 'thin', severity: 'warning' },
      ],
    });

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(tracker.fail).toHaveBeenCalledWith('run-1', 'audit', '1 blocking finding');
  });

  it('reports the audit as not passed when nothing was flagged as blocking', async () => {
    const { service, tracker, render } = build();
    render.render.mockResolvedValueOnce({ ...RENDER_OK, passed: false, findings: [] });

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(tracker.fail).toHaveBeenCalledWith('run-1', 'audit', 'did not pass');
  });

  it('records where and when the post was queued', async () => {
    const { service, tracker } = build();

    await service.createFromBrief({
      topic: 'Software development',
      userId: 'user-1',
      groupId: 'group-1',
    });

    expect(tracker.succeed).toHaveBeenCalledWith(
      'run-1',
      'queue',
      expect.stringContaining('2 pages')
    );
  });

  it('leaves approval waiting on a human in manual mode', async () => {
    const { service, tracker } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(tracker.waitingOn).toHaveBeenCalledWith('run-1', 'approval');
    expect(tracker.skip).not.toHaveBeenCalledWith('run-1', 'approval', 'autopilot');
  });

  it('skips approval outright on autopilot', async () => {
    const { service, tracker, policies } = build();
    policies.findByUser.mockResolvedValueOnce({ mode: 'autopilot', autoPublish: true } as never);

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(tracker.skip).toHaveBeenCalledWith('run-1', 'approval', 'autopilot');
  });

  it('records the queue stage as failed when there is nowhere to publish', async () => {
    const { service, tracker, groups } = build();
    groups.findActiveTargets.mockResolvedValueOnce([] as never);

    await service.createFromBrief({
      topic: 'Software development',
      userId: 'user-1',
      groupId: 'group-1',
    });

    expect(tracker.fail).toHaveBeenCalledWith('run-1', 'queue', 'no live page to publish to');
  });

  it('closes approval and release on the same run when a human approves', async () => {
    const { service, tracker } = build({ socialPostIds: ['post-1'], scheduledAt: new Date() });

    await service.approve('draft-1', 'user-1');

    expect(tracker.succeed).toHaveBeenCalledWith('run-1', 'approval', 'user-1');
    expect(tracker.succeed).toHaveBeenCalledWith('run-1', 'release', '1 post');
  });

  it('records a rejection against approval and abandons the release', async () => {
    const { service, tracker } = build({ socialPostIds: ['post-1'] });

    await service.reject('draft-1', 'off brand');

    expect(tracker.fail).toHaveBeenCalledWith('run-1', 'approval', 'off brand');
    expect(tracker.skip).toHaveBeenCalledWith('run-1', 'release', 'rejected');
  });

  it('drafts normally when the trace could not be opened at all', async () => {
    const { service, tracker, drafts } = build();
    tracker.begin.mockResolvedValueOnce(null as never);

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(drafts.create).toHaveBeenCalledOnce();
    expect(drafts.markRendered).toHaveBeenCalledOnce();
  });
});

describe('resuming a failed run', () => {
  it('refuses when the working state has expired rather than silently redoing it', async () => {
    const { service, copyService } = build();

    // Redis is not configured in tests, so the cached brief is genuinely absent.
    await expect(service.resume('run-1')).rejects.toThrow(/working state/);
    expect(copyService.generate).not.toHaveBeenCalled();
  });

  it('reports a run as not resumable when nothing was cached for it', async () => {
    const { service } = build();

    await expect(service.isResumable('run-1')).resolves.toBe(false);
  });

  it('still drafts when the cache is unavailable, paying for the copy again', async () => {
    const { service, copyService, drafts } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    // No cache means no reuse — correctness never depends on Redis being up.
    expect(copyService.generate).toHaveBeenCalledOnce();
    expect(drafts.create).toHaveBeenCalledOnce();
  });

  it('reuses the draft the failed attempt created instead of orphaning it', async () => {
    const { service, drafts, runs } = build();
    runs.findById.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
      draftId: 'draft-1',
      status: 'failed',
      groupId: null,
    } as never);

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(drafts.refreshSpec).toHaveBeenCalledWith('draft-1', expect.anything());
    expect(drafts.create).not.toHaveBeenCalled();
  });

  it('carries the regenerated caption onto the reused draft', async () => {
    const { service, drafts, runs } = build();
    runs.findById.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
      draftId: 'draft-1',
      status: 'failed',
      groupId: null,
    } as never);

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(drafts.refreshSpec).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({ hashtags: ['#AFRISINC'], claims: ['Free scoping session'] })
    );
  });

  it('creates a fresh draft when the run never got as far as one', async () => {
    const { service, drafts } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(drafts.create).toHaveBeenCalledOnce();
    expect(drafts.refreshSpec).not.toHaveBeenCalled();
  });
});

describe('stopping a run', () => {
  it('gives the copy agent a signal so a stalled call can be abandoned', async () => {
    const { service, copyService } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    const signal = copyService.generate.mock.calls[0][1] as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('releases the run so a finished pass leaves nothing cancellable behind', async () => {
    const { service } = build();

    await service.createFromBrief({ topic: 'Software development', userId: 'user-1' });

    expect(isRunCancellable('run-1')).toBe(false);
  });

  it('releases the run even when the pass blew up', async () => {
    const { service, render } = build();
    render.render.mockRejectedValueOnce(new Error('render down'));

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).rejects.toThrow('render down');

    expect(isRunCancellable('run-1')).toBe(false);
  });
});

describe('copy the renderer will not lay out', () => {
  /**
   * The dead end this prevents: the renderer rejects the spec because the copy
   * is too long, resume reuses that same cached copy, and every attempt fails
   * identically for ever.
   */
  it('discards the cached copy when the renderer rejects the spec', async () => {
    const { service, render } = build();
    render.render.mockRejectedValueOnce(
      new BadRequestError('render rejected the spec: content does not fit the post band')
    );

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).rejects.toThrow(BadRequestError);

    expect(cacheDelete).toHaveBeenCalledWith('agent:run:run-1:copy');
    expect(cacheDelete).toHaveBeenCalledWith('agent:run:run-1:art.v2');
  });

  it('keeps the cached copy when the renderer itself was the problem', async () => {
    // An outage is not the copy's fault, so paying for it again would be waste.
    const { service, render } = build();
    render.render.mockRejectedValueOnce(new ServerError('render service unreachable'));

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).rejects.toThrow(ServerError);

    expect(cacheDelete).not.toHaveBeenCalled();
  });

  it('still marks the draft failed with the renderer’s reason', async () => {
    const { service, drafts, render } = build();
    render.render.mockRejectedValueOnce(
      new BadRequestError('render rejected the spec: content does not fit the post band')
    );

    await expect(
      service.createFromBrief({ topic: 'Software development', userId: 'user-1' })
    ).rejects.toThrow();

    expect(drafts.markFailed).toHaveBeenCalledWith(
      'draft-1',
      'render rejected the spec: content does not fit the post band'
    );
  });
});
