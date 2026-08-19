import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatGptClient } from '@/nodes/chatgpt/chatgpt.client';
import { NodeApiError } from '@/nodes/core';

const mocks = vi.hoisted(() => ({
  chatCreate: vi.fn(),
  imageGenerate: vi.fn(),
  embeddingCreate: vi.fn(),
  moderationCreate: vi.fn(),
  constructed: [] as unknown[],
}));

vi.mock('openai', () => {
  class APIError extends Error {
    status: number | undefined;
    headers: { get(name: string): string | null } | undefined;
    code: string | null;
    type: string | undefined;

    constructor(
      status?: number,
      error?: { code?: string; type?: string },
      message?: string,
      headers?: { get(name: string): string | null }
    ) {
      super(message ?? 'api error');
      this.status = status;
      this.headers = headers;
      this.code = error?.code ?? null;
      this.type = error?.type;
    }
  }
  class APIConnectionError extends APIError {
    constructor() {
      super(undefined, undefined, 'connection reset');
    }
  }
  class APIUserAbortError extends APIError {
    constructor() {
      super(undefined, undefined, 'aborted');
    }
  }
  class OpenAI {
    chat = { completions: { create: mocks.chatCreate } };
    images = { generate: mocks.imageGenerate };
    embeddings = { create: mocks.embeddingCreate };
    moderations = { create: mocks.moderationCreate };

    constructor(options: unknown) {
      mocks.constructed.push(options);
    }
  }
  return { default: OpenAI, APIError, APIConnectionError, APIUserAbortError };
});

const { APIConnectionError, APIError } = await import('openai');

const credentials = {
  apiKey: 'sk-test',
  baseUrl: 'https://gateway.internal/v1',
  organizationId: 'org-1',
  projectId: 'proj-1',
};
const sleep = vi.fn(async () => undefined);
const client = () => createChatGptClient(credentials, { retry: { sleep, retries: 2 } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.constructed.length = 0;
});

describe('createChatGptClient', () => {
  it('hands the credentials to the SDK and disables its own retries', () => {
    client();

    expect(mocks.constructed[0]).toMatchObject({
      apiKey: 'sk-test',
      baseURL: 'https://gateway.internal/v1',
      organization: 'org-1',
      project: 'proj-1',
      maxRetries: 0,
    });
  });

  it('retries a rate limit for the period the response asks for', async () => {
    const headers = { get: (name: string) => (name === 'retry-after' ? '2' : null) };
    mocks.chatCreate
      .mockRejectedValueOnce(
        new APIError(429, { code: 'rate_limit_exceeded' }, 'slow down', headers)
      )
      .mockResolvedValueOnce({ id: 'chatcmpl-1' });

    await expect(client().chat({ model: 'gpt-4o-mini', messages: [] })).resolves.toEqual({
      id: 'chatcmpl-1',
    });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(mocks.chatCreate).toHaveBeenCalledTimes(2);
  });

  it('retries a dropped connection', async () => {
    mocks.chatCreate
      .mockRejectedValueOnce(new APIConnectionError())
      .mockResolvedValueOnce({ id: 'chatcmpl-2' });

    await expect(client().chat({ model: 'gpt-4o-mini', messages: [] })).resolves.toEqual({
      id: 'chatcmpl-2',
    });
    expect(mocks.chatCreate).toHaveBeenCalledTimes(2);
  });

  it('does not retry a client error and reports it as a node API error', async () => {
    mocks.chatCreate.mockRejectedValue(
      new APIError(400, { code: 'invalid_prompt', type: 'invalid_request_error' }, 'bad prompt')
    );

    const failure = client()
      .chat({ model: 'gpt-4o-mini', messages: [] })
      .catch((error: unknown) => error);

    await expect(failure).resolves.toBeInstanceOf(NodeApiError);
    const error = (await failure) as NodeApiError;
    expect(error).toMatchObject({ status: 400, code: 'invalid_prompt', retryable: false });
    expect(error.message).toContain('ChatGPT chat completion failed: bad prompt');
    expect(mocks.chatCreate).toHaveBeenCalledTimes(1);
    expect(error.message).not.toContain('sk-test');
  });

  it('wraps a failure that is not an API error at all', async () => {
    mocks.imageGenerate.mockRejectedValue(new Error('socket closed'));

    await expect(client().generateImages({ model: 'dall-e-3', prompt: 'x' })).rejects.toThrow(
      'ChatGPT image generation failed: socket closed'
    );
    expect(mocks.imageGenerate).toHaveBeenCalledTimes(1);
  });

  it('passes each call through to its endpoint with the abort signal', async () => {
    const signal = new AbortController().signal;
    mocks.moderationCreate.mockResolvedValue({ results: [] });
    mocks.embeddingCreate.mockResolvedValue({ data: [] });
    mocks.chatCreate.mockResolvedValue({ id: 'stream' });

    const api = client();
    await api.moderate({ model: 'omni-moderation-latest', input: 'hi' }, signal);
    await api.createEmbeddings({ model: 'text-embedding-3-small', input: ['hi'] }, signal);
    await api.chatStream({ model: 'gpt-4o-mini', messages: [], stream: true }, signal);

    expect(mocks.moderationCreate).toHaveBeenCalledWith(
      { model: 'omni-moderation-latest', input: 'hi' },
      { signal }
    );
    expect(mocks.embeddingCreate).toHaveBeenCalledWith(
      { model: 'text-embedding-3-small', input: ['hi'] },
      { signal }
    );
    expect(mocks.chatCreate).toHaveBeenCalledWith(
      { model: 'gpt-4o-mini', messages: [], stream: true },
      { signal }
    );
  });
});
