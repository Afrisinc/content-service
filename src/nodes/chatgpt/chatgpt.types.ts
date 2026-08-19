import type OpenAI from 'openai';
import type { JsonObject } from '../core';

export interface ChatGptCredentials extends JsonObject {
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
  projectId?: string;
}

/**
 * The transport the operations run against. Everything the node does goes through
 * this interface, so a test or a proxy can replace the OpenAI SDK wholesale.
 */
export interface IChatGptClient {
  chat(
    body: OpenAI.ChatCompletionCreateParamsNonStreaming,
    signal?: AbortSignal
  ): Promise<OpenAI.ChatCompletion>;
  chatStream(
    body: OpenAI.ChatCompletionCreateParamsStreaming,
    signal?: AbortSignal
  ): Promise<AsyncIterable<OpenAI.ChatCompletionChunk>>;
  generateImages(
    body: OpenAI.ImageGenerateParamsNonStreaming,
    signal?: AbortSignal
  ): Promise<OpenAI.ImagesResponse>;
  createEmbeddings(
    body: OpenAI.EmbeddingCreateParams,
    signal?: AbortSignal
  ): Promise<OpenAI.CreateEmbeddingResponse>;
  moderate(
    body: OpenAI.ModerationCreateParams,
    signal?: AbortSignal
  ): Promise<OpenAI.ModerationCreateResponse>;
}

export type ChatGptClientFactory = (credentials: ChatGptCredentials) => IChatGptClient;
