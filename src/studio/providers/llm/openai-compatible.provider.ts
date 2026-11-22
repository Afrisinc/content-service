import axios, { type AxiosInstance } from 'axios';
import { env } from '@/config/env';
import { ServerError } from '@/utils/http-error';
import { recordGeneration } from '@/observability/metrics';
import type { LlmProvider, LlmRequest, LlmResponse } from '../provider.types';

interface ChatCompletionResponse {
  model: string;
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class OpenAiCompatibleLlmProvider implements LlmProvider {
  readonly name = 'openai-compatible';
  readonly model: string;
  private readonly client: AxiosInstance;

  constructor(model = env.STUDIO_LLM_FALLBACK_MODEL) {
    this.model = model;
    this.client = axios.create({
      baseURL: env.STUDIO_LLM_FALLBACK_BASE_URL || env.OPENAI_BASE_URL,
      timeout: env.STUDIO_LLM_TIMEOUT_MS,
      headers: env.OPENAI_API_KEY ? { Authorization: `Bearer ${env.OPENAI_API_KEY}` } : undefined,
    });
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    try {
      const response = await this.client.post<ChatCompletionResponse>('/chat/completions', {
        model: this.model,
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          { role: 'user', content: request.prompt },
        ],
        temperature: request.temperature ?? env.STUDIO_LLM_TEMPERATURE,
        max_tokens: request.maxTokens ?? env.STUDIO_LLM_MAX_TOKENS,
        stop: request.stop,
        response_format: request.jsonOnly ? { type: 'json_object' } : undefined,
      });

      const durationMs = Date.now() - startedAt;
      recordGeneration('llm', this.name, durationMs);

      return {
        text: response.data.choices[0]?.message?.content ?? '',
        usage: {
          provider: this.name,
          model: response.data.model ?? this.model,
          inputTokens: response.data.usage?.prompt_tokens,
          outputTokens: response.data.usage?.completion_tokens,
          durationMs,
        },
      };
    } catch (err) {
      throw new ServerError(
        `llm generation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async healthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/models', { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
