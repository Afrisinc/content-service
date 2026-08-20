import { env } from '@/config/env';
import {
  CopyUnusableError,
  PostCopyService,
  findVoiceViolations,
} from '@/services/postCopy.service';
import { PostCopy } from '@/types/post.types';
import { describe, expect, it, vi } from 'vitest';

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
    expect(findVoiceViolations(subject, 'story')).not.toContain('the first slide must be the hook');
  });

  it('flags a carousel that does not end on the cta', () => {
    const subject = copy();
    subject.slides = subject.slides.slice(0, 3);
    expect(findVoiceViolations(subject)).toContain('the last slide must be the cta');
  });
});

describe('bounding the copy stage', () => {
  it('stops attempting once the time budget is spent', async () => {
    vi.useFakeTimers();
    try {
      const service = new PostCopyService();
      // Every call burns most of the budget, so the second attempt must not start.
      const spy = vi.spyOn(service as never, 'callModel' as never).mockImplementation(async () => {
        vi.advanceTimersByTime(env.POST_AGENT_BUDGET_MS);
        return '{"nonsense": true}';
      });

      await expect(service.generate({ topic: 'Software development' })).rejects.toThrow(
        /ran out of time/
      );
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes the caller’s abort signal down to the model call', async () => {
    const service = new PostCopyService();
    const controller = new AbortController();
    const spy = vi
      .spyOn(service as never, 'callModel' as never)
      .mockResolvedValue('{"nonsense": true}' as never);

    await expect(
      service.generate({ topic: 'Software development' }, controller.signal)
    ).rejects.toThrow();

    expect(spy).toHaveBeenCalledWith(expect.anything(), undefined, controller.signal);
  });
});

describe('an unusable response', () => {
  const VALID = JSON.stringify({
    concept: 'The design performs the sentence.',
    caption: 'A dead laptop in a lab is a class that cannot run. We fix it on the bench.',
    hashtags: [
      '#AFRISINC',
      '#repair',
      '#laptops',
      '#schools',
      '#uptime',
      '#hardware',
      '#service',
      '#bench',
    ],
    claims: [],
    slides: [
      { role: 'hook', eyebrow: 'ONE', eyebrowKind: 'label', headline: ['A dead laptop'] },
      { role: 'proof', eyebrow: 'TWO', eyebrowKind: 'claim', headline: ['We fix it'] },
      {
        role: 'method',
        eyebrow: 'THREE',
        eyebrowKind: 'label',
        headline: ['On the bench'],
        rows: [
          { title: 'DIAGNOSE', body: 'We trace the fault to the component' },
          { title: 'REPAIR', body: 'We replace what failed, not the board' },
          { title: 'RETURN', body: 'You get the machine back working' },
        ],
      },
      { role: 'cta', eyebrow: 'FOUR', eyebrowKind: 'claim', headline: ['Talk to us'] },
    ],
  });

  function serviceReturning(...responses: string[]) {
    const service = new PostCopyService();
    const spy = vi.spyOn(service as never, 'callModel' as never);
    for (const response of responses) {
      spy.mockResolvedValueOnce(response as never);
    }
    // Never fall through to the real client: an over-run would reach the network.
    spy.mockResolvedValue(responses[responses.length - 1] as never);
    return { service, spy };
  }

  it('retries malformed JSON instead of killing the run', async () => {
    // This is the bug from the screenshot: one bad response ended the whole run.
    const { service, spy } = serviceReturning('{"concept": "cut off mid-', VALID);

    const result = await service.generate({ topic: 'Board level laptop repair for schools' });

    expect(result.attempts).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('retries a response that is not JSON at all', async () => {
    const { service, spy } = serviceReturning('Sure! Here is your carousel:', VALID);

    await expect(
      service.generate({ topic: 'Board level laptop repair for schools' })
    ).resolves.toMatchObject({ attempts: 2 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('tells the model what was wrong on the next attempt', async () => {
    const { service, spy } = serviceReturning('not json', VALID);

    await service.generate({ topic: 'Board level laptop repair for schools' });

    const [, complaint] = spy.mock.calls[1] as unknown as [unknown, string];
    expect(complaint).toMatch(/did not return JSON/);
    expect(complaint).toMatch(/one JSON object and nothing else/);
  });

  it('reads JSON back out of a markdown fence', async () => {
    const { service } = serviceReturning('```json\n' + VALID + '\n```');

    await expect(
      service.generate({ topic: 'Board level laptop repair for schools' })
    ).resolves.toMatchObject({ attempts: 1 });
  });

  it('gives up with the real reason after every attempt failed', async () => {
    const { service } = serviceReturning('not json', 'still not json', 'nope');

    await expect(
      service.generate({ topic: 'Board level laptop repair for schools' })
    ).rejects.toThrow(/could not produce usable copy in 3 attempts.*did not return JSON/s);
  });

  it('does not swallow a genuine outage', async () => {
    const service = new PostCopyService();
    vi.spyOn(service as never, 'callModel' as never).mockRejectedValue(
      new Error('Claude unreachable') as never
    );

    await expect(
      service.generate({ topic: 'Board level laptop repair for schools' })
    ).rejects.toThrow('Claude unreachable');
  });
});

describe('running past the token ceiling', () => {
  it('gives the copy agent enough room for the schema it is asked for', () => {
    // 2048 could not hold a concept, a caption, fifteen hashtags, the claims and
    // five slides — which is what made the cut-off happen every time.
    expect(env.POST_AGENT_MAX_TOKENS).toBeGreaterThanOrEqual(4096);
  });
});
