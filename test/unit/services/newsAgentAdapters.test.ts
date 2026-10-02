import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  OPENAI_API_KEY: 'sk-test',
  NEWS_ENHANCE_BATCH_SIZE: 5,
  NEWS_MIN_SCORE: 0.6,
  NEWS_TEXT_MODEL: 'gpt-4o',
  NEWS_IMAGE_MODEL: 'gpt-image-1',
  NEWS_IMAGE_SIZE: '1536x1024',
  NEWS_IMAGE_QUALITY: 'medium',
  NEWS_RSS_SOURCES: JSON.stringify([
    { name: 'Only', url: 'https://only.africa/feed', category: 'tech' },
  ]),
  NEWS_FEED_TIMEOUT_MS: 10000,
  NEWS_FEED_ITEM_LIMIT: 10,
}));
const repository = vi.hoisted(() => ({
  update: vi.fn(),
  isSlugTaken: vi.fn(async () => false),
  publishEnhanced: vi.fn(),
  findExistingGuids: vi.fn(async () => new Set<string>()),
  createIngested: vi.fn(async (rows: unknown[]) => rows.length),
}));
const runChatGpt = vi.hoisted(() => vi.fn());
const uploadBuffer = vi.hoisted(() => vi.fn());
const axiosGet = vi.hoisted(() => vi.fn());

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('@/repositories/n8nArticle.repository', () => ({ n8nArticleRepository: repository }));
vi.mock('@/adapters/nodes/nodeServices', () => ({ nodeServices: { tag: 'services' } }));
vi.mock('@/nodes', () => ({ runChatGpt, chatGptCredentialsFromEnv: () => ({ apiKey: 'sk' }) }));
vi.mock('@/services/aiCredentials.service', () => ({
  resolveChatGptConfig: async () => ({ credentials: { apiKey: 'sk' } }),
}));
vi.mock('@/services/automation.service', () => ({
  automationService: { draftNewsPosts: vi.fn(async () => []) },
}));
vi.mock('@/utils/assets-client', () => ({ getAssetsClient: () => ({ uploadBuffer }) }));
vi.mock('axios', () => ({ default: { get: axiosGet } }));

const { NewsEnhancementService } = await import('@/services/newsEnhancement.service');
const { NewsIngestionService } = await import('@/services/newsIngestion.service');

const article = {
  id: 9n,
  guid: 'g-9',
  source_url: 'https://example.africa/story',
  source_headline: 'Kenya opens M-Pesa API',
  source_summary: 'Regulators agree.',
  pub_date: null,
  category: 'tech',
  creator: 'Disrupt Africa',
} as never;

const PNG_BASE64 = Buffer.from('png').toString('base64');

const FEED =
  '<rss><channel><item><title>T</title><guid>g</guid>' +
  '<link>https://a.africa/t</link></item></channel></rss>';

const reply = {
  score: 0.9,
  should_publish: true,
  title: 'Kenya opens its M-Pesa API',
  slug: 'kenya-mpesa-api',
  excerpt: '',
  content: `<p>${'word '.repeat(200)}</p>`,
  image_prompt: 'Nairobi at dawn',
};

