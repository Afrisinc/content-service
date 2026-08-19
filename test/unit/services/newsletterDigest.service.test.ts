import { newsletterDigestService } from '@/services/newsletterDigest.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTopArticles: vi.fn(),
  createCampaign: vi.fn(),
  runChatGpt: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  NEWSLETTER_ARTICLE_LIMIT: 5,
  NEWSLETTER_MIN_ARTICLES: 3,
  NEWSLETTER_DIGEST_MODEL: 'gpt-4o',
  NEWSLETTER_RECIPIENT_TAGS: ['newsletter'],
  NEWSLETTER_SEND_DELAY_MINUTES: 60,
  NEWSLETTER_SITE_URL: 'https://afrisinc.com',
}));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('@/repositories/mediaPost.repository', () => ({
  mediaPostRepository: { getTopArticles: mocks.getTopArticles },
}));
vi.mock('@/adapters/notify/notifyClient', () => ({
  notifyClient: { createCampaign: mocks.createCampaign },
}));
vi.mock('@/adapters/nodes/nodeServices', () => ({ nodeServices: {} }));
vi.mock('@/nodes', () => ({
  runChatGpt: mocks.runChatGpt,
  chatGptCredentialsFromEnv: () => ({ apiKey: 'sk-test' }),
}));

const articles = [1, 2, 3, 4].map(index => ({
  id: `id-${index}`,
  title: `Article ${index}`,
  slug: `article-${index}`,
  excerpt: `Excerpt ${index}`,
  cover_image: null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  envMock.NEWSLETTER_ARTICLE_LIMIT = 5;
  envMock.NEWSLETTER_MIN_ARTICLES = 3;
  mocks.getTopArticles.mockResolvedValue(articles);
  mocks.runChatGpt.mockResolvedValue([{ json: { content: '<html>digest</html>' } }]);
  mocks.createCampaign.mockResolvedValue({ id: 'notify-1' });
});

describe('newsletterDigestService.run', () => {
  it('generates the email and hands it to Notify', async () => {
    const result = await newsletterDigestService.run();

    expect(result).toMatchObject({
      status: 'sent',
      notifyCampaignId: 'notify-1',
      subject: expect.stringContaining('Afrisinc Media Daily'),
      articleIds: ['id-1', 'id-2', 'id-3', 'id-4'],
    });

    expect(mocks.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'EMAIL',
        recipientType: 'tags',
        recipientTags: ['newsletter'],
        status: 'scheduled',
        html_content: '<html>digest</html>',
        type: 'newsletter_digest',
      })
    );
  });

  it('asks the model for the configured model with a per-day idempotency key', async () => {
    await newsletterDigestService.run();

    const call = mocks.runChatGpt.mock.calls[0][0];
    expect(call.parameters).toMatchObject({ model: 'gpt-4o', resource: 'text' });
    expect(call.idempotency.key).toMatch(/^newsletter-digest:\d{4}-\d{2}-\d{2}$/);
  });

  it('skips without paying for a generation when there is too little to write about', async () => {
    mocks.getTopArticles.mockResolvedValue([articles[0], articles[1]]);

    const result = await newsletterDigestService.run();

    expect(result).toEqual({ status: 'skipped', reason: 'not-enough-articles' });
    expect(mocks.runChatGpt).not.toHaveBeenCalled();
  });

  it('never fetches fewer articles than the minimum it requires', async () => {
    envMock.NEWSLETTER_ARTICLE_LIMIT = 2;
    envMock.NEWSLETTER_MIN_ARTICLES = 3;

    await newsletterDigestService.run();

    expect(mocks.getTopArticles).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
  });

  it('returns the email for review and contacts nobody on a dry run', async () => {
    const result = await newsletterDigestService.run({ dryRun: true });

    expect(result).toMatchObject({ status: 'dry-run', html: '<html>digest</html>' });
    expect(mocks.createCampaign).not.toHaveBeenCalled();
  });

  it('surfaces a Notify failure instead of reporting a send', async () => {
    mocks.createCampaign.mockRejectedValue(new Error('Notify campaign creation failed'));

    await expect(newsletterDigestService.run()).rejects.toThrow('Notify campaign creation failed');
  });

  it('refuses to send an empty email', async () => {
    mocks.runChatGpt.mockResolvedValue([{ json: { content: '   ' } }]);

    await expect(newsletterDigestService.run()).rejects.toThrow('returned no HTML');
    expect(mocks.createCampaign).not.toHaveBeenCalled();
  });

  it('unwraps HTML the model fenced in markdown before sending it', async () => {
    mocks.runChatGpt.mockResolvedValue([
      { json: { content: '```html\n<html>fenced</html>\n```' } },
    ]);

    await newsletterDigestService.run();

    expect(mocks.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ html_content: '<html>fenced</html>' })
    );
  });
});
