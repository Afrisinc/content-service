import type { ZodType } from 'zod';
import { nodeServices } from '@/adapters/nodes/nodeServices';
import { parseLenientJson } from '@/helpers/jsonRepair.helper';
import { runChatGpt, runClaude } from '@/nodes';
import { resolveChatGptConfig, resolveClaudeConfig } from '@/services/aiCredentials.service';
import { extractJson } from '@/studio/directors/structured';
import { ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';

export type JsonLlmProvider = 'claude' | 'chatgpt';

export interface JsonLlmRequest<T> {
  system: string;
  prompt: (complaint?: string) => string;
  schema: ZodType<T>;
  requestId: string;
  userId: string;
  claudeModel: string;
  chatGptModel: string;
  maxTokens: number;
  temperature: number;
  maxAttempts: number;
  maxTotalAttempts?: number;
}

export interface JsonLlmResult<T> {
  value: T;
  provider: JsonLlmProvider;
  attempts: number;
}

const PROVIDERS: readonly JsonLlmProvider[] = ['claude', 'chatgpt'];

function contentOf(items: { json?: Record<string, unknown> }[], provider: JsonLlmProvider) {
  const content = items[0]?.json?.content;
  if (!content || typeof content !== 'string') {
    throw new ServerError(`${provider} returned no content`);
  }
  return content;
}

async function complete<T>(
  provider: JsonLlmProvider,
  request: JsonLlmRequest<T>,
  prompt: string
): Promise<string> {
  const usageContext = { requestId: request.requestId, userId: request.userId };

  if (provider === 'claude') {
    const { credentials, model } = await resolveClaudeConfig();
    const items = await runClaude({
      credentials,
      logger,
      services: nodeServices,
      usageContext,
      parameters: {
        resource: 'text',
        operation: 'message',
        model: model ?? request.claudeModel,
        maxTokens: request.maxTokens,
        systemPrompt: request.system,
        prompt,
        options: { thinking: 'disabled' },
      },
    });
    return contentOf(items, provider);
  }

  const { credentials, model } = await resolveChatGptConfig();
  const items = await runChatGpt({
    credentials,
    logger,
    services: nodeServices,
    usageContext,
    parameters: {
      resource: 'text',
      operation: 'message',
      model: model ?? request.chatGptModel,
      systemPrompt: request.system,
      prompt,
      jsonOutput: true,
      options: { temperature: request.temperature, maxTokens: request.maxTokens },
    },
  });
  return contentOf(items, provider);
}

export function parseJsonReply<T>(
  raw: string,
  schema: ZodType<T>
): { value?: T; complaint?: string } {
  let candidate: unknown;
  try {
    candidate = parseLenientJson(extractJson(raw));
  } catch {
    return { complaint: 'the response was not valid JSON' };
  }

  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    return {
      complaint: parsed.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    };
  }
  return { value: parsed.data };
}

export async function generateJson<T>(request: JsonLlmRequest<T>): Promise<JsonLlmResult<T>> {
  const failures: string[] = [];
  let left = request.maxTotalAttempts ?? request.maxAttempts * PROVIDERS.length;

  for (const provider of PROVIDERS) {
    if (left <= 0) {
      failures.push(`${provider}: skipped, the attempt budget is spent`);
      continue;
    }
    let complaint: string | undefined;
    try {
      const allowed = Math.min(request.maxAttempts, left);
      for (let attempt = 1; attempt <= allowed; attempt += 1) {
        const raw = await complete(provider, request, request.prompt(complaint));
        left -= 1;
        const { value, complaint: issue } = parseJsonReply(raw, request.schema);
        if (value !== undefined) {
          return { value, provider, attempts: attempt };
        }
        complaint = issue;
        logger.warn(
          { provider, attempt, complaint, requestId: request.requestId },
          'llm.json.retry'
        );
      }
      failures.push(`${provider}: ${complaint}`);
    } catch (error) {
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new ServerError(`no AI provider produced a usable answer (${failures.join('; ')})`);
}
