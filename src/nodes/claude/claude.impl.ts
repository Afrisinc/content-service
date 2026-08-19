import {
  NodeOperationError,
  type INodeExecutionContext,
  type INodeItem,
  type INodeType,
} from '../core';
import { createClaudeClient, type ClaudeClientOptions } from './claude.client';
import {
  CLAUDE_CREDENTIALS_NAME,
  CLAUDE_NODE_NAME,
  CLAUDE_OPERATION,
  CLAUDE_RESOURCE,
} from './claude.constants';
import { claudeDescription } from './claude.description';
import { CLAUDE_PRICING } from './claude.pricing';
import type { ClaudeClientFactory, ClaudeCredentials, IClaudeClient } from './claude.types';
import {
  executeAnalyzeImage,
  executeClassify,
  executeGenerateFiles,
  executeMessage,
  streamMessage,
} from './operations';

type OperationHandler = (
  client: IClaudeClient,
  context: INodeExecutionContext
) => Promise<INodeItem[]>;

const HANDLERS: Record<string, OperationHandler> = {
  [`${CLAUDE_RESOURCE.TEXT}:${CLAUDE_OPERATION.MESSAGE}`]: executeMessage,
  [`${CLAUDE_RESOURCE.TEXT}:${CLAUDE_OPERATION.CLASSIFY}`]: executeClassify,
  [`${CLAUDE_RESOURCE.IMAGE}:${CLAUDE_OPERATION.ANALYZE}`]: executeAnalyzeImage,
  [`${CLAUDE_RESOURCE.FILE}:${CLAUDE_OPERATION.GENERATE}`]: executeGenerateFiles,
};

export interface ClaudeNodeOptions {
  /** Swap the transport — a stub in tests, a gateway or proxy in production. */
  clientFactory?: ClaudeClientFactory;
  clientOptions?: ClaudeClientOptions;
}

export class ClaudeNode implements INodeType {
  readonly description = claudeDescription;
  readonly pricing = CLAUDE_PRICING;

  private readonly clientFactory: ClaudeClientFactory;
  /** One client per credential object, so a batch of items shares a single connection pool. */
  private readonly clients = new WeakMap<ClaudeCredentials, IClaudeClient>();

  constructor(options: ClaudeNodeOptions = {}) {
    this.clientFactory =
      options.clientFactory ??
      (credentials => createClaudeClient(credentials, options.clientOptions));
  }

  async execute(context: INodeExecutionContext): Promise<INodeItem[]> {
    const resource = context.getNodeParameter<string>('resource');
    const operation = context.getNodeParameter<string>('operation');
    const handler = HANDLERS[`${resource}:${operation}`];

    if (!handler) {
      throw new NodeOperationError(`Unsupported operation "${resource}:${operation}"`, {
        node: CLAUDE_NODE_NAME,
        itemIndex: context.getItemIndex(),
      });
    }

    context.logger.debug(
      {
        resource,
        operation,
        model: context.getNodeParameter<string>('model', ''),
        itemIndex: context.getItemIndex(),
      },
      '[claude] executing operation'
    );

    return handler(this.client(context), context);
  }

  async *stream(context: INodeExecutionContext): AsyncGenerator<string, void, unknown> {
    const resource = context.getNodeParameter<string>('resource');
    const operation = context.getNodeParameter<string>('operation');

    if (resource !== CLAUDE_RESOURCE.TEXT || operation !== CLAUDE_OPERATION.MESSAGE) {
      throw new NodeOperationError(`"${resource}:${operation}" cannot be streamed`, {
        node: CLAUDE_NODE_NAME,
      });
    }

    yield* streamMessage(this.client(context), context);
  }

  private client(context: INodeExecutionContext): IClaudeClient {
    const credentials = context.getCredentials<ClaudeCredentials>(CLAUDE_CREDENTIALS_NAME);
    const cached = this.clients.get(credentials);

    if (cached) {
      return cached;
    }

    const client = this.clientFactory(credentials);
    this.clients.set(credentials, client);
    return client;
  }
}
