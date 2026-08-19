import {
  NodeOperationError,
  type INodeExecutionContext,
  type INodeItem,
  type INodeType,
} from '../core';
import { createChatGptClient, type ChatGptClientOptions } from './chatgpt.client';
import {
  CHATGPT_CREDENTIALS_NAME,
  CHATGPT_NODE_NAME,
  CHATGPT_OPERATION,
  CHATGPT_RESOURCE,
} from './chatgpt.constants';
import { chatGptDescription } from './chatgpt.description';
import { CHATGPT_PRICING } from './chatgpt.pricing';
import type { ChatGptClientFactory, ChatGptCredentials, IChatGptClient } from './chatgpt.types';
import {
  executeAnalyzeImage,
  executeClassify,
  executeEmbedding,
  executeGenerateImage,
  executeMessage,
  streamMessage,
} from './operations';

type OperationHandler = (
  client: IChatGptClient,
  context: INodeExecutionContext
) => Promise<INodeItem[]>;

const HANDLERS: Record<string, OperationHandler> = {
  [`${CHATGPT_RESOURCE.TEXT}:${CHATGPT_OPERATION.MESSAGE}`]: executeMessage,
  [`${CHATGPT_RESOURCE.TEXT}:${CHATGPT_OPERATION.CLASSIFY}`]: executeClassify,
  [`${CHATGPT_RESOURCE.IMAGE}:${CHATGPT_OPERATION.GENERATE}`]: executeGenerateImage,
  [`${CHATGPT_RESOURCE.IMAGE}:${CHATGPT_OPERATION.ANALYZE}`]: executeAnalyzeImage,
  [`${CHATGPT_RESOURCE.EMBEDDING}:${CHATGPT_OPERATION.CREATE}`]: executeEmbedding,
};

export interface ChatGptNodeOptions {
  /** Swap the transport — a stub in tests, a gateway or Azure deployment in production. */
  clientFactory?: ChatGptClientFactory;
  clientOptions?: ChatGptClientOptions;
}

export class ChatGptNode implements INodeType {
  readonly description = chatGptDescription;
  readonly pricing = CHATGPT_PRICING;

  private readonly clientFactory: ChatGptClientFactory;
  /** One client per credential object, so a batch of items shares a single connection pool. */
  private readonly clients = new WeakMap<ChatGptCredentials, IChatGptClient>();

  constructor(options: ChatGptNodeOptions = {}) {
    this.clientFactory =
      options.clientFactory ??
      (credentials => createChatGptClient(credentials, options.clientOptions));
  }

  async execute(context: INodeExecutionContext): Promise<INodeItem[]> {
    const resource = context.getNodeParameter<string>('resource');
    const operation = context.getNodeParameter<string>('operation');
    const handler = HANDLERS[`${resource}:${operation}`];

    if (!handler) {
      throw new NodeOperationError(`Unsupported operation "${resource}:${operation}"`, {
        node: CHATGPT_NODE_NAME,
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
      '[chatGpt] executing operation'
    );

    return handler(this.client(context), context);
  }

  async *stream(context: INodeExecutionContext): AsyncGenerator<string, void, unknown> {
    const resource = context.getNodeParameter<string>('resource');
    const operation = context.getNodeParameter<string>('operation');

    if (resource !== CHATGPT_RESOURCE.TEXT || operation !== CHATGPT_OPERATION.MESSAGE) {
      throw new NodeOperationError(`"${resource}:${operation}" cannot be streamed`, {
        node: CHATGPT_NODE_NAME,
      });
    }

    yield* streamMessage(this.client(context), context);
  }

  private client(context: INodeExecutionContext): IChatGptClient {
    const credentials = context.getCredentials<ChatGptCredentials>(CHATGPT_CREDENTIALS_NAME);
    const cached = this.clients.get(credentials);

    if (cached) {
      return cached;
    }

    const client = this.clientFactory(credentials);
    this.clients.set(credentials, client);
    return client;
  }
}
