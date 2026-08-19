import OpenAI, { APIConnectionError, APIError, APIUserAbortError } from 'openai';
import {
  DEFAULT_RETRY,
  NodeApiError,
  silentLogger,
  withRetry,
  type ILogger,
  type RetryOptions,
} from '../core';
import { CHATGPT_NODE_NAME, DEFAULT_REQUEST_TIMEOUT_MS } from './chatgpt.constants';
import type { ChatGptCredentials, IChatGptClient } from './chatgpt.types';

export interface ChatGptClientOptions {
  timeoutMs?: number;
  logger?: ILogger;
  retry?: Partial<Omit<RetryOptions, 'isRetryable' | 'retryAfterMs'>>;
}

const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

function isRetryable(error: unknown): boolean {
  if (error instanceof APIUserAbortError) {
    return false;
  }
  if (error instanceof APIConnectionError) {
    return true;
  }
  return error instanceof APIError && RETRYABLE_STATUSES.has(error.status as number);
}

/** OpenAI answers a rate limit with the wait it wants; honouring it beats guessing. */
function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof APIError) || typeof error.headers?.get !== 'function') {
    return undefined;
  }

  const header = error.headers.get('retry-after');
  const seconds = header === null ? NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

export function toNodeApiError(error: unknown, operation: string): NodeApiError {
  if (error instanceof APIError) {
    return new NodeApiError(`ChatGPT ${operation} failed: ${error.message}`, {
      node: CHATGPT_NODE_NAME,
      status: error.status as number | undefined,
      code: error.code ?? undefined,
      retryable: isRetryable(error),
      description: error.type,
      cause: error,
    });
  }

  return new NodeApiError(
    `ChatGPT ${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
    { node: CHATGPT_NODE_NAME, retryable: false, cause: error }
  );
}

class OpenAiChatGptClient implements IChatGptClient {
  private readonly sdk: OpenAI;
  private readonly logger: ILogger;
  private readonly retry: RetryOptions;

  constructor(credentials: ChatGptCredentials, options: ChatGptClientOptions = {}) {
    this.logger = options.logger ?? silentLogger;
    this.sdk = new OpenAI({
      apiKey: credentials.apiKey,
      baseURL: credentials.baseUrl,
      organization: credentials.organizationId,
      project: credentials.projectId,
      timeout: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      // Backoff lives in `withRetry`; letting the SDK also retry would multiply the attempts.
      maxRetries: 0,
    });
    this.retry = {
      ...DEFAULT_RETRY,
      ...options.retry,
      isRetryable,
      retryAfterMs,
      onRetry: (error, attempt, delayMs) =>
        this.logger.warn(
          { attempt, delayMs, reason: error instanceof Error ? error.message : String(error) },
          '[chatGpt] retrying request'
        ),
    };
  }

  private run<T>(
    operation: string,
    call: (signal?: AbortSignal) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    return withRetry(
      async () => {
        try {
          return await call(signal);
        } catch (error) {
          throw toNodeApiError(error, operation);
        }
      },
      {
        ...this.retry,
        isRetryable: error => error instanceof NodeApiError && error.retryable,
        retryAfterMs: error => retryAfterMs(error instanceof NodeApiError ? error.cause : error),
      }
    );
  }

  chat(
    body: OpenAI.ChatCompletionCreateParamsNonStreaming,
    signal?: AbortSignal
  ): Promise<OpenAI.ChatCompletion> {
    return this.run(
      'chat completion',
      s => this.sdk.chat.completions.create(body, { signal: s }),
      signal
    );
  }

  async chatStream(
    body: OpenAI.ChatCompletionCreateParamsStreaming,
    signal?: AbortSignal
  ): Promise<AsyncIterable<OpenAI.ChatCompletionChunk>> {
    return this.run(
      'chat completion stream',
      s => this.sdk.chat.completions.create(body, { signal: s }),
      signal
    );
  }

  generateImages(
    body: OpenAI.ImageGenerateParamsNonStreaming,
    signal?: AbortSignal
  ): Promise<OpenAI.ImagesResponse> {
    return this.run('image generation', s => this.sdk.images.generate(body, { signal: s }), signal);
  }

  createEmbeddings(
    body: OpenAI.EmbeddingCreateParams,
    signal?: AbortSignal
  ): Promise<OpenAI.CreateEmbeddingResponse> {
    return this.run('embedding', s => this.sdk.embeddings.create(body, { signal: s }), signal);
  }

  moderate(
    body: OpenAI.ModerationCreateParams,
    signal?: AbortSignal
  ): Promise<OpenAI.ModerationCreateResponse> {
    return this.run('moderation', s => this.sdk.moderations.create(body, { signal: s }), signal);
  }
}

export function createChatGptClient(
  credentials: ChatGptCredentials,
  options: ChatGptClientOptions = {}
): IChatGptClient {
  return new OpenAiChatGptClient(credentials, options);
}
