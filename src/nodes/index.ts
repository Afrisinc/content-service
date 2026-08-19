import { chatGptNode } from './chatgpt';
import { claudeNode } from './claude';
import { NodeRegistry } from './core';

/** Every node this application can run. Register new nodes here, nowhere else. */
export const nodeRegistry = new NodeRegistry().register(chatGptNode).register(claudeNode);

// The front door. Anything more specific is a deep import from the node's own folder,
// which also keeps two providers' constants from colliding in one namespace.
export {
  ChatGptNode,
  chatGptCredentialsFromEnv,
  chatGptNode,
  runChatGpt,
  streamChatGpt,
  type ChatGptCredentials,
  type ChatGptNodeOptions,
  type ChatGptRunOptions,
} from './chatgpt';
export {
  ClaudeNode,
  claudeCredentialsFromEnv,
  claudeNode,
  runClaude,
  streamClaude,
  type ClaudeCredentials,
  type ClaudeNodeOptions,
  type ClaudeRunOptions,
} from './claude';
export * from './core';
