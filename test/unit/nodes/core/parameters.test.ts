import { describe, expect, it, vi } from 'vitest';
import { NodeParameterError } from '@/nodes/core/node.errors';
import { resolveParameters } from '@/nodes/core/parameters';
import type { INodeProperty } from '@/nodes/core/node.types';

const properties: INodeProperty[] = [
  {
    displayName: 'Resource',
    name: 'resource',
    type: 'options',
    default: 'text',
    required: true,
    options: [
      { name: 'Text', value: 'text' },
      { name: 'Image', value: 'image' },
    ],
  },
  {
    displayName: 'Prompt',
    name: 'prompt',
    type: 'string',
    default: '',
    required: true,
    typeOptions: { maxLength: 10 },
    displayOptions: { show: { resource: ['text'] } },
  },
  {
    displayName: 'Model',
    name: 'model',
    type: 'options',
    default: 'gpt-4o-mini',
    typeOptions: { allowCustomValue: true },
    options: [{ name: 'GPT-4o Mini', value: 'gpt-4o-mini' }],
  },
  {
    displayName: 'Count',
    name: 'count',
    type: 'number',
    default: 1,
    typeOptions: { minValue: 1, maxValue: 5 },
  },
  { displayName: 'Simplify', name: 'simplify', type: 'boolean', default: true },
  { displayName: 'Tags', name: 'tags', type: 'json', default: [] },
  {
    displayName: 'Channels',
    name: 'channels',
    type: 'multiOptions',
    default: [],
    options: [
      { name: 'A', value: 'a' },
      { name: 'B', value: 'b' },
    ],
  },
  {
    displayName: 'Options',
    name: 'options',
    type: 'collection',
    default: {},
    properties: [
      {
        displayName: 'Temperature',
        name: 'temperature',
        type: 'number',
        default: 0,
        typeOptions: { maxValue: 2 },
      },
    ],
  },
  {
    displayName: 'Hidden',
    name: 'hidden',
    type: 'string',
    default: 'never',
    displayOptions: { hide: { resource: ['text', 'image'] } },
  },
];

const context = { item: { json: {} }, itemIndex: 0, node: 'test' };
const resolve = (raw: Record<string, unknown>) => resolveParameters(properties, raw, context);

describe('resolveParameters', () => {
  it('applies defaults and drops properties the display rules hide', () => {
    const resolved = resolve({ prompt: 'hello' });

    expect(resolved).toMatchObject({ resource: 'text', prompt: 'hello', count: 1, simplify: true });
    expect(resolved).not.toHaveProperty('hidden');
  });

  it('drops a shown property once its gating value changes', () => {
    const resolved = resolve({ resource: 'image' });

    expect(resolved).not.toHaveProperty('prompt');
    expect(resolved.hidden).toBeUndefined();
  });

  it('rejects a missing required parameter', () => {
    expect(() => resolve({})).toThrow(NodeParameterError);
    expect(() => resolve({})).toThrow('Parameter "prompt": is required');
  });

  it('rejects a parameter the node does not declare', () => {
    expect(() => resolve({ prompt: 'hi', nope: 1 })).toThrow('is not a parameter of this node');
  });

  it('coerces numeric strings and enforces the declared range', () => {
    expect(resolve({ prompt: 'hi', count: '3' }).count).toBe(3);
    expect(() => resolve({ prompt: 'hi', count: 9 })).toThrow('must be at most 5');
    expect(() => resolve({ prompt: 'hi', count: 0 })).toThrow('must be at least 1');
    expect(() => resolve({ prompt: 'hi', count: 'abc' })).toThrow('expected a number');
  });

  it('coerces booleans and rejects values that are neither', () => {
    expect(resolve({ prompt: 'hi', simplify: 'false' }).simplify).toBe(false);
    expect(() => resolve({ prompt: 'hi', simplify: 2 })).toThrow('expected a boolean');
  });

  it('enforces string types and length', () => {
    expect(resolve({ prompt: 7 }).prompt).toBe('7');
    expect(() => resolve({ prompt: 'x'.repeat(11) })).toThrow('at most 10 characters');
    expect(() => resolve({ prompt: { a: 1 } })).toThrow('expected a string');
  });

  it('restricts options unless the property allows custom values', () => {
    expect(resolve({ prompt: 'hi', model: 'gpt-5-preview' }).model).toBe('gpt-5-preview');
    expect(() => resolve({ prompt: 'hi', resource: 'video' })).toThrow(
      'must be one of: text, image'
    );
  });

  it('validates every entry of a multiOptions value', () => {
    expect(resolve({ prompt: 'hi', channels: ['a', 'b'] }).channels).toEqual(['a', 'b']);
    expect(() => resolve({ prompt: 'hi', channels: ['a', 'z'] })).toThrow('unsupported values: z');
    expect(() => resolve({ prompt: 'hi', channels: 'a' })).toThrow('expected an array');
  });

  it('parses JSON supplied as a string and reports invalid JSON', () => {
    expect(resolve({ prompt: 'hi', tags: '["a"]' }).tags).toEqual(['a']);
    expect(() => resolve({ prompt: 'hi', tags: '{oops' })).toThrow('is not valid JSON');
  });

  it('keeps only the collection options that were set', () => {
    expect(resolve({ prompt: 'hi', options: { temperature: 0.4 } }).options).toEqual({
      temperature: 0.4,
    });
    expect(resolve({ prompt: 'hi' }).options).toEqual({});
    expect(() => resolve({ prompt: 'hi', options: { top_k: 5 } })).toThrow(
      'is not a supported option'
    );
    expect(() => resolve({ prompt: 'hi', options: { temperature: 9 } })).toThrow('at most 2');
    expect(() => resolve({ prompt: 'hi', options: 'nope' })).toThrow('expected an object');
  });

  it('calls a resolver with the current item so parameters can vary per item', () => {
    const resolver = vi.fn(() => 'from-item');
    const item = { json: { topic: 'ai' } };

    const resolved = resolveParameters(
      properties,
      { prompt: resolver },
      {
        item,
        itemIndex: 2,
        node: 'test',
      }
    );

    expect(resolver).toHaveBeenCalledWith(item, 2);
    expect(resolved.prompt).toBe('from-item');
  });
});
