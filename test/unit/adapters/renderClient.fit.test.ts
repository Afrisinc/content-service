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
