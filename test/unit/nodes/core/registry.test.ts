import { describe, expect, it } from 'vitest';
import { nodeRegistry } from '@/nodes';
import { NodeRegistry } from '@/nodes/core/node.registry';
import type { INodeType } from '@/nodes/core/node.types';

function node(name: string, version: number): INodeType {
  return {
    description: {
      displayName: name,
      name,
      version,
      group: ['transform'],
      description: 'test node',
      defaults: { name },
      inputs: ['main'],
      outputs: ['main'],
      properties: [],
    },
    execute: async () => [],
  };
}

describe('NodeRegistry', () => {
  it('returns the highest version when none is requested', () => {
    const registry = new NodeRegistry().register(node('chatGpt', 1)).register(node('chatGpt', 2));

    expect(registry.get('chatGpt').description.version).toBe(2);
    expect(registry.get('chatGpt', 1).description.version).toBe(1);
  });

  it('reports what it holds', () => {
    const registry = new NodeRegistry().register(node('chatGpt', 1));

    expect(registry.has('chatGpt')).toBe(true);
    expect(registry.has('chatGpt', 2)).toBe(false);
    expect(registry.has('other')).toBe(false);
    expect(registry.list().map(entry => entry.name)).toEqual(['chatGpt']);
  });

  it('refuses duplicate registrations and unknown lookups', () => {
    const registry = new NodeRegistry().register(node('chatGpt', 1));

    expect(() => registry.register(node('chatGpt', 1))).toThrow('already registered');
    expect(() => registry.get('missing')).toThrow('Unknown node "missing"');
    expect(() => registry.get('chatGpt', 9)).toThrow('has no version 9');
  });
});

describe('nodeRegistry', () => {
  it('holds every node this service ships', () => {
    expect(
      nodeRegistry
        .list()
        .map(entry => entry.name)
        .sort()
    ).toEqual(['chatGpt', 'claude']);
  });

  it('hands back a runnable node by name', () => {
    expect(typeof nodeRegistry.get('claude').execute).toBe('function');
    expect(nodeRegistry.get('chatGpt').description.displayName).toBe('ChatGPT');
  });
});
