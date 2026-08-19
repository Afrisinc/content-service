import { NodeOperationError } from './node.errors';
import type { INodeItem, JsonObject } from './node.types';

/** Single conversion point from SDK responses to plain JSON an item can carry. */
export function asJson(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject;
}

export function outputItem(json: JsonObject): INodeItem[] {
  return [{ json }];
}

export interface NodeHelpers {
  fail(message: string, itemIndex: number, description?: string): never;
  toStringArray(value: unknown, parameter: string, itemIndex: number): string[];
}

/** Binds the shared operation guards to one node, so errors name the right node. */
export function nodeHelpers(node: string): NodeHelpers {
  const fail = (message: string, itemIndex: number, description?: string): never => {
    throw new NodeOperationError(message, { node, itemIndex, description });
  };

  return {
    fail,
    toStringArray(value, parameter, itemIndex) {
      const entries = Array.isArray(value) ? value : [value];
      const strings = entries.filter(
        (entry): entry is string => typeof entry === 'string' && entry !== ''
      );

      if (strings.length === 0) {
        fail(`"${parameter}" must contain at least one non-empty string`, itemIndex);
      }

      return strings;
    },
  };
}
