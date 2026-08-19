import { executeNode, streamNode, type ExecuteNodeOptions, type INodeItem } from '../core';
import { CLAUDE_CREDENTIALS_NAME } from './claude.constants';
import { ClaudeNode } from './claude.impl';
import type { ClaudeCredentials } from './claude.types';

export const claudeNode = new ClaudeNode();

export interface ClaudeRunOptions extends Omit<ExecuteNodeOptions, 'credentials'> {
  credentials: ClaudeCredentials;
  /** Supply a node built with a custom client factory or client options. */
  node?: ClaudeNode;
}

function toExecuteOptions(options: ClaudeRunOptions): ExecuteNodeOptions {
  const { credentials, node: _node, ...rest } = options;
  return { ...rest, credentials: { [CLAUDE_CREDENTIALS_NAME]: credentials } };
}

export function runClaude(options: ClaudeRunOptions): Promise<INodeItem[]> {
  return executeNode(options.node ?? claudeNode, toExecuteOptions(options));
}

export function streamClaude(options: ClaudeRunOptions): AsyncGenerator<string, void, unknown> {
  return streamNode(options.node ?? claudeNode, toExecuteOptions(options));
}

export { createClaudeClient, toNodeApiError, type ClaudeClientOptions } from './claude.client';
export * from './claude.constants';
export { claudeCredentialDescription, claudeCredentialsFromEnv } from './claude.credentials';
export { claudeDescription, claudeProperties } from './claude.description';
export { CLAUDE_PRICING } from './claude.pricing';
export { ClaudeNode, type ClaudeNodeOptions } from './claude.impl';
export type {
  ClaudeClientFactory,
  ClaudeCredentials,
  ClaudeUsage,
  IClaudeClient,
} from './claude.types';
