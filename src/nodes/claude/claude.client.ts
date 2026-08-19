import Anthropic, { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import {
  DEFAULT_RETRY,
  NodeApiError,
  silentLogger,
  withRetry,
  type ILogger,
  type RetryOptions,
} from '../core';
import { CLAUDE_NODE_NAME, DEFAULT_REQUEST_TIMEOUT_MS } from './claude.constants';
import type { ClaudeCredentials, IClaudeClient } from './claude.types';

export interface ClaudeClientOptions {
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

/** Anthropic returns the wait it wants on a rate limit; honouring it beats guessing. */
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
    return new NodeApiError(`Claude ${operation} failed: ${error.message}`, {
      node: CLAUDE_NODE_NAME,
      status: error.status as number | undefined,
      code: error.type ?? undefined,
      retryable: isRetryable(error),
      cause: error,
    });
  }

  return new NodeApiError(
    `Claude ${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
    { node: CLAUDE_NODE_NAME, retryable: false, cause: error }
  );
}

class AnthropicClaudeClient implements IClaudeClient {
  private readonly sdk: Anthropic;
  private readonly logger: ILogger;
  private readonly retry: RetryOptions;

  constructor(credentials: ClaudeCredentials, options: ClaudeClientOptions = {}) {
    this.logger = options.logger ?? silentLogger;
    this.sdk = new Anthropic({
      apiKey: credentials.apiKey,
      baseURL: credentials.baseUrl,
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
          '[claude] retrying request'
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

  message(
    body: Anthropic.Beta.MessageCreateParamsNonStreaming,
    signal?: AbortSignal
  ): Promise<Anthropic.Beta.BetaMessage> {
    return this.run('message', s => this.sdk.beta.messages.create(body, { signal: s }), signal);
  }

  async messageStream(
    body: Anthropic.Beta.MessageCreateParamsStreaming,
    signal?: AbortSignal
  ): Promise<AsyncIterable<Anthropic.Beta.BetaRawMessageStreamEvent>> {
    return this.run(
      'message stream',
      s => this.sdk.beta.messages.create(body, { signal: s }),
      signal
    );
  }

  fileMetadata(fileId: string, signal?: AbortSignal): Promise<Anthropic.Beta.FileMetadata> {
    return this.run(
      'file metadata',
      s => this.sdk.beta.files.retrieveMetadata(fileId, null, { signal: s }),
      signal
    );
  }

  downloadFile(fileId: string, signal?: AbortSignal): Promise<Uint8Array> {
    return this.run(
      'file download',
      async s => {
        const response = await this.sdk.beta.files.download(fileId, null, { signal: s });
        return new Uint8Array(await response.arrayBuffer());
      },
      signal
    );
  }
}

export function createClaudeClient(
  credentials: ClaudeCredentials,
  options: ClaudeClientOptions = {}
): IClaudeClient {
  return new AnthropicClaudeClient(credentials, options);
}
