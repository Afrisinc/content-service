import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/http-error';

const repository = vi.hoisted(() => ({
  listForDesk: vi.fn(),
  deskStatusTotals: vi.fn(),
  countStuck: vi.fn(),
  getCategories: vi.fn(),
  latestIngestedAt: vi.fn(),
  findDeskDetail: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
}));

const agent = vi.hoisted(() => ({
  status: vi.fn(() => ({ enabled: true })),
  trigger: vi.fn(),
}));

vi.mock('@/repositories/n8nArticle.repository', () => ({ n8nArticleRepository: repository }));
vi.mock('@/services/newsAgent.service', () => ({ newsAgentService: agent }));

const { newsDeskService, STUCK_AFTER_MINUTES } = await import('@/services/newsDesk.service');

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);

const article = (status: string, updatedMinutesAgo = 1) => ({
  id: 7n,
  status,
  updated_at: minutesAgo(updatedMinutesAgo),
});

describe('NewsDeskService.list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flattens the latest media post and the social post count onto each article', async () => {
    repository.listForDesk.mockResolvedValue({
      articles: [
        {
          id: 1n,
          status: 'published',
          updated_at: minutesAgo(5),
          mediaPosts: [{ id: 'mp-1', title: 'Rewritten' }],
          _count: { generatedPosts: 3 },
        },
        {
          id: 2n,
          status: 'draft',
          updated_at: minutesAgo(5),
          mediaPosts: [],
          _count: { generatedPosts: 0 },
        },
      ],
      total: 2,
    });

    const result = await newsDeskService.list({});

    expect(result.items[0]).toMatchObject({
      mediaPost: { id: 'mp-1', title: 'Rewritten' },
      generatedPostCount: 3,
      stuck: false,
    });
    expect(result.items[0]).not.toHaveProperty('mediaPosts');
    expect(result.items[1].mediaPost).toBeNull();
    expect(result).toMatchObject({ total: 2, page: 1, limit: 12 });
  });

  it('flags an article that has been processing longer than the stuck threshold', async () => {
    repository.listForDesk.mockResolvedValue({
      articles: [
        {
          ...article('processing', STUCK_AFTER_MINUTES + 5),
          mediaPosts: [],
          _count: { generatedPosts: 0 },
        },
        { ...article('processing', 2), id: 8n, mediaPosts: [], _count: { generatedPosts: 0 } },
      ],
      total: 2,
    });

    const result = await newsDeskService.list({});

    expect(result.items.map(item => item.stuck)).toEqual([true, false]);
  });

  it('clamps paging and drops blank filters before querying', async () => {
    repository.listForDesk.mockResolvedValue({ articles: [], total: 0 });

    await newsDeskService.list({ page: 0, limit: 500, category: '  ', search: ' ai ' });

    expect(repository.listForDesk).toHaveBeenCalledWith({
      status: undefined,
      category: undefined,
      search: 'ai',
      page: 1,
      limit: 100,
    });
  });
});

describe('NewsDeskService.summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('totals statuses, views and reads, and reports stuck articles and categories', async () => {
    repository.deskStatusTotals.mockResolvedValue([
      { status: 'published', _count: { _all: 4 }, _sum: { viewCount: 900, readCount: 300 } },
      { status: 'failed', _count: { _all: 2 }, _sum: { viewCount: null, readCount: null } },
      { status: 'legacy', _count: { _all: 1 }, _sum: { viewCount: 0, readCount: 0 } },
    ]);
    repository.countStuck.mockResolvedValue(1);
    repository.getCategories.mockResolvedValue(['news', 'tech']);
    repository.latestIngestedAt.mockResolvedValue(new Date('2026-09-23T08:00:00.000Z'));

    const summary = await newsDeskService.summary();

    expect(summary).toEqual({
      total: 7,
      byStatus: { draft: 0, processing: 0, published: 4, skipped: 0, failed: 2 },
      stuck: 1,
      views: 900,
      reads: 300,
      categories: ['news', 'tech'],
      stuckAfterMinutes: STUCK_AFTER_MINUTES,
      lastIngestedAt: new Date('2026-09-23T08:00:00.000Z'),
      agent: { enabled: true },
    });
  });
});

