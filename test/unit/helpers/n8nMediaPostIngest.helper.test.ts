import { describe, expect, it } from 'vitest';
import { toMediaPostPayload } from '@/helpers/n8nMediaPostIngest.helper';
import { MediaPostStatus } from '@/types/mediaPost.types';

const base = { title: 'Lagos fintech rebuilds', slug: 'lagos-fintech', content: 'x'.repeat(120) };
const now = new Date('2026-09-23T10:00:00.000Z');

describe('toMediaPostPayload', () => {
  it('accepts the field names the current WF2 sends', () => {
    const payload = toMediaPostPayload(
      {
        ...base,
        n8n_article_id: '42',
        featured_image: 'https://cdn.afrisinc.com/cover.png',
        status: 'published',
      },
      now
    );

    expect(payload).toMatchObject({
      n8nArticleId: 42n,
      cover_image: 'https://cdn.afrisinc.com/cover.png',
      status: MediaPostStatus.PUBLISHED,
      published_at: now,
      ai_generated: true,
    });
    expect(payload).not.toHaveProperty('n8n_article_id');
    expect(payload).not.toHaveProperty('featured_image');
  });

  it('accepts the field names the older WF2 sends', () => {
    const payload = toMediaPostPayload({
      ...base,
      n8nArticleId: 42,
      cover_image: 'https://cdn.afrisinc.com/a.png',
    });

    expect(payload).toMatchObject({
      n8nArticleId: 42n,
      cover_image: 'https://cdn.afrisinc.com/a.png',
      status: undefined,
      published_at: undefined,
    });
  });

  it('prefers an explicit cover_image over featured_image', () => {
    const payload = toMediaPostPayload({
      ...base,
      cover_image: 'https://cdn.afrisinc.com/explicit.png',
      featured_image: 'https://cdn.afrisinc.com/other.png',
    });

    expect(payload.cover_image).toBe('https://cdn.afrisinc.com/explicit.png');
  });

  it('keeps a published_at the caller already set', () => {
    const publishedAt = new Date('2026-01-01T00:00:00.000Z');
    const payload = toMediaPostPayload(
      { ...base, status: 'PUBLISHED', published_at: publishedAt },
      now
    );

    expect(payload.published_at).toBe(publishedAt);
  });

  it('drops a status the column would reject, so it falls back to the DRAFT default', () => {
    expect(toMediaPostPayload({ ...base, status: 'live' }).status).toBeUndefined();
  });

  it('leaves the article link empty when neither id spelling is usable', () => {
    expect(toMediaPostPayload({ ...base, n8n_article_id: '  ' }).n8nArticleId).toBeUndefined();
    expect(toMediaPostPayload(base).n8nArticleId).toBeUndefined();
  });

  it('treats an empty featured image as no cover', () => {
    expect(toMediaPostPayload({ ...base, featured_image: '' }).cover_image).toBeUndefined();
  });
});
