import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  NEWS_RSS_SOURCES: JSON.stringify([
    { name: 'Alpha', url: 'https://alpha.africa/feed', category: 'tech' },
    { name: 'Beta', url: 'https://beta.africa/feed', category: 'business' },
    { name: 'Broken', url: 'https://broken.africa/feed', category: 'news' },
  ]),
  NEWS_FEED_TIMEOUT_MS: 10000,
  NEWS_FEED_ITEM_LIMIT: 10,
}));

const repository = vi.hoisted(() => ({
  findExistingGuids: vi.fn(),
  createIngested: vi.fn(),
}));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('@/repositories/n8nArticle.repository', () => ({ n8nArticleRepository: repository }));

const { NewsIngestionService } = await import('@/services/newsIngestion.service');

const feed = (...items: { guid: string; title: string }[]) =>
  `<rss><channel>${items
    .map(
      item =>
        `<item><title>${item.title}</title><guid>${item.guid}</guid>` +
        `<link>https://x.africa/${item.guid}</link></item>`
    )
    .join('')}</channel></rss>`;

const FEEDS: Record<string, string> = {
  'https://alpha.africa/feed': feed(
    { guid: 'a1', title: 'Alpha one' },
    { guid: 'shared', title: 'Shared' }
  ),
  'https://beta.africa/feed': feed(
    { guid: 'b1', title: 'Beta one' },
    { guid: 'shared', title: 'Again' }
  ),
};

describe('NewsIngestionService.run', () => {
  const fetchFeed = vi.fn(async (url: string) => {
    if (!(url in FEEDS)) {
      throw new Error('ETIMEDOUT');
    }
    return FEEDS[url];
  });

  beforeEach(() => {
    vi.clearAllMocks();
    repository.findExistingGuids.mockResolvedValue(new Set(['b1']));
    repository.createIngested.mockImplementation(async rows => rows.length);
  });

  it('saves only items that are new, tagged with their source, as drafts', async () => {
    const result = await new NewsIngestionService(fetchFeed).run();

    expect(repository.findExistingGuids).toHaveBeenCalledWith(['a1', 'shared', 'b1']);
    const rows = repository.createIngested.mock.calls[0][0];
    expect(rows.map((row: { guid: string }) => row.guid)).toEqual(['a1', 'shared']);
    expect(rows[0]).toMatchObject({
      guid: 'a1',
      source_url: 'https://x.africa/a1',
      source_headline: 'Alpha one',
      category: 'tech',
      creator: 'Alpha',
      status: 'draft',
    });
    expect(result).toMatchObject({ sources: 3, fetched: 4, created: 2, duplicates: 2 });
  });

  it('reports a failing feed without stopping the others', async () => {
    const result = await new NewsIngestionService(fetchFeed).run();

    expect(result.failedSources).toEqual([{ name: 'Broken', error: 'ETIMEDOUT' }]);
    expect(repository.createIngested).toHaveBeenCalledTimes(1);
  });

  it('reports a feed that is not RSS as a failed source', async () => {
    const fetcher = vi.fn(async () => '<html>maintenance</html>');

    const result = await new NewsIngestionService(fetcher).run();

    expect(result.failedSources.map(source => source.name)).toEqual(['Alpha', 'Beta', 'Broken']);
    expect(result).toMatchObject({ fetched: 0, created: 0 });
  });

  it('records a non-Error rejection as text', async () => {
    const fetcher = vi.fn(() => Promise.reject('offline'));

    const result = await new NewsIngestionService(fetcher).run();

    expect(result.failedSources[0].error).toBe('offline');
  });
});
