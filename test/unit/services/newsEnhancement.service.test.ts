import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  OPENAI_API_KEY: 'sk-test',
  NEWS_ENHANCE_BATCH_SIZE: 5,
  NEWS_MIN_SCORE: 0.6,
  NEWS_TEXT_MODEL: 'gpt-4o',
}));

const repository = vi.hoisted(() => ({
  failOrphaned: vi.fn(),
  claimForEnhancement: vi.fn(),
  update: vi.fn(),
  isSlugTaken: vi.fn(),
  publishEnhanced: vi.fn(),
}));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('@/repositories/n8nArticle.repository', () => ({ n8nArticleRepository: repository }));
vi.mock('@/adapters/nodes/nodeServices', () => ({ nodeServices: {} }));
vi.mock('@/nodes', () => ({ runChatGpt: vi.fn(), chatGptCredentialsFromEnv: vi.fn() }));
vi.mock('@/utils/assets-client', () => ({ getAssetsClient: vi.fn() }));

const { NewsEnhancementService } = await import('@/services/newsEnhancement.service');

const article = (id: bigint) =>
  ({
    id,
    guid: `guid-${id}`,
    source_url: 'https://example.africa/story',
    source_headline: 'Kenya opens M-Pesa API',
    source_summary: 'Regulators agree.',
    image_url: null,
    pub_date: null,
    category: 'tech',
    creator: 'Disrupt Africa',
    status: 'processing',
    processing_error: null,
    is_featured: false,
    slug: null,
    ai_generated: false,
    tags: [],
    read_time: 1,
    viewCount: 0,
    readCount: 0,
    created_at: new Date(),
    updated_at: new Date(),
  }) as never;

const goodReply = {
  score: 0.8,
  should_publish: true,
  title: "M-Pesa's open API could reshape banking",
  slug: 'mpesa-open-api',
  excerpt: 'One standard for the region.',
  content: `<h2>Why</h2><p>${'word '.repeat(200)}</p>`,
  tags: ['fintech'],
  category: 'fintech',
  image_prompt: 'A Nairobi banking hall',
};

