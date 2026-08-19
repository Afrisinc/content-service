import type Anthropic from '@anthropic-ai/sdk';
import type { JsonObject, NodeUsage } from '../core';

export interface ClaudeCredentials extends JsonObject {
  apiKey: string;
  baseUrl?: string;
}

/**
 * The transport the operations run against. Requests go through the beta namespace
 * because server-side refusal fallbacks live there.
 */
export interface IClaudeClient {
  message(
    body: Anthropic.Beta.MessageCreateParamsNonStreaming,
    signal?: AbortSignal
  ): Promise<Anthropic.Beta.BetaMessage>;
  messageStream(
    body: Anthropic.Beta.MessageCreateParamsStreaming,
    signal?: AbortSignal
  ): Promise<AsyncIterable<Anthropic.Beta.BetaRawMessageStreamEvent>>;
  fileMetadata(fileId: string, signal?: AbortSignal): Promise<Anthropic.Beta.FileMetadata>;
  downloadFile(fileId: string, signal?: AbortSignal): Promise<Uint8Array>;
}

export type ClaudeClientFactory = (credentials: ClaudeCredentials) => IClaudeClient;

/** The shared usage shape plus the one bucket only this API reports. */
export interface ClaudeUsage extends NodeUsage {
  thinkingTokens: number;
}
