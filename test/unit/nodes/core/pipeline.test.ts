import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeNode, streamNode } from '@/nodes/core/node.executor';
import {
  createInMemoryChatMemory,
  createInMemoryResponseCache,
} from '@/nodes/core/services.inmemory';
import type { INodeDescription, INodeItem, INodeType } from '@/nodes/core/node.types';
import type { NodeServices, UsageEvent } from '@/nodes/core/services.types';

const description: INodeDescription = {
  displayName: 'Fake',
  name: 'fake',
  version: 1,
  group: ['transform'],
  description: 'test node',
  defaults: { name: 'Fake' },
  inputs: ['main'],
  outputs: ['main'],
  properties: [
    { displayName: 'Prompt', name: 'prompt', type: 'string', default: '', required: true },
    { displayName: 'Messages', name: 'messages', type: 'json', default: [] },
    { displayName: 'Model', name: 'model', type: 'string', default: 'test-model' },
  ],
  memory: { historyParameter: 'messages', promptParameter: 'prompt', replyField: 'content' },
};

let execute: ReturnType<typeof vi.fn>;
let node: INodeType;
let recorded: UsageEvent[];
let services: NodeServices;

beforeEach(() => {
  execute = vi.fn(async () => [
    {
      json: {
        model: 'test-model',
        content: 'the reply',
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 1500,
        },
      },
    },
  ]);
  node = {
    description,
    execute,
    pricing: {
      'test-model': { input: 5_000_000, output: 25_000_000, cacheRead: 500_000, cacheWrite: 0 },
    },
  };
  recorded = [];
  services = {
    memory: createInMemoryChatMemory(),
    cache: createInMemoryResponseCache(),
    usage: { record: event => recorded.push(event) },
  };
});

const run = (options: Record<string, unknown> = {}) =>
  executeNode(node, { parameters: { prompt: 'Say hi' }, services, ...options });

describe('memory', () => {
  it('prepends stored turns and remembers the exchange afterwards', async () => {
    await services.memory!.append('session-1', [
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
    ]);

    await run({ memory: { sessionId: 'session-1' } });

    const context = execute.mock.calls[0][0];
    expect(context.getNodeParameter('messages')).toEqual([
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
    ]);
    expect(await services.memory!.load('session-1')).toEqual([
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
      { role: 'user', content: 'Say hi' },
      { role: 'assistant', content: 'the reply' },
    ]);
  });

  it('keeps caller-supplied history after the stored turns', async () => {
    await services.memory!.append('session-1', [{ role: 'user', content: 'stored' }]);

    await executeNode(node, {
      parameters: { prompt: 'Say hi', messages: [{ role: 'user', content: 'inline' }] },
      services,
      memory: { sessionId: 'session-1' },
    });

    expect(execute.mock.calls[0][0].getNodeParameter('messages')).toEqual([
      { role: 'user', content: 'stored' },
      { role: 'user', content: 'inline' },
    ]);
  });

  it('stores nothing when the node produced no answer', async () => {
    execute.mockResolvedValue([{ json: { model: 'test-model', content: '' } }]);

    await run({ memory: { sessionId: 'session-2' } });

    expect(await services.memory!.load('session-2')).toEqual([]);
  });

  it('is untouched when no session is supplied', async () => {
    const load = vi.spyOn(services.memory!, 'load');

    await run();

    expect(load).not.toHaveBeenCalled();
  });

  it('remembers a streamed turn once the stream ends', async () => {
    const streaming: INodeType = {
      ...node,
      async *stream() {
        yield 'the ';
        yield 'reply';
      },
    };

    const chunks: string[] = [];
    for await (const chunk of streamNode(streaming, {
      parameters: { prompt: 'Say hi' },
      services,
      memory: { sessionId: 'session-3' },
    })) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('the reply');
    expect(await services.memory!.load('session-3')).toEqual([
      { role: 'user', content: 'Say hi' },
      { role: 'assistant', content: 'the reply' },
    ]);
  });
});

