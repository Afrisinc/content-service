import { describe, expect, it } from 'vitest';
import {
  newsCaption,
  newsDateline,
  newsEditorial,
  newsEyebrow,
  newsHashtags,
  standfirstFrom,
} from '@/helpers/newsPost.helper';
import type { NewsBrief } from '@/types/post.types';

const NEWS: NewsBrief = {
  headline: 'Kenya opens M-Pesa API to regional banks',
  summary:
    'Regulators agreed a shared licensing regime that lets licensed banks build on the rails.',
  category: 'fintech',
  source: 'TechCabal',
  publishedAt: '2026-10-02T09:30:00.000Z',
  articleUrl: 'https://afrisinc.com/media/articles/mpesa-open-api',
  tags: ['mobile money', 'banking', 'kenya'],
};

describe('newsEyebrow', () => {
  it('shows just the category, in capitals, because the frame carries its own news badge', () => {
    expect(newsEyebrow('fintech')).toBe('FINTECH');
  });

  it('drops punctuation and keeps a multi-word category readable', () => {
    expect(newsEyebrow('AI & machine-learning')).toBe('AI MACHINE LEARNING');
  });

  it('never exceeds the length the renderer accepts', () => {
    expect(newsEyebrow('x'.repeat(100)).length).toBeLessThanOrEqual(48);
  });

  it('says latest when the category has nothing usable in it', () => {
    expect(newsEyebrow('!!!')).toBe('LATEST');
  });
});

describe('standfirstFrom', () => {
  it('keeps a short summary as it is', () => {
    expect(standfirstFrom('  Short   and sweet. ')).toBe('Short and sweet.');
  });

  it('ends on a complete sentence when one fits', () => {
    const summary = `${'A'.repeat(100)}. ${'B'.repeat(100)}.`;

    expect(standfirstFrom(summary)).toBe(`${'A'.repeat(100)}.`);
  });

  it('cuts at a word and marks the cut when no sentence fits', () => {
    const summary = 'word '.repeat(60).trim();

    const result = standfirstFrom(summary);

    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(161);
    expect(result).not.toMatch(/\s…$/);
  });

  it('is empty for an empty summary', () => {
    expect(standfirstFrom('   ')).toBe('');
  });
});

describe('newsDateline', () => {
  it('credits the source and states the date', () => {
    expect(newsDateline('TechCabal', '2026-10-02T09:30:00.000Z')).toBe(
      'Source: TechCabal · 2 Oct 2026'
    );
  });

  it('is just the date when the source is unknown', () => {
    expect(newsDateline(null, '2026-10-02T09:30:00.000Z')).toBe('2 Oct 2026');
  });

  it('uses the UTC date so the same story never reads two different days', () => {
    expect(newsDateline(null, '2026-10-02T23:59:00.000Z')).toBe('2 Oct 2026');
  });
});

describe('newsHashtags', () => {
  it('starts with the house tag, then the category, then the story tags', () => {
    expect(newsHashtags('fintech', ['mobile money', 'banking'])).toEqual([
      '#AfricaBusiness',
      '#Fintech',
      '#MobileMoney',
      '#Banking',
    ]);
  });

  it('keeps no more than four and never repeats one', () => {
    const tags = newsHashtags('business', ['business', 'africa', 'markets', 'policy', 'more']);

    expect(tags).toHaveLength(4);
    expect(new Set(tags).size).toBe(4);
  });

  it('ignores tags with nothing usable in them', () => {
    expect(newsHashtags('tech', ['!!!', ''])).toEqual(['#AfricaBusiness', '#Tech']);
  });
});

describe('newsCaption', () => {
  it('reads like a news item: headline, summary, link, source, then tags', () => {
    expect(newsCaption(NEWS)).toBe(
      [
        'Kenya opens M-Pesa API to regional banks',
        'Regulators agreed a shared licensing regime that lets licensed banks build on the rails.',
        [
          'Read the full story: https://afrisinc.com/media/articles/mpesa-open-api',
          'Source: TechCabal',
        ].join('\n'),
        '#AfricaBusiness #Fintech #MobileMoney #Banking',
      ].join('\n\n')
    );
  });

  it('carries no phone numbers, calls to action or contact routes', () => {
    const caption = newsCaption(NEWS);

    expect(caption).not.toMatch(/\+\d{3}/);
    expect(caption).not.toMatch(/call|whatsapp|email/i);
  });

  it('leaves out the source line when the source is unknown', () => {
    expect(newsCaption({ ...NEWS, source: null })).not.toContain('Source:');
  });
});

describe('newsEditorial', () => {
  it('is a news frame with a category tag, standfirst, dateline and caption', () => {
    expect(newsEditorial(NEWS)).toEqual({
      layout: 'news',
      headline: 'Kenya opens M-Pesa API to regional banks',
      standfirst: NEWS.summary,
      eyebrow: 'FINTECH',
      dateline: 'Source: TechCabal · 2 Oct 2026',
      caption: newsCaption(NEWS),
      hashtags: ['#AfricaBusiness', '#Fintech', '#MobileMoney', '#Banking'],
    });
  });

  it('prefers the written standfirst over the summary', () => {
    expect(newsEditorial({ ...NEWS, standfirst: 'A complete one-line deck.' }).standfirst).toBe(
      'A complete one-line deck.'
    );
  });

  it('falls back to the summary when the standfirst is empty or missing', () => {
    expect(newsEditorial({ ...NEWS, standfirst: '' }).standfirst).toBe(NEWS.summary);
    expect(newsEditorial({ ...NEWS, standfirst: null }).standfirst).toBe(NEWS.summary);
  });

  it('has an empty standfirst when there is nothing to build one from', () => {
    expect(newsEditorial({ ...NEWS, summary: '', standfirst: null }).standfirst).toBe('');
  });
});
