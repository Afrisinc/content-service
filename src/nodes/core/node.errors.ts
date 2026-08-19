import type { JsonObject } from './node.types';

export interface NodeErrorContext {
  node?: string;
  itemIndex?: number;
  description?: string;
  cause?: unknown;
}

export class NodeError extends Error {
  readonly node?: string;
  readonly itemIndex?: number;
  readonly description?: string;
  /** Declared here rather than relying on `Error.cause`, which needs an ES2022 lib. */
  readonly cause?: unknown;

  constructor(message: string, context: NodeErrorContext = {}) {
    super(message);
    this.name = new.target.name;
    this.cause = context.cause;
    this.node = context.node;
    this.itemIndex = context.itemIndex;
    this.description = context.description;
  }

  toJSON(): JsonObject {
    return {
      name: this.name,
      message: this.message,
      node: this.node ?? null,
      itemIndex: this.itemIndex ?? null,
      description: this.description ?? null,
    };
  }
}

/** A parameter is missing, of the wrong type, or outside the range the description allows. */
export class NodeParameterError extends NodeError {
  readonly parameter: string;

  constructor(parameter: string, message: string, context: NodeErrorContext = {}) {
    super(`Parameter "${parameter}": ${message}`, context);
    this.parameter = parameter;
  }

  toJSON(): JsonObject {
    return { ...super.toJSON(), parameter: this.parameter };
  }
}

/** The node was asked to do something it cannot do — unknown operation, unusable input. */
export class NodeOperationError extends NodeError {}

/** The remote API answered with a failure. `retryable` drives the backoff decision. */
export class NodeApiError extends NodeError {
  readonly status?: number;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    context: NodeErrorContext & { status?: number; code?: string; retryable?: boolean } = {}
  ) {
    super(message, context);
    this.status = context.status;
    this.code = context.code;
    this.retryable = context.retryable ?? false;
  }

  toJSON(): JsonObject {
    return {
      ...super.toJSON(),
      status: this.status ?? null,
      code: this.code ?? null,
      retryable: this.retryable,
    };
  }
}

export function toErrorJson(error: unknown): JsonObject {
  if (error instanceof NodeError) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  return { name: 'UnknownError', message: String(error) };
}