describe('response cache', () => {
  it('serves an identical request from cache without calling the node again', async () => {
    const first = await run({ cache: { ttlSeconds: 60 } });
    const second = await run({ cache: { ttlSeconds: 60 } });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(second[0].json).toEqual(first[0].json);
  });

  it('treats a different parameter as a different request', async () => {
    await run({ cache: { ttlSeconds: 60 } });
    await executeNode(node, {
      parameters: { prompt: 'Say something else' },
      services,
      cache: { ttlSeconds: 60 },
    });

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not cache unless the caller asks for it', async () => {
    await run();
    await run();

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('replays a repeated idempotency key instead of paying twice', async () => {
    await run({ idempotency: { key: 'webhook-42' } });
    const replay = await run({ idempotency: { key: 'webhook-42' } });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(replay[0].json.content).toBe('the reply');
  });
});

describe('usage accounting', () => {
  it('prices a successful call from the node price table', async () => {
    await run({ usageContext: { userId: 'user-1', requestId: 'req-1' } });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      node: 'fake',
      model: 'test-model',
      userId: 'user-1',
      requestId: 'req-1',
      inputTokens: 1000,
      outputTokens: 500,
      success: true,
      cached: false,
      // 1000 * $5/MTok + 500 * $25/MTok = $0.0175 = 17_500 micro-USD
      costMicroUsd: 17_500n,
    });
  });

  it('records a cache hit as zero spend', async () => {
    await run({ cache: { ttlSeconds: 60 } });
    await run({ cache: { ttlSeconds: 60 } });

    expect(recorded[1]).toMatchObject({
      cached: true,
      costMicroUsd: 0n,
      inputTokens: 0,
      outputTokens: 0,
      success: true,
    });
  });

  it('records a failure with its error name and never swallows it', async () => {
    execute.mockRejectedValue(new TypeError('provider exploded'));

    await expect(run()).rejects.toThrow('provider exploded');
    expect(recorded[0]).toMatchObject({ success: false, errorCode: 'TypeError', cached: false });
  });

  it('charges nothing for a model with no listed price', async () => {
    execute.mockResolvedValue([
      { json: { model: 'unlisted-model', content: 'hi', usage: { inputTokens: 10 } } },
    ]);

    await run();

    expect(recorded[0]).toMatchObject({ model: 'unlisted-model', costMicroUsd: 0n });
  });
});

describe('budget guard', () => {
  it('refuses to call the provider once the cap is reached', async () => {
    services.budget = {
      check: async () => ({ allowed: false, spentMicroUsd: 100n, limitMicroUsd: 100n }),
      consume: vi.fn(),
    };

    await expect(run({ usageContext: { userId: 'user-1' } })).rejects.toThrow(
      'AI spend limit reached'
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('charges the actual cost once the call succeeds', async () => {
    const consume = vi.fn();
    services.budget = {
      check: async () => ({ allowed: true, spentMicroUsd: 0n, limitMicroUsd: 1_000_000n }),
      consume,
    };

    await run({ usageContext: { userId: 'user-1' } });

    expect(consume).toHaveBeenCalledWith('user-1', 17_500n);
  });
});

describe('concurrency', () => {
  const items: INodeItem[] = Array.from({ length: 6 }, (_, index) => ({ json: { index } }));

  it('runs one item at a time by default', async () => {
    let inFlight = 0;
    let peak = 0;
    execute.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight -= 1;
      return [{ json: { content: 'ok' } }];
    });

    await run({ items });

    expect(peak).toBe(1);
  });

  it('honours the requested limit and keeps output in input order', async () => {
    let inFlight = 0;
    let peak = 0;
    execute.mockImplementation(async (context: { getItemIndex(): number }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5 - context.getItemIndex()));
      inFlight -= 1;
      return [{ json: { content: `item-${context.getItemIndex()}` } }];
    });

    const output = await run({ items, concurrency: 3 });

    expect(peak).toBe(3);
    expect(output.map(item => item.json.content)).toEqual([
      'item-0',
      'item-1',
      'item-2',
      'item-3',
      'item-4',
      'item-5',
    ]);
  });

  it('stops scheduling more work once an item fails', async () => {
    execute.mockImplementation(async (context: { getItemIndex(): number }) => {
      if (context.getItemIndex() === 0) {
        throw new Error('first item failed');
      }
      await new Promise(resolve => setTimeout(resolve, 5));
      return [{ json: { content: 'ok' } }];
    });

    await expect(run({ items, concurrency: 2 })).rejects.toThrow('first item failed');
    expect(execute.mock.calls.length).toBeLessThan(items.length);
  });
});
