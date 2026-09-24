import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaClient } from '@/adapters/meta/metaClient';
import { MetaPlatform } from '@/adapters/meta/meta.types';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('axios', () => ({
  default: { create: () => ({ get, post: vi.fn() }) },
}));

const graphError = (status: number, code: number, subcode?: number) =>
  Object.assign(new Error('Request failed'), {
    response: {
      status,
      headers: {},
      data: { error: { message: `graph ${code}`, code, error_subcode: subcode } },
    },
  });

describe('MetaClient metric reads', () => {
  let client: MetaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new MetaClient();
  });

  it('reports how many requests a successful read took', async () => {
    get
      .mockRejectedValueOnce(graphError(400, 100))
      .mockResolvedValueOnce({ data: { like_count: 5, comments_count: 1 }, headers: {} });

    const result = await client.readPostMetrics('ig-1', 'token', MetaPlatform.INSTAGRAM);

    expect(result).toMatchObject({ ok: true, requests: 2, value: { likes: 5, comments: 1 } });
  });

  it('stops falling back once the token is rejected', async () => {
    get.mockRejectedValue(graphError(400, 190));

    const result = await client.readPostMetrics('ig-1', 'token', MetaPlatform.INSTAGRAM);

    expect(get).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      requests: 1,
      error: { status: 400, code: 190, subcode: null, message: 'graph 190' },
    });
  });

  it('tries every field set while the failure is field level', async () => {
    get.mockRejectedValue(graphError(400, 100));

    const result = await client.readPostMetrics('fb-1', 'token', MetaPlatform.FACEBOOK);

    expect(get).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: false, requests: 2 });
  });

  it('treats a network failure as no status', async () => {
    get.mockRejectedValueOnce(new Error('socket hang up'));

    const result = await client.readAccountMetrics('page-1', 'token', MetaPlatform.FACEBOOK);

    expect(result).toEqual({
      ok: false,
      requests: 1,
      error: { status: null, code: null, subcode: null, message: 'socket hang up' },
    });
  });

  it('keeps the null-returning reads working', async () => {
    get.mockRejectedValue(graphError(400, 190));

    await expect(client.getPostMetrics('fb-1', 'token', MetaPlatform.FACEBOOK)).resolves.toBeNull();
    await expect(
      client.getAccountMetrics('page-1', 'token', MetaPlatform.FACEBOOK)
    ).resolves.toBeNull();
  });

  it('reads follower counts for an account', async () => {
    get.mockResolvedValueOnce({ data: { fan_count: 30, followers_count: 42 }, headers: {} });

    const result = await client.readAccountMetrics('page-1', 'token', MetaPlatform.FACEBOOK);

    expect(result).toMatchObject({ ok: true, requests: 1, value: { followers: 42 } });
  });
});
