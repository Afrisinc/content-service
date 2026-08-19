import { describe, expect, it, vi } from 'vitest';
import { executeNode, streamNode } from '@/nodes/core/node.executor';
import { NodeOperationError } from '@/nodes/core/node.errors';
import type { INodeDescription, INodeItem, INodeType } from '@/nodes/core/node.types';

const description: INodeDescription = {
  displayName: 'Echo',
  name: 'echo',
  version: 1,
  group: ['transform'],
  description: 'Echoes a parameter back',
  defaults: { name: 'Echo' },
  inputs: ['main'],
  outputs: ['main'],
  credentials: [{ name: 'echoApi', required: true }],
  properties: [{ displayName: 'Value', name: 'value', type: 'string', default: 'default' }],
};

function buildNode(execute: INodeType['execute'], stream?: INodeType['stream']): INodeType {
  return { description, execute, stream };
}

const credentials = { echoApi: { token: 'secret' } };

describe('executeNode', () => {
  it('runs once per input item and pairs each output with its source', async () => {
    const node = buildNode(async context => [
      { json: { value: context.getNodeParameter('value'), index: context.getItemIndex() } },
    ]);

    const output = await executeNode(node, {
      parameters: { value: (item: INodeItem) => `seen-${item.json.topic}` },
      items: [{ json: { topic: 'a' } }, { json: { topic: 'b' } }],
      credentials,
    });

    expect(output).toEqual([
      { json: { value: 'seen-a', index: 0 }, pairedItem: 0 },
      { json: { value: 'seen-b', index: 1 }, pairedItem: 1 },
    ]);
  });

  it('executes once against an empty item when no input is supplied', async () => {
    const node = buildNode(async context => [
      { json: { value: context.getNodeParameter('value') } },
    ]);

    const output = await executeNode(node, { parameters: {}, credentials });

    expect(output).toEqual([{ json: { value: 'default' }, pairedItem: 0 }]);
  });

  it('refuses to run without the credentials the description requires', async () => {
    const execute = vi.fn();

    await expect(executeNode(buildNode(execute), { parameters: {} })).rejects.toThrow(
      'Credentials "echoApi" are required'
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('exposes credentials to the node and fails loudly on an unknown name', async () => {
    const node = buildNode(async context => [
      { json: { token: context.getCredentials<{ token: string }>('echoApi').token } },
    ]);
    const missing = buildNode(async context => [{ json: { ...context.getCredentials('other') } }]);

    await expect(executeNode(node, { parameters: {}, credentials })).resolves.toEqual([
      { json: { token: 'secret' }, pairedItem: 0 },
    ]);
    await expect(executeNode(missing, { parameters: {}, credentials })).rejects.toThrow(
      'Credentials "other" are not available'
    );
  });

  it('rejects the whole batch when a node throws and continueOnFail is off', async () => {
    const node = buildNode(async () => {
      throw new NodeOperationError('boom');
    });

    await expect(executeNode(node, { parameters: {}, credentials })).rejects.toThrow('boom');
  });

  it('keeps processing later items when continueOnFail is on', async () => {
    const node = buildNode(async context => {
      if (context.getItemIndex() === 0) {
        throw new NodeOperationError('bad item');
      }
      return [{ json: { ok: true } }];
    });
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const output = await executeNode(node, {
      parameters: {},
      items: [{ json: {} }, { json: {} }],
      credentials,
      continueOnFail: true,
      logger,
    });

    expect(output).toHaveLength(2);
    expect(output[0].error).toMatchObject({ name: 'NodeOperationError', message: 'bad item' });
    expect(output[1].json).toEqual({ ok: true });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('reports a parameter failure as a failed item under continueOnFail', async () => {
    const strict: INodeType = {
      description: {
        ...description,
        properties: [{ displayName: 'Value', name: 'value', type: 'number', default: 1 }],
      },
      execute: async () => [{ json: {} }],
    };

    const output = await executeNode(strict, {
      parameters: { value: 'not-a-number' },
      credentials,
      continueOnFail: true,
    });

    expect(output[0].error).toMatchObject({ name: 'NodeParameterError', parameter: 'value' });
  });
});

describe('streamNode', () => {
  it('yields the chunks the node produces', async () => {
    const node = buildNode(
      async () => [],
      async function* () {
        yield 'Hel';
        yield 'lo';
      }
    );

    const chunks: string[] = [];
    for await (const chunk of streamNode(node, { parameters: {}, credentials })) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('Hello');
  });

  it('rejects a node that does not implement streaming', async () => {
    const node = buildNode(async () => []);
    const iterator = streamNode(node, { parameters: {}, credentials });

    await expect(iterator.next()).rejects.toThrow('does not support streaming');
  });
});
