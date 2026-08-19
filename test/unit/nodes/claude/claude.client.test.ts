import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClaudeClient } from '@/nodes/claude/claude.client';
import { NodeApiError } from '@/nodes/core';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  constructed: [] as unknown[],
}));

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status: number | undefined;
    headers: { get(name: string): string | null } | undefined;
    type: string | null;

    constructor(
      status?: number,
      _error?: unknown,
      message?: string,
      headers?: { get(name: string): string | null },
      type?: string | null
    ) {
      super(message ?? 'api error');
      this.status = status;
      this.headers = headers;
      this.type = type ?? null;
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
  class Anthropic {
    beta = { messages: { create: mocks.create } };

    constructor(options: unknown) {
      mocks.constructed.push(options);
    }
  }
  return { default: Anthropic, APIError, APIConnectionError, APIUserAbortError };
});

const { APIConnectionError, APIError } = await import('@anthropic-ai/sdk');

const credentials = { apiKey: 'sk-ant-test', baseUrl: 'https://gateway.internal' };
const sleep = vi.fn(async () => undefined);
const client = () => createClaudeClient(credentials, { retry: { sleep, retries: 2 } });
const body = { model: 'claude-opus-5', max_tokens: 16000, messages: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.constructed.length = 0;
});

describe('createClaudeClient', () => {
  it('hands the credentials to the SDK and disables its own retries', () => {
    client();

    expect(mocks.constructed[0]).toMatchObject({
      apiKey: 'sk-ant-test',
      baseURL: 'https://gateway.internal',
      maxRetries: 0,
    });
  });

  it('retries a rate limit for the period the response asks for', async () => {
    const headers = { get: (name: string) => (name === 'retry-after' ? '3' : null) };
    mocks.create
      .mockRejectedValueOnce(new APIError(429, {}, 'slow down', headers, 'rate_limit_error'))
      .mockResolvedValueOnce({ id: 'msg_1' });

    await expect(client().message(body)).resolves.toEqual({ id: 'msg_1' });
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it('retries a dropped connection', async () => {
    mocks.create.mockRejectedValueOnce(new APIConnectionError()).mockResolvedValueOnce({ id: 'm' });

    await expect(client().message(body)).resolves.toEqual({ id: 'm' });
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it('does not retry a client error and reports it as a node API error', async () => {
    mocks.create.mockRejectedValue(
      new APIError(400, {}, 'max_tokens is required', undefined, 'invalid_request_error')
    );

    const failure = client()
      .message(body)
      .catch((error: unknown) => error);

    await expect(failure).resolves.toBeInstanceOf(NodeApiError);
    const error = (await failure) as NodeApiError;
    expect(error).toMatchObject({ status: 400, code: 'invalid_request_error', retryable: false });
    expect(error.message).toContain('Claude message failed: max_tokens is required');
    expect(error.message).not.toContain('sk-ant-test');
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('wraps a failure that is not an API error at all', async () => {
    mocks.create.mockRejectedValue(new Error('socket closed'));

    await expect(client().message(body)).rejects.toThrow('Claude message failed: socket closed');
  });

  it('passes the streaming request and abort signal through', async () => {
    const signal = new AbortController().signal;
    mocks.create.mockResolvedValue({ id: 'stream' });

    await client().messageStream({ ...body, stream: true }, signal);

    expect(mocks.create).toHaveBeenCalledWith({ ...body, stream: true }, { signal });
  });
});
