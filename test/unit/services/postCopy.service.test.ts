import { findVoiceViolations } from '@/services/postCopy.service';
import { PostCopy } from '@/types/post.types';
import { describe, expect, it } from 'vitest';

function copy(overrides: Partial<PostCopy> = {}): PostCopy {
  return {
    concept: 'The design performs the sentence.',
    caption: 'A dead laptop in a lab is a class that cannot run. We fix it.',
    hashtags: ['#AFRISINC'],
    claims: [],
    slides: [
      {
        role: 'hook',
        eyebrow: 'SOFTWARE DEVELOPMENT',
        eyebrowKind: 'label',
        headline: ['Your process.', 'Not a template.'],
      },
      {
        role: 'proof',
        eyebrow: 'SHIPPED',
        eyebrowKind: 'claim',
        headline: ['Web apps.'],
      },
      {
        role: 'method',
        eyebrow: 'HOW WE BUILD',
        eyebrowKind: 'label',
        headline: ['Ship in weeks,'],
        rows: [
          { title: 'ONE', body: 'first' },
          { title: 'TWO', body: 'second' },
          { title: 'THREE', body: 'third' },
        ],
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

describe('findVoiceViolations', () => {
  it('passes clean copy', () => {
    expect(findVoiceViolations(copy())).toEqual([]);
  });

  it('catches a banned word in a headline', () => {
    const subject = copy();
    subject.slides[0].headline = ['Seamless delivery.'];
    expect(findVoiceViolations(subject)).toContain('banned word "seamless"');
  });

  it('catches a banned word in a row body', () => {
    const subject = copy();
    subject.slides[2].rows![0].body = 'We leverage your data.';
    expect(findVoiceViolations(subject)).toContain('banned word "leverage"');
  });

  it('catches fake antithesis', () => {
    const subject = copy({ caption: "It's not just repair — it's peace of mind." });
    expect(findVoiceViolations(subject).some(v => v.startsWith('banned construction'))).toBe(true);
  });

  it('catches a scene-setting opener', () => {
    const subject = copy({ caption: "In today's fast-paced world every device matters." });
    expect(findVoiceViolations(subject).some(v => v.startsWith('banned construction'))).toBe(true);
  });

  it('allows one em dash but not two', () => {
    expect(findVoiceViolations(copy({ caption: 'We fix it — properly.' }))).toEqual([]);
    const twice = copy({ caption: 'We fix it — properly — always.' });
    expect(findVoiceViolations(twice)).toContain('2 em dashes in the caption, limit 1');
  });

  it('requires exactly three rows on the method slide', () => {
    const subject = copy();
    subject.slides[2].rows = [{ title: 'ONE', body: 'first' }];
    expect(findVoiceViolations(subject)).toContain('the method slide carries 1 rows, needs 3');
  });

  it('requires the hook first and the cta last', () => {
    const subject = copy();
    subject.slides = [subject.slides[1], subject.slides[0], subject.slides[2], subject.slides[3]];
    const problems = findVoiceViolations(subject);
    expect(problems).toContain('the first slide must be the hook');
  });

  it('still requires a story to end on the cta', () => {
    const subject = copy();
    subject.slides = subject.slides.slice(0, 2);
    expect(findVoiceViolations(subject, 'story')).toContain('the last slide must be the cta');
  });

  it('lets a story open on any frame that stands alone', () => {
    const subject = copy();
    subject.slides = [subject.slides[1], subject.slides[3]];
    expect(findVoiceViolations(subject, 'story')).not.toContain(
      'the first slide must be the hook'
    );
  });

  it('flags a carousel that does not end on the cta', () => {
    const subject = copy();
    subject.slides = subject.slides.slice(0, 3);
    expect(findVoiceViolations(subject)).toContain('the last slide must be the cta');
  });
});
