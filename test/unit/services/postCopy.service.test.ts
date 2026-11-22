import { RenderClient } from '@/adapters/render/render.client';
import { env } from '@/config/env';
import {
  CopyUnusableError,
  PostCopyService,
  briefPrompt,
  describeFitFailure,
  findVoiceViolations,
  fitInputFor,
} from '@/services/postCopy.service';
import { HeadlineFitResult, PostCopy } from '@/types/post.types';
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

function fitPasses(): Pick<RenderClient, 'fitHeadlines'> {
  return { fitHeadlines: vi.fn(async () => ({ ...FIT_OK, fits: true })) };
}

const FIT_OK: HeadlineFitResult = {
  measure: 888,
  min_headline_size: 86,
  fits: true,
  slides: [],
};

function fitRejecting(text: string, overflow = 113, role = 'headline line'): HeadlineFitResult {
  return {
    ...FIT_OK,
    fits: false,
    slides: [
      {
        index: 1,
        headline_size: 86,
        fits: false,
        lines: [{ role, text, width: 888 + overflow, overflow, fits: false }],
      },
    ],
  };
}

describe('describeFitFailure', () => {
  it('names the slide, the line and the pixels so the rewrite is actionable', () => {
    const complaint = describeFitFailure(fitRejecting('WE BUILD WHAT WORKS', 113));

    expect(complaint).toContain('slide 2');
    expect(complaint).toContain('headline line "WE BUILD WHAT WORKS"');
    expect(complaint).toContain('1001px');
    expect(complaint).toContain('113px too wide');
    expect(complaint).toMatch(/sets at 86px/);
  });

  it('names a row body as a row body, since its measure is not the headline measure', () => {
    const complaint = describeFitFailure(
      fitRejecting('We map the whole workflow', 152, 'row body')
    );

    expect(complaint).toContain('row body "We map the whole workflow"');
    expect(complaint).toContain('152px too wide');
  });

  it('reports every offending line, not only the first', () => {
    const fit = fitRejecting('One long line');
    fit.slides[0].lines.push({
      role: 'row body',
      text: 'Another',
      width: 950,
      overflow: 62,
      fits: false,
    });

    const complaint = describeFitFailure(fit);

    expect(complaint).toContain('One long line');
    expect(complaint).toContain('Another');
  });

  it('leaves out the lines that fit', () => {
    const fit = fitRejecting('Too wide');
    fit.slides[0].lines.push({
      role: 'row body',
      text: 'This one is fine',
      width: 700,
      overflow: -188,
      fits: true,
    });

    expect(describeFitFailure(fit)).not.toContain('This one is fine');
  });
});

describe('describeFitFailure for a stack that is too tall', () => {
  it('names the slide and tells the writer to cut a sub-line or row, not the type', () => {
    const complaint = describeFitFailure(
      fitRejecting('Your process. / Not a template.', 148, 'stack height')
    );

    expect(complaint).toContain('slide 2 stacks 148px taller than its frame');
    expect(complaint).toContain('Drop a sub-line, a row or the closing line');
    expect(complaint).not.toContain('too wide');
  });

  it('reports a wide line and a tall stack together without mixing their advice', () => {
    const fit: HeadlineFitResult = {
      ...FIT_OK,
      fits: false,
      slides: [
        {
          index: 0,
          headline_size: 86,
          fits: false,
          lines: [
            {
              role: 'headline line',
              text: 'WE BUILD WHAT WORKS',
              width: 1000,
              overflow: 112,
              fits: false,
            },
          ],
        },
        {
          index: 1,
          headline_size: 86,
          fits: false,
          lines: [{ role: 'stack height', text: 'Tall', width: 700, overflow: 90, fits: false }],
        },
      ],
    };

    const complaint = describeFitFailure(fit);

    expect(complaint).toContain('slide 1 headline line "WE BUILD WHAT WORKS"');
    expect(complaint).toContain('slide 2 stacks 90px taller');
    expect(complaint).toContain('Rewrite the wide lines shorter');
    expect(complaint).toContain('Drop a sub-line');
  });
});

