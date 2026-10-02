import { describe, expect, it } from 'vitest';
import { buildEditorialCopy, buildEditorialSpec } from '@/helpers/editorialPost.helper';
import type { EditorialBrief } from '@/types/post.types';

const BRIEF: EditorialBrief = {
  layout: 'news',
  headline: 'Kenya opens M-Pesa API to regional banks',
  standfirst: 'Regulators agreed a shared licensing regime.',
  eyebrow: 'FINTECH',
  dateline: 'Source: TechCabal · 2 Oct 2026',
  caption: 'The caption.',
  hashtags: ['#AfricaBusiness', '#Fintech'],
};

describe('buildEditorialCopy', () => {
  it('is one slide with the headline lines, the tag and the standfirst', () => {
    const copy = buildEditorialCopy(BRIEF, ['Kenya opens M-Pesa API', 'to regional banks']);

    expect(copy).toEqual({
      concept: BRIEF.headline,
      caption: 'The caption.',
      hashtags: ['#AfricaBusiness', '#Fintech'],
      claims: [],
      slides: [
        {
          role: 'hook',
          eyebrow: 'FINTECH',
          eyebrowKind: 'claim',
          headline: ['Kenya opens M-Pesa API', 'to regional banks'],
          subs: ['Regulators agreed a shared licensing regime.'],
        },
      ],
    });
  });

  it('has no standfirst slot when the brief has none', () => {
    const copy = buildEditorialCopy({ ...BRIEF, standfirst: '' }, ['Headline']);

    expect(copy.slides[0]).not.toHaveProperty('subs');
  });
});

describe('buildEditorialSpec', () => {
  const copy = buildEditorialCopy(BRIEF, ['Kenya opens M-Pesa API', 'to regional banks']);

  it('is a single frame on the given photograph with the brief dateline and layout', () => {
    expect(
      buildEditorialSpec('kenya-api', BRIEF, copy, 'https://cdn.afrisinc.com/cover.png')
    ).toEqual({
      slug: 'kenya-api',
      format: 'single',
      slides: [
        {
          surface: 'photo',
          photo: 'https://cdn.afrisinc.com/cover.png',
          layout: 'news',
          eyebrow: { text: 'FINTECH', kind: 'claim' },
          headline: ['Kenya opens M-Pesa API', 'to regional banks'],
          subs: ['Regulators agreed a shared licensing regime.'],
          dateline: 'Source: TechCabal · 2 Oct 2026',
        },
      ],
    });
  });

  it('carries the story layout when the brief is for a story', () => {
    const spec = buildEditorialSpec('s', { ...BRIEF, layout: 'story' }, copy, 'p.png');

    expect(spec.slides[0].layout).toBe('story');
  });

  it('has no call to action, rows or accents, which an editorial frame may not carry', () => {
    const [slide] = buildEditorialSpec('s', BRIEF, copy, 'p.png').slides;

    expect(slide).not.toHaveProperty('cta');
    expect(slide).not.toHaveProperty('rows');
    expect(slide).not.toHaveProperty('coral_rule');
    expect(slide).not.toHaveProperty('strike_line');
  });
});
