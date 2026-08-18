import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaClient } from '@/adapters/meta/metaClient';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('axios', () => ({
  default: { create: () => ({ get, post: vi.fn() }) },
}));

function finishesAfter(polls: number) {
  let seen = 0;
  return async () => {
    seen += 1;
    return { data: { status_code: seen >= polls ? 'FINISHED' : 'IN_PROGRESS' } };
  };
}

describe('waitForInstagramContainer', () => {
  let client: MetaClient;

  beforeEach(() => {
    client = new MetaClient();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives up on an image container at the short ceiling', async () => {
    get.mockResolvedValue({ data: { status_code: 'IN_PROGRESS' } });

    const pending = client.waitForInstagramContainer('container-1', 'token');
    const assertion = expect(pending).rejects.toThrow('did not finish processing after 60s');

    await vi.runAllTimersAsync();
    await assertion;

    expect(get).toHaveBeenCalledTimes(20);
  });

  it('keeps polling a video container well past the image ceiling', async () => {
    get.mockResolvedValue({ data: { status_code: 'IN_PROGRESS' } });

    const pending = client.waitForInstagramContainer('container-1', 'token', true);
    const assertion = expect(pending).rejects.toThrow('did not finish processing after 300s');

    await vi.runAllTimersAsync();
    await assertion;

    expect(get).toHaveBeenCalledTimes(100);
  });

  it('resolves once a slow video container finishes beyond the image ceiling', async () => {
    get.mockImplementation(finishesAfter(45));

    const pending = client.waitForInstagramContainer('container-1', 'token', true);

    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBeUndefined();

    expect(get).toHaveBeenCalledTimes(45);
  });

  it('fails fast when the container errors rather than waiting out the ceiling', async () => {
    get.mockResolvedValue({ data: { status_code: 'ERROR', status: 'bad aspect ratio' } });

    const pending = client.waitForInstagramContainer('container-1', 'token', true);
    const assertion = expect(pending).rejects.toThrow(
      'Instagram container ERROR: bad aspect ratio'
    );

    await vi.runAllTimersAsync();
    await assertion;

    expect(get).toHaveBeenCalledTimes(1);
  });
});