describe('default OpenAI and assets adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { SOCIAL_MEDIA_FOLDER_ID?: string }).SOCIAL_MEDIA_FOLDER_ID = 'folder-1';
    runChatGpt
      .mockResolvedValueOnce([{ json: { parsed: reply } }])
      .mockResolvedValueOnce([{ json: { images: [{ b64Json: PNG_BASE64 }] } }]);
    uploadBuffer.mockResolvedValue({ url: 'https://cdn.afrisinc.com/kenya.png' });
  });

  it('asks for JSON, draws the cover with no response format and stores it', async () => {
    const outcome = await new NewsEnhancementService().enhance(article);

    expect(outcome).toBe('published');
    const text = runChatGpt.mock.calls[0][0];
    expect(text.parameters).toMatchObject({
      resource: 'text',
      operation: 'message',
      model: 'gpt-4o',
      jsonOutput: true,
    });
    expect(text.usageContext).toEqual({ requestId: 'news-enhance:9' });
    expect(runChatGpt.mock.calls[1][0].parameters).toMatchObject({
      resource: 'image',
      operation: 'generate',
      model: 'gpt-image-1',
      prompt: expect.stringContaining('Nairobi at dawn'),
      options: { size: '1536x1024', quality: 'medium' },
    });
    expect(runChatGpt.mock.calls[1][0].parameters.options).not.toHaveProperty('responseFormat');
    expect(runChatGpt.mock.calls[1][0].parameters.prompt).toContain('no text, lettering');
    expect(uploadBuffer).toHaveBeenCalledWith(Buffer.from('png'), 'kenya-mpesa-api.png', {
      folderId: 'folder-1',
      tags: ['news', 'article-cover', 'ai-generated'],
    });
    expect(repository.publishEnhanced.mock.calls[0][1].excerpt).toBeNull();
  });

  it('downloads the cover when the image model answers with a URL, not the image', async () => {
    runChatGpt
      .mockReset()
      .mockResolvedValueOnce([{ json: { parsed: reply } }])
      .mockResolvedValueOnce([
        { json: { images: [{ url: 'https://images.openai.test/cover.png' }] } },
      ]);
    axiosGet.mockResolvedValueOnce({ data: Buffer.from('png') });

    const outcome = await new NewsEnhancementService().enhance(article);

    expect(outcome).toBe('published');
    expect(axiosGet).toHaveBeenCalledWith(
      'https://images.openai.test/cover.png',
      expect.objectContaining({ responseType: 'arraybuffer' })
    );
    expect(uploadBuffer.mock.calls[0][0]).toEqual(Buffer.from('png'));
  });

  it('fails the article when the image model returns neither an image nor a URL', async () => {
    runChatGpt
      .mockReset()
      .mockResolvedValueOnce([{ json: { parsed: reply } }])
      .mockResolvedValueOnce([{ json: { images: [{}] } }]);

    const outcome = await new NewsEnhancementService().enhance(article);

    expect(outcome).toBe('failed');
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('uploads without a folder when none was set up at boot', async () => {
    delete (globalThis as { SOCIAL_MEDIA_FOLDER_ID?: string }).SOCIAL_MEDIA_FOLDER_ID;

    await new NewsEnhancementService().enhance(article);

    expect(uploadBuffer.mock.calls[0][2].folderId).toBeUndefined();
  });

  it('fails the article when the image model returns nothing', async () => {
    runChatGpt.mockReset();
    runChatGpt
      .mockResolvedValueOnce([{ json: { parsed: reply } }])
      .mockResolvedValueOnce([{ json: { images: [] } }]);

    await new NewsEnhancementService().enhance(article);

    expect(repository.update).toHaveBeenCalledWith(9n, {
      status: 'failed',
      processing_error: 'the image model returned no cover',
    });
  });

  it('fails the article when the assets service returns no URL', async () => {
    uploadBuffer.mockResolvedValue({});

    await new NewsEnhancementService().enhance(article);

    expect(repository.update.mock.calls[0][1].processing_error).toBe(
      'the assets service returned no URL for the cover'
    );
  });

  it('fetches feeds as text with a timeout, a size cap and a bot user agent', async () => {
    axiosGet.mockResolvedValue({
      data: FEED,
    });

    const result = await new NewsIngestionService().run();

    expect(result.created).toBe(1);
    const [url, config] = axiosGet.mock.calls[0];
    expect(url).toBe('https://only.africa/feed');
    expect(config).toMatchObject({ timeout: 10000, responseType: 'text' });
    expect(config.maxContentLength).toBe(5 * 1024 * 1024);
    expect(config.headers['User-Agent']).toContain('AfrisincMediaBot');
  });
});
