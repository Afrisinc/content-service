import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGptNode } from '@/nodes/chatgpt/chatgpt.node';
import { runChatGpt, streamChatGpt } from '@/nodes/chatgpt';
import type { ChatGptCredentials, IChatGptClient } from '@/nodes/chatgpt/chatgpt.types';
import type { INodeExecutionContext } from '@/nodes/core';

const credentials: ChatGptCredentials = { apiKey: 'sk-test' };

const completion = (content: string) => ({
  id: 'chatcmpl-1',
  model: 'gpt-4o-mini',
  choices: [
    { index: 0, message: { role: 'assistant', content, refusal: null }, finish_reason: 'stop' },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});

function buildClient() {
  return {
    chat: vi.fn(async () => completion('Hello there')),
    chatStream: vi.fn(),
    generateImages: vi.fn(),
    createEmbeddings: vi.fn(),
    moderate: vi.fn(),
  };
}

let client: ReturnType<typeof buildClient>;
let factory: ReturnType<typeof vi.fn>;
let node: ChatGptNode;

beforeEach(() => {
  client = buildClient();
  factory = vi.fn(() => client as unknown as IChatGptClient);
  node = new ChatGptNode({ clientFactory: factory as never });
});

const run = (parameters: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  runChatGpt({ node, credentials, parameters, ...extra });

describe('ChatGptNode text:message', () => {
  it('sends the system prompt, history and prompt in order with mapped options', async () => {
    const output = await run({
      resource: 'text',
      operation: 'message',
      systemPrompt: 'Be brief',
      messages: [{ role: 'user', content: 'earlier' }],
      prompt: 'Say hi',
      options: { temperature: 0.2, maxTokens: 64, topP: 0.9, user: 'user-1' },
    });

    expect(client.chat).toHaveBeenCalledWith(
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Be brief' },
          { role: 'user', content: 'earlier' },
          { role: 'user', content: 'Say hi' },
        ],
        temperature: 0.2,
        max_tokens: 64,
        top_p: 0.9,
        user: 'user-1',
      },
      undefined
    );
    expect(output[0].json).toMatchObject({
      resource: 'text',
      operation: 'message',
      content: 'Hello there',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, totalTokens: 15 },
    });
  });

  it('asks for a JSON object and returns it parsed', async () => {
    client.chat.mockResolvedValue(completion('{"headline":"Ship it"}'));

    const output = await run({
      resource: 'text',
      operation: 'message',
      prompt: 'Write a headline',
      jsonOutput: true,
    });

    expect(client.chat.mock.calls[0][0]).toMatchObject({
      response_format: { type: 'json_object' },
    });
    expect(output[0].json.parsed).toEqual({ headline: 'Ship it' });
  });

  it('fails the item when JSON was requested but not returned', async () => {
    client.chat.mockResolvedValue(completion('not json at all'));

    await expect(
      run({ resource: 'text', operation: 'message', prompt: 'x', jsonOutput: true })
    ).rejects.toThrow('The model did not return valid JSON');
  });

  it('returns the untouched API response when simplification is off', async () => {
    const output = await run({
      resource: 'text',
      operation: 'message',
      prompt: 'Say hi',
      simplifyOutput: false,
    });

    expect(output[0].json.response).toMatchObject({ id: 'chatcmpl-1' });
    expect(output[0].json).not.toHaveProperty('content');
  });

  it('rejects malformed conversation history', async () => {
    const parameters = { resource: 'text', operation: 'message', prompt: 'x' };

    await expect(
      run({ ...parameters, messages: [{ role: 'bot', content: 'hi' }] })
    ).rejects.toThrow('entries need a content string and a role');
    await expect(run({ ...parameters, messages: '"plain"' })).rejects.toThrow(
      'must be an array of { role, content } objects'
    );
  });

  it('reuses one client across the items of a batch', async () => {
    await run(
      {
        resource: 'text',
        operation: 'message',
        prompt: (item: { json: { q: string } }) => item.json.q,
      },
      { items: [{ json: { q: 'one' } }, { json: { q: 'two' } }] }
    );

    expect(factory).toHaveBeenCalledTimes(1);
    expect(client.chat).toHaveBeenCalledTimes(2);
  });
});

describe('ChatGptNode text:classify', () => {
  it('reports the moderation verdict', async () => {
    client.moderate.mockResolvedValue({
      model: 'omni-moderation-latest',
      results: [
        { flagged: true, categories: { violence: true }, category_scores: { violence: 0.9 } },
      ],
    });

    const output = await run({ resource: 'text', operation: 'classify', input: 'something' });

    expect(client.moderate).toHaveBeenCalledWith(
      { model: 'omni-moderation-latest', input: 'something' },
      undefined
    );
    expect(output[0].json).toMatchObject({
      flagged: true,
      categories: { violence: true },
      categoryScores: { violence: 0.9 },
    });
  });
});

