import axios, { type AxiosInstance } from 'axios';
import { env } from '@/config/env';
import { ServerError } from '@/utils/http-error';
import { recordGeneration } from '@/observability/metrics';
import type { LlmProvider, LlmRequest, LlmResponse } from '../provider.types';

interface OllamaGenerateResponse {
  response: string;
  model: string;
  prompt_eval_count?: number;
  eval_count?: number;
  done: boolean;
}

export class OllamaLlmProvider implements LlmProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly client: AxiosInstance;

  constructor(model = env.STUDIO_LLM_MODEL) {
    this.model = model;
    this.client = axios.create({
      baseURL: env.OLLAMA_BASE_URL,
      timeout: env.STUDIO_LLM_TIMEOUT_MS,
    });
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    try {
      const response = await this.client.post<OllamaGenerateResponse>('/api/generate', {
        model: this.model,
        prompt: request.prompt,
        system: request.system,
        stream: false,
        format: request.jsonOnly ? 'json' : undefined,
        options: {
          temperature: request.temperature ?? env.STUDIO_LLM_TEMPERATURE,
          num_predict: request.maxTokens ?? env.STUDIO_LLM_MAX_TOKENS,
          stop: request.stop,
        },
      });

      const durationMs = Date.now() - startedAt;
      recordGeneration('llm', this.name, durationMs);

      return {
        text: response.data.response,
        usage: {
          provider: this.name,
          model: response.data.model ?? this.model,
          inputTokens: response.data.prompt_eval_count,
          outputTokens: response.data.eval_count,
          durationMs,
          costMicroUsd: 0n,
        },
      };
    } catch (err) {
      throw new ServerError(
        `ollama generation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async healthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/tags', { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
