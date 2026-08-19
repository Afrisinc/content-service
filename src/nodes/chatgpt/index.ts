import { executeNode, streamNode, type ExecuteNodeOptions, type INodeItem } from '../core';
import { CHATGPT_CREDENTIALS_NAME } from './chatgpt.constants';
import { ChatGptNode } from './chatgpt.impl';
import type { ChatGptCredentials } from './chatgpt.types';

export const chatGptNode = new ChatGptNode();

export interface ChatGptRunOptions extends Omit<ExecuteNodeOptions, 'credentials'> {
  credentials: ChatGptCredentials;
  /** Supply a node built with a custom client factory or client options. */
  node?: ChatGptNode;
}

function toExecuteOptions(options: ChatGptRunOptions): ExecuteNodeOptions {
  const { credentials, node: _node, ...rest } = options;
  return { ...rest, credentials: { [CHATGPT_CREDENTIALS_NAME]: credentials } };
}

export function runChatGpt(options: ChatGptRunOptions): Promise<INodeItem[]> {
  return executeNode(options.node ?? chatGptNode, toExecuteOptions(options));
}

export function streamChatGpt(options: ChatGptRunOptions): AsyncGenerator<string, void, unknown> {
  return streamNode(options.node ?? chatGptNode, toExecuteOptions(options));
}

export { createChatGptClient, toNodeApiError, type ChatGptClientOptions } from './chatgpt.client';
export * from './chatgpt.constants';
export { chatGptCredentialDescription, chatGptCredentialsFromEnv } from './chatgpt.credentials';
export { chatGptDescription, chatGptProperties } from './chatgpt.description';
export { CHATGPT_PRICING } from './chatgpt.pricing';
export { ChatGptNode, type ChatGptNodeOptions } from './chatgpt.impl';
export type { ChatGptClientFactory, ChatGptCredentials, IChatGptClient } from './chatgpt.types';
