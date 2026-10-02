import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('axios', () => ({
  default: { create: () => ({ post, get: vi.fn() }) },
  isAxiosError: () => false,
}));

const FIT_OK = { measure: 888, min_headline_size: 86, fits: true, slides: [] };

describe('fitHeadlines', () => {
  let client: import('@/adapters/render/render.client').RenderClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/adapters/render/render.client');
    module.setRenderClient(null);
    client = module.getRenderClient();
  });

  it('sends each slide headline as its own entry', async () => {
    post.mockResolvedValue({ data: FIT_OK });

    await client.fitHeadlines(
      [{ headline: ['Your process.', 'Not a template.'] }, { headline: ['Talk to us'] }],
      'post'
    );

    expect(post).toHaveBeenCalledWith('/fit/headlines', {
      format: 'post',
      slides: [
        { headline: ['Your process.', 'Not a template.'], rows: [] },
        { headline: ['Talk to us'], rows: [] },
      ],
    });
  });

  it('sends the whole stack so its height is checked as well as its width', async () => {
    post.mockResolvedValue({ data: FIT_OK });
    const slide = {
      headline: ['Ship in weeks,'],
      eyebrow: { text: 'HOW WE BUILD', kind: 'label' as const },
      subs: ['one'],
      closing: 'And then we stay.',
      cta: { text: 'afrisinc.com', arrow: true },
      coral_rule: true,
    };

    await client.fitHeadlines([slide], 'single');

    expect(post).toHaveBeenCalledWith('/fit/headlines', {
      format: 'single',
      slides: [{ ...slide, rows: [] }],
    });
  });

  it('sends the rows so their narrower measure is checked too', async () => {
    post.mockResolvedValue({ data: FIT_OK });
    const rows = [{ title: 'DISCOVERY', body: 'We map your workflow first.' }];

    await client.fitHeadlines([{ headline: ['Ship in weeks,'], rows }], 'post');

    expect(post).toHaveBeenCalledWith('/fit/headlines', {
      format: 'post',
      slides: [{ headline: ['Ship in weeks,'], rows }],
    });
  });

  it('returns the measurement the renderer made', async () => {
    post.mockResolvedValue({ data: { ...FIT_OK, fits: false } });

    await expect(client.fitHeadlines([{ headline: ['x'] }], 'post')).resolves.toMatchObject({
      fits: false,
    });
  });

  it('returns null rather than a pass when the renderer cannot be reached', async () => {
    post.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(client.fitHeadlines([{ headline: ['x'] }], 'post')).resolves.toBeNull();
  });

  it('carries the format through so a story is measured as a story', async () => {
    post.mockResolvedValue({ data: FIT_OK });

    await client.fitHeadlines([{ headline: ['x'] }], 'story');

    expect(post).toHaveBeenCalledWith(
      '/fit/headlines',
      expect.objectContaining({ format: 'story' })
    );
  });
});

describe('wrapHeadline', () => {
  let client: import('@/adapters/render/render.client').RenderClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/adapters/render/render.client');
    module.setRenderClient(null);
    client = module.getRenderClient();
  });

  it('asks the render service to lay the headline out for the frame format', async () => {
    post.mockResolvedValue({ data: { lines: ['One', 'Two'], size: 69, truncated: false } });

    await expect(client.wrapHeadline('One Two', 'single')).resolves.toEqual({
      lines: ['One', 'Two'],
      size: 69,
      truncated: false,
    });
    expect(post).toHaveBeenCalledWith('/layout/headline', { text: 'One Two', format: 'single' });
  });

  it('fails the post when the headline cannot be laid out, rather than guessing', async () => {
    post.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(client.wrapHeadline('One Two', 'single')).rejects.toThrow(
      'could not lay out the headline'
    );
  });
});