describe('NewsEnhancementService', () => {
  const deps = {
    writeArticle: vi.fn(),
    drawCover: vi.fn(),
    storeCover: vi.fn(),
  };
  const service = new NewsEnhancementService(deps);

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.OPENAI_API_KEY = 'sk-test';
    repository.failOrphaned.mockResolvedValue(0);
    repository.isSlugTaken.mockResolvedValue(false);
    repository.publishEnhanced.mockResolvedValue({ id: 'mp-1' });
    deps.writeArticle.mockResolvedValue(goodReply);
    deps.drawCover.mockResolvedValue(Buffer.from('png'));
    deps.storeCover.mockResolvedValue('https://cdn.afrisinc.com/mpesa-open-api.png');
  });

  it('publishes the media post and the article together, with the stored cover', async () => {
    const outcome = await service.enhance(article(7n));

    expect(outcome).toBe('published');
    expect(deps.writeArticle.mock.calls[0][0].articleId).toBe(7n);
    expect(deps.drawCover).toHaveBeenCalledWith('A Nairobi banking hall', 7n);
    expect(deps.storeCover).toHaveBeenCalledWith(Buffer.from('png'), 'mpesa-open-api.png');

    const [articleId, mediaPost, articleUpdate] = repository.publishEnhanced.mock.calls[0];
    expect(articleId).toBe(7n);
    expect(mediaPost).toMatchObject({
      n8nArticleId: 7n,
      slug: 'mpesa-open-api',
      status: 'PUBLISHED',
      cover_image: 'https://cdn.afrisinc.com/mpesa-open-api.png',
      og_image: 'https://cdn.afrisinc.com/mpesa-open-api.png',
      ai_generated: true,
      ai_provider: 'openai',
      ai_model: 'gpt-4o',
      ai_score: 0.8,
      source_url: 'https://example.africa/story',
      source_name: 'Disrupt Africa',
      rss_guid: 'guid-7',
      media_type: 'image',
    });
    expect(mediaPost.published_at).toBeInstanceOf(Date);
    expect(mediaPost).not.toHaveProperty('canonical_url');
    expect(mediaPost.ai_prompt).toContain('Original URL: https://example.africa/story');
    expect(articleUpdate).toEqual({
      status: 'published',
      slug: 'mpesa-open-api',
      tags: ['fintech'],
      read_time: 2,
      image_url: 'https://cdn.afrisinc.com/mpesa-open-api.png',
      ai_generated: true,
      processing_error: null,
    });
  });

  it('rejects a low-scoring story without paying for an image', async () => {
    deps.writeArticle.mockResolvedValue({ ...goodReply, score: 0.4 });

    const outcome = await service.enhance(article(7n));

    expect(outcome).toBe('rejected');
    expect(repository.update).toHaveBeenCalledWith(7n, {
      status: 'skipped',
      processing_error: 'Rejected by the AI editor (score 0.40): below the relevance threshold',
    });
    expect(deps.drawCover).not.toHaveBeenCalled();
    expect(repository.publishEnhanced).not.toHaveBeenCalled();
  });

  it('rejects a story the model declined, quoting its reason', async () => {
    deps.writeArticle.mockResolvedValue({
      score: 0.9,
      should_publish: false,
      reject_reason: 'Duplicate of yesterday',
    });

    await service.enhance(article(7n));

    expect(repository.update.mock.calls[0][1].processing_error).toBe(
      'Rejected by the AI editor (score 0.90): Duplicate of yesterday'
    );
  });

  it('suffixes the slug with the article id when it is taken', async () => {
    repository.isSlugTaken.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await service.enhance(article(7n));

    expect(repository.publishEnhanced.mock.calls[0][1].slug).toBe('mpesa-open-api-7');
  });

  it('adds a time suffix when both slugs are taken', async () => {
    repository.isSlugTaken.mockResolvedValue(true);

    await service.enhance(article(7n));

    expect(repository.publishEnhanced.mock.calls[0][1].slug).toMatch(
      /^mpesa-open-api-7-[a-z0-9]+$/
    );
  });

  it.each([
    ['the text model', () => deps.writeArticle.mockRejectedValue(new Error('OpenAI 429'))],
    ['the image model', () => deps.drawCover.mockRejectedValue(new Error('content_policy'))],
    ['the assets service', () => deps.storeCover.mockRejectedValue(new Error('upload failed'))],
    ['the database', () => repository.publishEnhanced.mockRejectedValue(new Error('P2002'))],
  ])('marks the article failed with the reason when %s fails', async (_stage, arrange) => {
    arrange();

    const outcome = await service.enhance(article(7n));

    expect(outcome).toBe('failed');
    expect(repository.update).toHaveBeenCalledWith(7n, {
      status: 'failed',
      processing_error: expect.any(String),
    });
  });

  it('marks the article failed when the reply is unusable', async () => {
    deps.writeArticle.mockResolvedValue('not json');

    await service.enhance(article(7n));

    expect(repository.update).toHaveBeenCalledWith(7n, {
      status: 'failed',
      processing_error: 'the model did not return a JSON object',
    });
  });

  it('records a non-Error failure as text, truncated', async () => {
    deps.writeArticle.mockRejectedValue('x'.repeat(2000));

    await service.enhance(article(7n));

    expect(repository.update.mock.calls[0][1].processing_error).toHaveLength(1000);
  });

  it('run recovers orphans, claims a batch and tallies each outcome', async () => {
    repository.failOrphaned.mockResolvedValue(2);
    repository.claimForEnhancement.mockResolvedValue([article(1n), article(2n), article(3n)]);
    deps.writeArticle
      .mockResolvedValueOnce(goodReply)
      .mockResolvedValueOnce({ ...goodReply, score: 0.1 })
      .mockRejectedValueOnce(new Error('timeout'));

    const result = await service.run();

    expect(repository.failOrphaned).toHaveBeenCalledWith(
      expect.any(Date),
      expect.stringContaining('stopped')
    );
    expect(repository.claimForEnhancement).toHaveBeenCalledWith(5);
    expect(result).toMatchObject({
      claimed: 3,
      published: 1,
      rejected: 1,
      failed: 1,
      recovered: 2,
    });
  });

  it('run refuses to start without an OpenAI key, before claiming anything', async () => {
    envMock.OPENAI_API_KEY = '';

    await expect(service.run()).rejects.toThrow(/OPENAI_API_KEY/);
    expect(repository.claimForEnhancement).not.toHaveBeenCalled();
  });
});