describe('NewsDeskService.get', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the article with its enhanced version', async () => {
    repository.findDeskDetail.mockResolvedValue({
      ...article('published'),
      mediaPosts: [{ id: 'mp-1', content: '## Body' }],
      generatedPosts: [],
    });

    const detail = await newsDeskService.get('7');

    expect(repository.findDeskDetail).toHaveBeenCalledWith(7n);
    expect(detail.mediaPost).toEqual({ id: 'mp-1', content: '## Body' });
    expect(detail.stuck).toBe(false);
  });

  it('returns a null enhanced version when WF2 has not produced one yet', async () => {
    repository.findDeskDetail.mockResolvedValue({ ...article('draft'), mediaPosts: [] });

    await expect(newsDeskService.get('7')).resolves.toMatchObject({ mediaPost: null });
  });

  it('rejects an unknown article', async () => {
    repository.findDeskDetail.mockResolvedValue(null);

    await expect(newsDeskService.get('7')).rejects.toThrow(NotFoundError);
  });

  it('rejects a non-numeric id before touching the database', async () => {
    await expect(newsDeskService.get('abc')).rejects.toThrow(BadRequestError);
    expect(repository.findDeskDetail).not.toHaveBeenCalled();
  });
});

describe('NewsDeskService.requeue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.update.mockImplementation(async (_id, data) => ({ id: 7n, ...data }));
  });

  it.each(['failed', 'skipped'])(
    'sends a %s article back to draft and clears its error',
    async status => {
      repository.findById.mockResolvedValue(article(status));

      await newsDeskService.requeue('7');

      expect(repository.update).toHaveBeenCalledWith(7n, {
        status: 'draft',
        processing_error: null,
      });
    }
  );

  it('requeues an article stuck in processing', async () => {
    repository.findById.mockResolvedValue(article('processing', STUCK_AFTER_MINUTES + 1));

    await newsDeskService.requeue('7');

    expect(repository.update).toHaveBeenCalledWith(7n, { status: 'draft', processing_error: null });
  });

  it('refuses an article WF2 is still actively enhancing', async () => {
    repository.findById.mockResolvedValue(article('processing', 5));

    await expect(newsDeskService.requeue('7')).rejects.toThrow(/still being enhanced/);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each(['draft', 'published'])('refuses a %s article', async status => {
    repository.findById.mockResolvedValue(article(status));

    await expect(newsDeskService.requeue('7')).rejects.toThrow(ConflictError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown article', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(newsDeskService.requeue('7')).rejects.toThrow(NotFoundError);
  });
});

describe('NewsDeskService.skip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.update.mockImplementation(async (_id, data) => ({ id: 7n, ...data }));
  });

  it.each(['draft', 'failed'])('skips a %s article', async status => {
    repository.findById.mockResolvedValue(article(status));

    await newsDeskService.skip('7');

    expect(repository.update).toHaveBeenCalledWith(7n, { status: 'skipped' });
  });

  it.each(['processing', 'published', 'skipped'])('refuses a %s article', async status => {
    repository.findById.mockResolvedValue(article(status));

    await expect(newsDeskService.skip('7')).rejects.toThrow(ConflictError);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('NewsDeskService.setFeatured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.update.mockImplementation(async (_id, data) => ({ id: 7n, ...data }));
  });

  it('features a published article', async () => {
    repository.findById.mockResolvedValue(article('published'));

    await newsDeskService.setFeatured('7', true);

    expect(repository.update).toHaveBeenCalledWith(7n, { is_featured: true });
  });

  it('refuses to feature an article that is not published', async () => {
    repository.findById.mockResolvedValue(article('draft'));

    await expect(newsDeskService.setFeatured('7', true)).rejects.toThrow(ConflictError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('always allows unfeaturing, whatever the status', async () => {
    repository.findById.mockResolvedValue(article('failed'));

    await newsDeskService.setFeatured('7', false);

    expect(repository.update).toHaveBeenCalledWith(7n, { is_featured: false });
  });
});

describe('NewsDeskService.triggerStage', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['ingest', 'enhance'] as const)('starts the %s stage', stage => {
    agent.trigger.mockReturnValue(true);

    expect(newsDeskService.triggerStage(stage)).toEqual({ stage, started: true });
    expect(agent.trigger).toHaveBeenCalledWith(stage);
  });

  it.each([
    ['ingest', /feeds are already being fetched/],
    ['enhance', /articles are already being enhanced/],
  ] as const)('refuses a %s stage that is already running', (stage, message) => {
    agent.trigger.mockReturnValue(false);

    expect(() => newsDeskService.triggerStage(stage)).toThrow(message);
  });
});