describe('ChatGptNode image:generate', () => {
  it('maps the options onto the image request and normalises the result', async () => {
    client.generateImages.mockResolvedValue({
      data: [{ url: 'https://img/1.png', revised_prompt: 'a cat, refined' }],
    });

    const output = await run({
      resource: 'image',
      operation: 'generate',
      prompt: 'a cat',
      options: { size: '1024x1792', quality: 'hd', style: 'natural', numberOfImages: 2 },
    });

    expect(client.generateImages).toHaveBeenCalledWith(
      {
        model: 'dall-e-3',
        prompt: 'a cat',
        size: '1024x1792',
        quality: 'hd',
        style: 'natural',
        n: 2,
      },
      undefined
    );
    expect(output[0].json.images).toEqual([
      { url: 'https://img/1.png', b64Json: null, revisedPrompt: 'a cat, refined' },
    ]);
  });

  it('fails when the API returns no image', async () => {
    client.generateImages.mockResolvedValue({ data: [] });

    await expect(
      run({ resource: 'image', operation: 'generate', prompt: 'a cat' })
    ).rejects.toThrow('returned no images');
  });
});

describe('ChatGptNode image:analyze', () => {
  it('sends every image as a content part with the requested detail', async () => {
    const output = await run({
      resource: 'image',
      operation: 'analyze',
      prompt: 'What is this?',
      imageUrls: ['https://img/1.png', 'https://img/2.png'],
      options: { detail: 'high', maxTokens: 200 },
    });

    expect(client.chat).toHaveBeenCalledWith(
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              { type: 'image_url', image_url: { url: 'https://img/1.png', detail: 'high' } },
              { type: 'image_url', image_url: { url: 'https://img/2.png', detail: 'high' } },
            ],
          },
        ],
        max_tokens: 200,
      },
      undefined
    );
    expect(output[0].json).toMatchObject({ imageCount: 2, content: 'Hello there' });
  });

  it('rejects an empty image list', async () => {
    await expect(
      run({ resource: 'image', operation: 'analyze', prompt: 'x', imageUrls: [''] })
    ).rejects.toThrow('must contain at least one non-empty string');
  });
});

describe('ChatGptNode embedding:create', () => {
  it('accepts a bare string and returns one vector per input', async () => {
    client.createEmbeddings.mockResolvedValue({
      model: 'text-embedding-3-small',
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
      usage: { prompt_tokens: 4, total_tokens: 4 },
    });

    const output = await run({
      resource: 'embedding',
      operation: 'create',
      input: 'hello world',
      options: { dimensions: 3 },
    });

    expect(client.createEmbeddings).toHaveBeenCalledWith(
      { model: 'text-embedding-3-small', input: ['hello world'], dimensions: 3 },
      undefined
    );
    expect(output[0].json).toMatchObject({
      embeddings: [{ index: 0, dimensions: 3, vector: [0.1, 0.2, 0.3] }],
      usage: { inputTokens: 4, outputTokens: 0, totalTokens: 4 },
    });
  });
});

describe('ChatGptNode streaming', () => {
  it('yields the content deltas of a message', async () => {
    client.chatStream.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'Hel' } }] };
        yield { choices: [{ delta: {} }] };
        yield { choices: [{ delta: { content: 'lo' } }] };
      })()
    );

    const chunks: string[] = [];
    for await (const chunk of streamChatGpt({
      node,
      credentials,
      parameters: { resource: 'text', operation: 'message', prompt: 'Say hi' },
    })) {
      chunks.push(chunk);
    }

    expect(client.chatStream.mock.calls[0][0]).toMatchObject({ stream: true });
    expect(chunks.join('')).toBe('Hello');
  });

  it('refuses to stream an operation that cannot stream', async () => {
    const iterator = streamChatGpt({
      node,
      credentials,
      parameters: { resource: 'image', operation: 'generate', prompt: 'a cat' },
    });

    await expect(iterator.next()).rejects.toThrow('"image:generate" cannot be streamed');
  });
});

describe('ChatGptNode guards', () => {
  it('rejects a resource and operation pair it has no handler for', async () => {
    const parameters: Record<string, unknown> = { resource: 'text', operation: 'transcribe' };
    const context = {
      getInputData: () => [{ json: {} }],
      getItem: () => ({ json: {} }),
      getItemIndex: () => 0,
      getNodeParameter: (name: string, fallback?: unknown) => parameters[name] ?? fallback,
      getAllParameters: () => parameters,
      getCredentials: () => credentials,
      continueOnFail: () => false,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as INodeExecutionContext;

    await expect(node.execute(context)).rejects.toThrow('Unsupported operation "text:transcribe"');
  });

  it('turns a failing item into an error item when continueOnFail is set', async () => {
    client.chat.mockRejectedValue(new Error('upstream down'));

    const output = await run(
      { resource: 'text', operation: 'message', prompt: 'Say hi' },
      { continueOnFail: true }
    );

    expect(output[0].error).toMatchObject({ message: 'upstream down' });
  });
});