describe('fitInputFor', () => {
  const rows = [
    { title: 'ONE', body: 'first' },
    { title: 'TWO', body: 'second' },
    { title: 'THREE', body: 'third' },
  ];
  const slide = {
    role: 'method' as const,
    eyebrow: 'HOW WE BUILD',
    eyebrowKind: 'label' as const,
    headline: ['Ship in weeks,'],
    subs: ['one', 'two', 'three'],
    rows,
    closing: 'And then we stay.',
    cta: 'afrisinc.com',
  };

  it('carries everything the renderer stacks, assuming the coral rule is used', () => {
    expect(fitInputFor(slide, 2, 5)).toEqual({
      headline: ['Ship in weeks,'],
      eyebrow: { text: 'HOW WE BUILD', kind: 'label' },
      subs: ['one', 'two'],
      rows,
      closing: 'And then we stay.',
      cta: { text: 'afrisinc.com', arrow: true },
      coral_rule: true,
    });
  });

  it('leaves rows and the closing line out of a frame that will not be white', () => {
    const input = fitInputFor({ ...slide, role: 'hook' }, 0, 5);

    expect(input.rows).toEqual([]);
    expect(input.closing).toBeUndefined();
  });

  it('never gives a lone frame rows, because it is never drawn on white', () => {
    expect(fitInputFor(slide, 0, 1).rows).toEqual([]);
  });

  it('omits the cta and subs when the slide has none', () => {
    const input = fitInputFor(
      { role: 'hook', eyebrow: 'X', eyebrowKind: 'label', headline: ['Hi'] },
      0,
      3
    );

    expect(input.cta).toBeUndefined();
    expect(input.subs).toBeUndefined();
  });
});

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

describe('briefPrompt', () => {
  it('weaves in keywords and a reference link when the brief carries them', () => {
    const prompt = briefPrompt({
      topic: 'Board level laptop repair for schools',
      keywords: '#repair #schools',
      link: 'https://afrisinc.com/repair',
    });

    expect(prompt).toContain('Keywords or hashtags to weave in: #repair #schools');
    expect(prompt).toContain('Reference link the CTA can point to: https://afrisinc.com/repair');
  });

  it('omits those lines when the brief carries neither', () => {
    const prompt = briefPrompt({ topic: 'Board level laptop repair for schools' });

    expect(prompt).not.toContain('Keywords or hashtags');
    expect(prompt).not.toContain('Reference link');
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
    return serviceWithFit(fitPasses(), ...responses);
  }

  function serviceWithFit(render: Pick<RenderClient, 'fitHeadlines'>, ...responses: string[]) {
    const service = new PostCopyService(render as RenderClient);
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

  it('retries a headline the renderer measured as too wide, instead of reaching render', async () => {
    const fitHeadlines = vi
      .fn()
      .mockResolvedValueOnce(fitRejecting('WE BUILD WHAT WORKS'))
      .mockResolvedValue({ ...FIT_OK, fits: true });
    const { service, spy } = serviceWithFit({ fitHeadlines }, VALID, VALID);

    const result = await service.generate({ topic: 'Board level laptop repair for schools' });

    expect(result.attempts).toBe(2);
    const [, complaint] = spy.mock.calls[1] as unknown as [unknown, string];
    expect(complaint).toMatch(/WE BUILD WHAT WORKS/);
    expect(complaint).toMatch(/113px too wide/);
  });

  it('measures every slide, sending the rows so their own measure is checked', async () => {
    const fitHeadlines = vi.fn().mockResolvedValue({ ...FIT_OK, fits: true });
    const { service } = serviceWithFit({ fitHeadlines }, VALID);

    await service.generate({ topic: 'Board level laptop repair for schools' });

    const [slides, format] = fitHeadlines.mock.calls[0];
    expect(format).toBe('post');
    expect(slides.map((slide: { headline: string[] }) => slide.headline)).toEqual([
      ['A dead laptop'],
      ['We fix it'],
      ['On the bench'],
      ['Talk to us'],
    ]);
    expect(slides[2].rows).toHaveLength(3);
  });

  it('lets copy through when the renderer cannot be asked, rather than failing the run', async () => {
    const fitHeadlines = vi.fn().mockResolvedValue(null);
    const { service, spy } = serviceWithFit({ fitHeadlines }, VALID);

    const result = await service.generate({ topic: 'Board level laptop repair for schools' });

    expect(result.attempts).toBe(1);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('does not measure copy that already failed the voice rules', async () => {
    const banned = JSON.parse(VALID);
    banned.slides[0].headline = ['Seamless delivery'];
    const fitHeadlines = vi.fn().mockResolvedValue({ ...FIT_OK, fits: true });
    const { service } = serviceWithFit({ fitHeadlines }, JSON.stringify(banned), VALID);

    await service.generate({ topic: 'Board level laptop repair for schools' });

    expect(fitHeadlines).toHaveBeenCalledOnce();
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
