import { NodeParameterError } from './node.errors';
import type { IDisplayOptions, INodeItem, INodeProperty, ResolvedParameters } from './node.types';

/** A raw value, or a resolver called once per item — a framework-free stand-in for expressions. */
export type ParameterResolver = (item: INodeItem, itemIndex: number) => unknown;
export type RawParameters = Record<string, unknown>;

export interface ResolveOptions {
  item: INodeItem;
  itemIndex: number;
  node?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveRaw(value: unknown, options: ResolveOptions): unknown {
  return typeof value === 'function'
    ? (value as ParameterResolver)(options.item, options.itemIndex)
    : value;
}

function matchesRule(
  rule: Record<string, Array<string | number | boolean>>,
  values: Record<string, unknown>
): boolean {
  return Object.entries(rule).every(([name, accepted]) =>
    accepted.some(candidate => candidate === values[name])
  );
}

export function isDisplayed(
  displayOptions: IDisplayOptions | undefined,
  values: Record<string, unknown>
): boolean {
  if (!displayOptions) {
    return true;
  }

  if (displayOptions.show && !matchesRule(displayOptions.show, values)) {
    return false;
  }

  return !(displayOptions.hide && matchesRule(displayOptions.hide, values));
}

function coerce(property: INodeProperty, value: unknown, options: ResolveOptions): unknown {
  const fail = (reason: string): never => {
    throw new NodeParameterError(property.name, reason, {
      node: options.node,
      itemIndex: options.itemIndex,
      description: property.description,
    });
  };
  const limits = property.typeOptions ?? {};

  switch (property.type) {
    case 'string': {
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      if (typeof value !== 'string') {
        return fail(`expected a string, received ${typeof value}`);
      }
      if (limits.maxLength !== undefined && value.length > limits.maxLength) {
        return fail(`must be at most ${limits.maxLength} characters`);
      }
      return value;
    }

    case 'number': {
      const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof parsed !== 'number' || Number.isNaN(parsed)) {
        return fail(`expected a number, received ${JSON.stringify(value)}`);
      }
      if (limits.minValue !== undefined && parsed < limits.minValue) {
        return fail(`must be at least ${limits.minValue}`);
      }
      if (limits.maxValue !== undefined && parsed > limits.maxValue) {
        return fail(`must be at most ${limits.maxValue}`);
      }
      return parsed;
    }

    case 'boolean': {
      if (typeof value === 'boolean') {
        return value;
      }
      if (value === 'true' || value === 'false') {
        return value === 'true';
      }
      return fail(`expected a boolean, received ${JSON.stringify(value)}`);
    }

    case 'options': {
      const allowed = (property.options ?? []).map(option => option.value);
      if (!limits.allowCustomValue && !allowed.includes(value as string | number)) {
        return fail(`must be one of: ${allowed.join(', ')}`);
      }
      return value;
    }

    case 'multiOptions': {
      if (!Array.isArray(value)) {
        return fail('expected an array of values');
      }
      const allowed = (property.options ?? []).map(option => option.value);
      const unknown = value.filter(entry => !allowed.includes(entry as string | number));
      if (!limits.allowCustomValue && unknown.length > 0) {
        return fail(`contains unsupported values: ${unknown.join(', ')}`);
      }
      return value;
    }

    case 'json': {
      if (typeof value !== 'string') {
        return value;
      }
      // A bare string is already a valid value; only bracketed text is parsed, so a
      // malformed object or array still fails loudly instead of arriving as text.
      const trimmed = value.trim();
      if (!/^[[{]/.test(trimmed)) {
        return value;
      }
      try {
        return JSON.parse(trimmed);
      } catch {
        return fail('is not valid JSON');
      }
    }

    case 'collection': {
      if (!isPlainObject(value)) {
        return fail('expected an object of options');
      }
      return resolveCollection(property, value, options);
    }
  }
}

/** A collection keeps only the keys that were actually supplied — defaults stay unsent. */
function resolveCollection(
  property: INodeProperty,
  value: Record<string, unknown>,
  options: ResolveOptions
): ResolvedParameters {
  const nested = property.properties ?? [];
  const resolved: ResolvedParameters = {};

  for (const [key, entry] of Object.entries(value)) {
    const definition = nested.find(candidate => candidate.name === key);
    if (!definition) {
      throw new NodeParameterError(`${property.name}.${key}`, 'is not a supported option', {
        node: options.node,
        itemIndex: options.itemIndex,
      });
    }
    if (entry === undefined || entry === null) {
      continue;
    }
    resolved[key] = coerce(
      { ...definition, name: `${property.name}.${key}` },
      resolveRaw(entry, options),
      options
    );
  }

  return resolved;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Turns raw input into the parameter set a node executes against: defaults applied,
 * hidden properties dropped, everything left validated against the description.
 */
export function resolveParameters(
  properties: INodeProperty[],
  raw: RawParameters,
  options: ResolveOptions
): ResolvedParameters {
  const known = new Set(properties.map(property => property.name));
  const unknownKeys = Object.keys(raw).filter(key => !known.has(key));
  if (unknownKeys.length > 0) {
    throw new NodeParameterError(unknownKeys[0], 'is not a parameter of this node', {
      node: options.node,
      itemIndex: options.itemIndex,
    });
  }

  const supplied: Record<string, unknown> = {};
  for (const property of properties) {
    if (property.name in raw) {
      supplied[property.name] = resolveRaw(raw[property.name], options);
    }
  }

  // Single ordered pass: a property is gated on the values resolved before it, so a
  // description declares its gating fields (resource, operation) first — as n8n does.
  const resolved: ResolvedParameters = {};
  const view: Record<string, unknown> = {};

  for (const property of properties) {
    if (!isDisplayed(property.displayOptions, view)) {
      continue;
    }

    const value = property.name in supplied ? supplied[property.name] : property.default;

    if (isEmpty(value)) {
      if (property.required) {
        throw new NodeParameterError(property.name, 'is required', {
          node: options.node,
          itemIndex: options.itemIndex,
          description: property.description,
        });
      }
      if (value === undefined || value === null) {
        continue;
      }
    }

    const coerced = coerce(property, value, options);
    resolved[property.name] = coerced;
    view[property.name] = coerced;
  }

  return resolved;
}
