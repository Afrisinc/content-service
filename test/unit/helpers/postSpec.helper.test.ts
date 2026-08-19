import {
  buildCaptionFooter,
  buildPostSlug,
  buildPostSpecFromCopy,
  buildFullCaption,
} from '@/helpers/postSpec.helper';
import { PostCopy } from '@/types/post.types';
import { describe, expect, it } from 'vitest';

function copyFixture(overrides: Partial<PostCopy> = {}): PostCopy {
  return {
    concept: 'The design performs the sentence.',
    caption: 'Your process. Not a template.',
    hashtags: ['#AFRISINC', '#SoftwareDevelopment'],
    claims: ['Free scoping session'],
    slides: [
      {
        role: 'hook',
        eyebrow: 'SOFTWARE DEVELOPMENT',
        eyebrowKind: 'label',
        headline: ['Your process.', 'Not a template.'],
        strikeWord: 'template',
      },
      {
        role: 'proof',
        eyebrow: 'SHIPPED, NOT SLIDEWARE.',
        eyebrowKind: 'claim',
        headline: ['Web apps.', 'Mobile. APIs.'],
        subs: ['Built to fit how you already work.'],
        photoSubjects: ['developer'],
      },
      {
        role: 'method',
        eyebrow: 'HOW WE BUILD',
        eyebrowKind: 'label',
        headline: ['Ship in weeks,', 'not quarters.'],
        rows: [
          { title: 'DISCOVERY FIRST', body: 'We map your workflow first.' },
          { title: 'EVERY SPRINT', body: 'You see it running.' },
          { title: 'YOURS TO KEEP', body: 'Your repo, your servers.' },
        ],
        closing: 'Handover and training included.',
      },
      {
        role: 'cta',
        eyebrow: 'FREE SCOPING SESSION',
        eyebrowKind: 'claim',
        headline: ['Tell us the workflow.'],
        cta: 'afrisinc.com',
      },
    ],
    ...overrides,
  };
}

describe('buildPostSlug', () => {
  it('produces a url-safe slug with a stamp', () => {
    const slug = buildPostSlug('Software Development!', new Date(1_700_000_000_000));
    expect(slug).toMatch(/^software-development-[a-z0-9]{6}$/);
  });

  it('falls back when the topic has no usable characters', () => {
    expect(buildPostSlug('!!!')).toMatch(/^carousel-/);
  });

  it('keeps the slug inside the length the render service accepts', () => {
    const slug = buildPostSlug('a'.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(48);
  });
});

describe('buildPostSpecFromCopy', () => {
  it('assigns the proven surface arc', () => {
    const spec = buildPostSpecFromCopy('slug', copyFixture(), { 1: 'bench.png' });
    expect(spec.slides.map(slide => slide.surface)).toEqual(['azure', 'photo', 'white', 'azure']);
  });

  it('attaches the photo only to photo surfaces', () => {
    const spec = buildPostSpecFromCopy('slug', copyFixture(), { 1: 'bench.png' });
    expect(spec.slides[1].photo).toBe('bench.png');
    expect(spec.slides[0].photo).toBeUndefined();
    expect(spec.slides[2].photo).toBeUndefined();
  });

  it('resolves the strike word to the line that contains it', () => {
    const spec = buildPostSpecFromCopy('slug', copyFixture(), { 1: 'bench.png' });
    expect(spec.slides[0].strike_line).toBe(1);
  });

  it('drops a strike when the word is not in the headline', () => {
    const copy = copyFixture();
    copy.slides[0].strikeWord = 'absent';
    const spec = buildPostSpecFromCopy('slug', copy, { 1: 'bench.png' });
    expect(spec.slides[0].strike_line).toBeUndefined();
  });

  it('never spends the coral budget twice on one slide', () => {
    const copy = copyFixture();
    copy.slides[1].strikeWord = 'apps';
    const spec = buildPostSpecFromCopy('slug', copy, { 1: 'bench.png' });
    expect(spec.slides[1].strike_line).toBeUndefined();
  });

  it('keeps rows on the white slide only', () => {
    const copy = copyFixture();
    copy.slides[0].rows = [{ title: 'X', body: 'y' }];
    const spec = buildPostSpecFromCopy('slug', copy, { 1: 'bench.png' });
    expect(spec.slides[0].rows).toBeUndefined();
    expect(spec.slides[2].rows).toHaveLength(3);
  });

  it('caps the headline at four lines', () => {
    const copy = copyFixture();
    copy.slides[0].headline = ['one', 'two', 'three', 'four', 'five'];
    const spec = buildPostSpecFromCopy('slug', copy, { 1: 'bench.png' });
    expect(spec.slides[0].headline).toHaveLength(4);
  });

  it('caps sub lines at two', () => {
    const copy = copyFixture();
    copy.slides[1].subs = ['one', 'two', 'three'];
    const spec = buildPostSpecFromCopy('slug', copy, { 1: 'bench.png' });
    expect(spec.slides[1].subs).toHaveLength(2);
  });

  it('gives the cta slide a destination pill', () => {
    const spec = buildPostSpecFromCopy('slug', copyFixture(), { 1: 'bench.png' });
    expect(spec.slides[3].cta).toEqual({ text: 'afrisinc.com', arrow: true });
  });
});

describe('format', () => {
  it('defaults to a square post', () => {
    const spec = buildPostSpecFromCopy('slug', copyFixture(), { 1: 'bench.png' });
    expect(spec.format).toBe('post');
  });

  it('carries the story format through to the render contract', () => {
    const spec = buildPostSpecFromCopy('slug', copyFixture(), { 1: 'bench.png' }, 'story');
    expect(spec.format).toBe('story');
  });

  it('deepens the scrim on story photography, where the crop keeps less of the frame', () => {
    const story = buildPostSpecFromCopy('slug', copyFixture(), { 1: 'bench.png' }, 'story');
    const post = buildPostSpecFromCopy('slug', copyFixture(), { 1: 'bench.png' }, 'post');
    expect(story.slides[1].dense_scrim).toBe(true);
    expect(post.slides[1].dense_scrim).toBeUndefined();
  });

  it('never puts a scrim flag on a non-photo surface', () => {
    const story = buildPostSpecFromCopy('slug', copyFixture(), { 1: 'bench.png' }, 'story');
    expect(story.slides[0].dense_scrim).toBeUndefined();
    expect(story.slides[2].dense_scrim).toBeUndefined();
  });
});

describe('captions', () => {
  it('carries every contact route', () => {
    const footer = buildCaptionFooter();
    expect(footer).toContain('+250 786 077 754');
    expect(footer).toContain('+250 793 145 487');
    expect(footer).toContain('support@afrisinc.com');
    expect(footer).toContain('afrisinc.com');
  });

  it('appends the footer and hashtags to the agent caption', () => {
    const caption = buildFullCaption(copyFixture());
    expect(caption.startsWith('Your process.')).toBe(true);
    expect(caption).toContain('#AFRISINC');
    expect(caption).toContain('support@afrisinc.com');
  });
});
