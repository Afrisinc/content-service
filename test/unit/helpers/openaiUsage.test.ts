import { beforeEach, describe, expect, it, vi } from 'vitest';

const completions = vi.hoisted(() => ({ create: vi.fn() }));
const images = vi.hoisted(() => ({ generate: vi.fn() }));
const usage = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock('openai', () => ({
  default: class {
    chat = { completions };
    images = images;
  },
}));

vi.mock('@/adapters/nodes/nodeServices', () => ({ nodeServices: { usage } }));

process.env.OPENAI_API_KEY = 'sk-test';
process.env.OPENAI_TEXT_MODEL = 'gpt-4o-mini';
process.env.OPENAI_IMAGE_MODEL = 'dall-e-3';

const { openaiHelper: helper } = await import('@/helpers/openai.helper');

function recorded() {
  return usage.record.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('text generation', () => {
  beforeEach(() => {
    completions.create.mockResolvedValue({
      choices: [{ message: { content: '{"facebook":"hello"}' } }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        prompt_tokens_details: { cached_tokens: 200 },
      },
    });
  });

  it('records the call against the ledger', async () => {
    await helper.generateContent({ prompt: 'a topic' });

    expect(usage.record).toHaveBeenCalledTimes(1);
    expect(recorded()).toMatchObject({
      node: 'chatGpt',
      model: 'gpt-4o-mini',
      resource: 'text',
      operation: 'message',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      success: true,
    });
  });

  it('prices the call from the model table', async () => {
    await helper.generateContent({ prompt: 'a topic' });

    // gpt-4o-mini: 150k in, 600k out, 75k cached, per million tokens.
    expect(recorded().costMicroUsd).toBe(150n + 300n + 15n);
  });

  it('records a failed call so the spend page shows it', async () => {
    completions.create.mockRejectedValueOnce(new Error('rate limited'));

    await expect(helper.generateContent({ prompt: 'a topic' })).rejects.toThrow('rate limited');

    expect(recorded()).toMatchObject({ success: false, costMicroUsd: 0n });
  });

  it('never lets a ledger problem fail a generation the caller paid for', async () => {
    usage.record.mockImplementationOnce(() => {
      throw new Error('ledger down');
    });

    await expect(helper.generateContent({ prompt: 'a topic' })).resolves.toBeTruthy();
  });

  it('records a vision call under its own operation', async () => {
    completions.create.mockResolvedValue({
      choices: [{ message: { content: 'a caption' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    await helper.generateContentWithVision('https://cdn.test/a.png', 'describe');

    expect(recorded()).toMatchObject({ resource: 'text', operation: 'vision' });
  });
});

describe('image generation', () => {
  it('prices per image, since the token table cannot', async () => {
    images.generate.mockResolvedValue({ data: [{ url: 'https://cdn.test/i.png' }] });

    await helper.generateImage('a prompt');

    expect(recorded()).toMatchObject({
      resource: 'image',
      operation: 'generate',
      model: 'dall-e-3',
      costMicroUsd: 40_000n,
      success: true,
    });
  });

  it('records a failed image call at no cost', async () => {
    images.generate.mockRejectedValueOnce(new Error('content policy'));

    await expect(helper.generateImage('a prompt')).rejects.toThrow('content policy');

    expect(recorded()).toMatchObject({ success: false, costMicroUsd: 0n });
  });
});
