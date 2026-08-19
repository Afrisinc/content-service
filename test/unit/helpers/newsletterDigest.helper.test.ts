import {
  articleUrl,
  buildCampaignPayload,
  buildDigestContext,
  buildDigestPrompt,
  digestSubject,
  extractHtml,
  type DigestArticle,
} from '@/helpers/newsletterDigest.helper';
import { describe, expect, it } from 'vitest';

const article = (index: number, overrides: Partial<DigestArticle> = {}): DigestArticle => ({
  id: `id-${index}`,
  title: `Article ${index}`,
  slug: `article-${index}`,
  excerpt: `Excerpt ${index}`,
  cover_image: `https://cdn/img-${index}.jpg`,
  ...overrides,
});

const now = new Date('2026-08-19T06:30:00.000Z');
const options = { siteUrl: 'https://afrisinc.com', limit: 5, now };

describe('buildDigestContext', () => {
  it('keeps only the requested number of articles', () => {
    const context = buildDigestContext([article(1), article(2), article(3)], {
      ...options,
      limit: 2,
    });

    expect(context.articles).toHaveLength(2);
    expect(context.articleIds).toEqual(['id-1', 'id-2']);
  });

  it('renders one numbered block per article with its link and image', () => {
    const context = buildDigestContext([article(1)], options);

    expect(context.articlesSummary).toBe(
      [
        '1. Title: Article 1',
        '   Excerpt: Excerpt 1',
        '   URL: https://afrisinc.com/media/articles/article-1',
        '   Image: https://cdn/img-1.jpg',
      ].join('\n')
    );
  });

  it('leaves missing fields blank rather than printing null', () => {
    const context = buildDigestContext(
      [article(1, { title: null, excerpt: null, cover_image: null })],
      options
    );

    expect(context.articlesSummary).toContain('Title: \n');
    expect(context.articlesSummary).not.toContain('null');
  });

  it('dates the digest in both human and ISO form', () => {
    const context = buildDigestContext([article(1)], options);

    expect(context.today).toBe('Wednesday, August 19, 2026');
    expect(context.isoDate).toBe('2026-08-19');
  });
});

describe('articleUrl', () => {
  it('prefers the slug and falls back to the id', () => {
    expect(articleUrl(article(1), 'https://afrisinc.com')).toBe(
      'https://afrisinc.com/media/articles/article-1'
    );
    expect(articleUrl(article(2, { slug: null }), 'https://afrisinc.com/')).toBe(
      'https://afrisinc.com/media/articles/id-2'
    );
  });
});

describe('buildDigestPrompt', () => {
  it('carries the layout brief and the articles into the prompt', () => {
    const { systemPrompt, prompt } = buildDigestPrompt(buildDigestContext([article(1)], options));

    expect(systemPrompt).toContain('Return ONLY the complete HTML document');
    expect(prompt).toContain('Wednesday, August 19, 2026');
    expect(prompt).toContain('#1a1a2e');
    expect(prompt).toContain('#f97316');
    expect(prompt).toContain('[UNSUBSCRIBE_LINK]');
    expect(prompt).toContain('https://afrisinc.com/media/articles/article-1');
  });
});

describe('extractHtml', () => {
  it('returns plain HTML untouched', () => {
    expect(extractHtml('<html><body>hi</body></html>')).toBe('<html><body>hi</body></html>');
  });

  it('unwraps HTML the model fenced in markdown', () => {
    expect(extractHtml('```html\n<html>hi</html>\n```')).toBe('<html>hi</html>');
    expect(extractHtml('```\n<html>hi</html>\n```')).toBe('<html>hi</html>');
  });

  it('trims surrounding whitespace', () => {
    expect(extractHtml('\n\n  <html/>  \n')).toBe('<html/>');
  });
});

describe('buildCampaignPayload', () => {
  it('builds the Notify request the campaigns endpoint expects', () => {
    const payload = buildCampaignPayload({
      subject: digestSubject('2026-08-19'),
      html: '<html/>',
      recipientTags: ['newsletter'],
      scheduledAt: new Date('2026-08-19T07:30:00.000Z'),
    });

    expect(payload).toEqual({
      name: 'Afrisinc Media Daily — 2026-08-19',
      channel: 'EMAIL',
      recipientType: 'tags',
      recipientTags: ['newsletter'],
      status: 'scheduled',
      scheduledAt: '2026-08-19T07:30:00.000Z',
      subject: 'Afrisinc Media Daily — 2026-08-19',
      html_content: '<html/>',
      type: 'newsletter_digest',
    });
  });
});
