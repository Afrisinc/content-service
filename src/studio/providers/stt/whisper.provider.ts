import axios, { type AxiosInstance } from 'axios';
import { env } from '@/config/env';
import { ServerError } from '@/utils/http-error';
import { recordGeneration } from '@/observability/metrics';
import type { SttInput, SttProvider, SttResult } from '../provider.types';

interface TranscribeResponse {
  language: string;
  duration_seconds: number;
  model: string;
  segments: Array<{
    text: string;
    start: number;
    end: number;
    words: Array<{ word: string; start: number; end: number }>;
  }>;
}

export class WhisperSttProvider implements SttProvider {
  readonly name = 'faster-whisper';
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.MEDIA_WORKER_URL,
      timeout: env.STUDIO_STT_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      headers: env.MEDIA_WORKER_API_KEY ? { 'x-api-key': env.MEDIA_WORKER_API_KEY } : undefined,
    });
  }

  async transcribe(input: SttInput): Promise<SttResult> {
    const startedAt = Date.now();
    try {
      const response = await this.client.post<TranscribeResponse>('/audio/transcribe', {
        audio_base64: input.audio.toString('base64'),
        language: input.language,
        word_timestamps: input.wordTimestamps ?? true,
      });

      const durationMs = Date.now() - startedAt;
      recordGeneration('stt', this.name, durationMs);

      return {
        language: response.data.language,
        durationSeconds: response.data.duration_seconds,
        segments: response.data.segments,
        usage: {
          provider: this.name,
          model: response.data.model,
          durationMs,
          costMicroUsd: 0n,
        },
      };
    } catch (err) {
      throw new ServerError(
        `transcription failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
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
