import { beforeEach, describe, expect, it, vi } from 'vitest';

const n8nArticle = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  createMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  aggregate: vi.fn(),
}));
const mediaPost = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
const $transaction = vi.hoisted(() => vi.fn(async (operations: unknown[]) => operations));

vi.mock('@/database/prismaClient', () => ({ prisma: { n8nArticle, mediaPost, $transaction } }));

const { N8nArticleRepository } = await import('@/repositories/n8nArticle.repository');

describe('N8nArticleRepository news desk queries', () => {
  const repository = new N8nArticleRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    n8nArticle.findMany.mockResolvedValue([]);
    n8nArticle.count.mockResolvedValue(0);
  });

  it('lists newest first with only the latest media post and the social post count', async () => {
    await repository.listForDesk({ page: 2, limit: 12 });

    const query = n8nArticle.findMany.mock.calls[0][0];
    expect(query.where).toEqual({});
    expect(query.orderBy).toEqual({ created_at: 'desc' });
    expect(query.skip).toBe(12);
    expect(query.take).toBe(12);
    expect(query.include.mediaPosts.take).toBe(1);
    expect(query.include._count).toEqual({ select: { generatedPosts: true } });
  });

  it('filters by status, category and search across source and rewritten titles', async () => {
    await repository.listForDesk({
      status: 'failed',
      category: 'tech',
      search: 'fintech',
      page: 1,
      limit: 12,
    });

    const where = n8nArticle.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('failed');
    expect(where.category).toEqual({ equals: 'tech', mode: 'insensitive' });
    expect(where.OR).toHaveLength(4);
    expect(where.OR[3]).toEqual({
      mediaPosts: { some: { title: { contains: 'fintech', mode: 'insensitive' } } },
    });
    expect(n8nArticle.count).toHaveBeenCalledWith({ where });
  });

  it('totals articles per status with their views and reads', async () => {
    n8nArticle.groupBy.mockResolvedValue([]);

    await repository.deskStatusTotals();

    expect(n8nArticle.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      _count: { _all: true },
      _sum: { viewCount: true, readCount: true },
    });
  });

  it('counts only articles still processing since before the cutoff', async () => {
    const cutoff = new Date('2026-09-23T10:00:00.000Z');

    await repository.countStuck(cutoff);

    expect(n8nArticle.count).toHaveBeenCalledWith({
      where: { status: 'processing', updated_at: { lt: cutoff } },
    });
  });

  it('loads an article with its enhanced body and its social posts', async () => {
    n8nArticle.findUnique.mockResolvedValue(null);

    await repository.findDeskDetail(9n);

    const query = n8nArticle.findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ id: 9n });
    expect(query.include.mediaPosts.select.content).toBe(true);
    expect(query.include.generatedPosts.take).toBe(20);
  });
});

describe('N8nArticleRepository news agent pipeline', () => {
  const repository = new N8nArticleRepository();

  beforeEach(() => vi.clearAllMocks());

  it('finds which guids already exist in one query', async () => {
    n8nArticle.findMany.mockResolvedValue([{ guid: 'a' }]);

    const existing = await repository.findExistingGuids(['a', 'b']);

    expect(existing).toEqual(new Set(['a']));
    expect(n8nArticle.findMany).toHaveBeenCalledWith({
      where: { guid: { in: ['a', 'b'] } },
      select: { guid: true },
    });
  });

  it('skips the lookup and the insert when there is nothing to check', async () => {
    await expect(repository.findExistingGuids([])).resolves.toEqual(new Set());
    await expect(repository.createIngested([])).resolves.toBe(0);
    expect(n8nArticle.findMany).not.toHaveBeenCalled();
    expect(n8nArticle.createMany).not.toHaveBeenCalled();
  });

  it('inserts new articles, tolerating a guid another run just saved', async () => {
    n8nArticle.createMany.mockResolvedValue({ count: 1 });

    const created = await repository.createIngested([{ guid: 'a', source_url: 'https://a' }]);

    expect(created).toBe(1);
    expect(n8nArticle.createMany).toHaveBeenCalledWith({
      data: [{ guid: 'a', source_url: 'https://a' }],
      skipDuplicates: true,
    });
  });

  it('claims the oldest drafts, keeping only the ones this run won', async () => {
    n8nArticle.findMany.mockResolvedValue([{ id: 1n }, { id: 2n }, { id: 3n }]);
    n8nArticle.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    n8nArticle.findUnique.mockResolvedValueOnce({ id: 1n }).mockResolvedValueOnce(null);

    const claimed = await repository.claimForEnhancement(3);

    expect(n8nArticle.findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'draft' },
      orderBy: { created_at: 'asc' },
      take: 3,
    });
    expect(n8nArticle.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 1n, status: 'draft' },
      data: { status: 'processing', processing_error: null },
    });
    expect(claimed).toEqual([{ id: 1n }]);
  });

  it('fails articles orphaned in processing before the cutoff', async () => {
    n8nArticle.updateMany.mockResolvedValue({ count: 2 });
    const cutoff = new Date('2026-09-23T10:00:00.000Z');

    await expect(repository.failOrphaned(cutoff, 'interrupted')).resolves.toBe(2);
    expect(n8nArticle.updateMany).toHaveBeenCalledWith({
      where: { status: 'processing', updated_at: { lt: cutoff } },
      data: { status: 'failed', processing_error: 'interrupted' },
    });
  });

  it.each([
    [{ id: 'mp' }, null, true],
    [null, { id: 5n }, true],
    [null, null, false],
  ])('checks a slug against media posts and other articles', async (post, other, taken) => {
    mediaPost.findUnique.mockResolvedValue(post);
    n8nArticle.findFirst.mockResolvedValue(other);

    await expect(repository.isSlugTaken('slug', 9n)).resolves.toBe(taken);
    expect(n8nArticle.findFirst.mock.calls[0][0].where).toEqual({ slug: 'slug', NOT: { id: 9n } });
  });

  it('creates the media post and publishes the article in one transaction', async () => {
    mediaPost.create.mockReturnValue('create-op');
    n8nArticle.update.mockReturnValue('update-op');

    const created = await repository.publishEnhanced(
      9n,
      { title: 't', slug: 's', content: 'c' },
      { status: 'published' }
    );

    expect($transaction).toHaveBeenCalledWith(['create-op', 'update-op']);
    expect(n8nArticle.update).toHaveBeenCalledWith({
      where: { id: 9n },
      data: { status: 'published' },
    });
    expect(created).toBe('create-op');
  });

  it('reports when the last article was ingested', async () => {
    const latest = new Date('2026-09-23T08:00:00.000Z');
    n8nArticle.aggregate.mockResolvedValue({ _max: { created_at: latest } });

    await expect(repository.latestIngestedAt()).resolves.toBe(latest);
  });
});
