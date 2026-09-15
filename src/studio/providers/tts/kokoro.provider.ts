import axios, { type AxiosInstance } from 'axios';
import { env } from '@/config/env';
import { ServerError } from '@/utils/http-error';
import { recordGeneration } from '@/observability/metrics';
import type { TtsInput, TtsProvider, TtsResult } from '../provider.types';

interface TtsResponse {
  audio_base64: string;
  mime_type: string;
  duration_seconds: number;
  voice_id: string;
  engine_version: string;
}

export class KokoroTtsProvider implements TtsProvider {
  readonly name = 'kokoro';
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.MEDIA_WORKER_URL,
      timeout: env.STUDIO_TTS_TIMEOUT_MS,
      headers: env.MEDIA_WORKER_API_KEY ? { 'x-api-key': env.MEDIA_WORKER_API_KEY } : undefined,
    });
  }

  async synthesize(input: TtsInput): Promise<TtsResult> {
    const startedAt = Date.now();
    try {
      const response = await this.client.post<TtsResponse>('/audio/tts', {
        text: input.text,
        voice_id: input.voiceId,
        language: input.language,
        speed: input.speed,
        pitch: input.pitch,
        emotion: input.emotion ?? 'neutral',
        format: input.format ?? 'wav',
      });

      const durationMs = Date.now() - startedAt;
      recordGeneration('tts', this.name, durationMs);

      return {
        audio: Buffer.from(response.data.audio_base64, 'base64'),
        mimeType: response.data.mime_type,
        durationSeconds: response.data.duration_seconds,
        usage: {
          provider: this.name,
          model: response.data.voice_id,
          modelVersion: response.data.engine_version,
          durationMs,
          costMicroUsd: 0n,
        },
      };
    } catch (err) {
      throw new ServerError(`tts failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async voices(): Promise<string[]> {
    const response = await this.client.get<{ voices: string[] }>('/audio/voices');
    return response.data.voices;
  }

  async healthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
