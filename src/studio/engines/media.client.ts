import axios, { type AxiosInstance, isAxiosError } from 'axios';
import { env } from '@/config/env';
import { BadRequestError, ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import type { AudioMixSpec, ComposeSpec, QualityReport, VariantSpec } from '../contracts';

export interface ComposeOutput {
  format: string;
  output_key: string;
  width: number;
  height: number;
  fps: number;
  duration_seconds: number;
  bytes: number;
  checksum: string;
}

export interface ComposeResponse {
  master_key: string;
  master_duration_seconds: number;
  outputs: ComposeOutput[];
}

export interface MixResponse {
  output_key: string;
  duration_seconds: number;
  integrated_lufs: number;
  true_peak_db: number;
  bytes: number;
  checksum: string;
}

export interface AssembleResponse {
  output_key: string;
  width: number;
  height: number;
  fps: number;
  duration_seconds: number;
  bytes: number;
  checksum: string;
}

export interface LastFrameResponse {
  output_key: string;
  bytes: number;
  checksum: string;
  at_seconds: number;
}

export interface SubtitleResponse {
  keys: Record<string, string>;
  cue_count: number;
}

export interface ThumbnailCandidate {
  index: number;
  output_key: string;
  at_seconds: number;
  sharpness: number;
  contrast: number;
  face_area_ratio: number;
  score: number;
}

export interface MediaEngineClient {
  compose(spec: ComposeSpec): Promise<ComposeResponse>;
  mix(spec: AudioMixSpec & { output_key: string }): Promise<MixResponse>;
  assemble(input: {
    production_id: string;
    scene_id: string;
    shot_keys: string[];
    fps: number;
    width?: number;
    height?: number;
    output_key: string;
  }): Promise<AssembleResponse>;
  lastFrame(input: {
    video_key: string;
    output_key: string;
    offset_seconds?: number;
  }): Promise<LastFrameResponse>;
  subtitles(input: {
    segments: unknown[];
    formats: string[];
    output_prefix: string;
    language: string;
  }): Promise<SubtitleResponse>;
  thumbnails(input: {
    production_id: string;
    video_key: string;
    candidate_count: number;
    output_prefix: string;
  }): Promise<{ candidates: ThumbnailCandidate[]; selected_index: number }>;
  inspect(input: {
    target: string;
    target_id?: string;
    video_key?: string;
    audio_key?: string;
    expected_duration_seconds: number;
    thresholds: Record<string, unknown>;
  }): Promise<QualityReport>;
  healthy(): Promise<boolean>;
}

class HttpMediaEngineClient implements MediaEngineClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.MEDIA_WORKER_URL,
      timeout: env.MEDIA_WORKER_TIMEOUT_MS,
      headers: env.MEDIA_WORKER_API_KEY ? { 'x-api-key': env.MEDIA_WORKER_API_KEY } : undefined,
    });
  }

  private fail(operation: string, err: unknown): never {
    if (isAxiosError(err) && err.response) {
      const detail = JSON.stringify(err.response.data).slice(0, 500);
      if (err.response.status === 422 || err.response.status === 400) {
        throw new BadRequestError(`media worker rejected ${operation}: ${detail}`);
      }
      logger.error({ operation, status: err.response.status, detail }, 'media worker error');
      throw new ServerError(`media worker error during ${operation}`);
    }
    logger.error({ operation, error: String(err) }, 'media worker unreachable');
    throw new ServerError('media worker unreachable');
  }

  async compose(spec: ComposeSpec): Promise<ComposeResponse> {
    try {
      const response = await this.client.post<ComposeResponse>('/video/compose', spec);
      return response.data;
    } catch (err) {
      this.fail('compose', err);
    }
  }

  async mix(spec: AudioMixSpec & { output_key: string }): Promise<MixResponse> {
    try {
      const response = await this.client.post<MixResponse>('/audio/mix', spec);
      return response.data;
    } catch (err) {
      this.fail('mix', err);
    }
  }

  async assemble(input: {
    production_id: string;
    scene_id: string;
    shot_keys: string[];
    fps: number;
    width?: number;
    height?: number;
    output_key: string;
  }): Promise<AssembleResponse> {
    try {
      const response = await this.client.post<AssembleResponse>('/video/assemble', input);
      return response.data;
    } catch (err) {
      this.fail('assemble', err);
    }
  }

  async lastFrame(input: {
    video_key: string;
    output_key: string;
    offset_seconds?: number;
  }): Promise<LastFrameResponse> {
    try {
      const response = await this.client.post<LastFrameResponse>('/video/last-frame', input);
      return response.data;
    } catch (err) {
      this.fail('last frame extraction', err);
    }
  }

  async subtitles(input: {
    segments: unknown[];
    formats: string[];
    output_prefix: string;
    language: string;
  }): Promise<SubtitleResponse> {
    try {
      const response = await this.client.post<SubtitleResponse>('/video/subtitles', input);
      return response.data;
    } catch (err) {
      this.fail('subtitles', err);
    }
  }

  async thumbnails(input: {
    production_id: string;
    video_key: string;
    candidate_count: number;
    output_prefix: string;
  }): Promise<{ candidates: ThumbnailCandidate[]; selected_index: number }> {
    try {
      const response = await this.client.post<{
        candidates: ThumbnailCandidate[];
        selected_index: number;
      }>('/video/thumbnails', input);
      return response.data;
    } catch (err) {
      this.fail('thumbnails', err);
    }
  }

  async inspect(input: {
    target: string;
    target_id?: string;
    video_key?: string;
    audio_key?: string;
    expected_duration_seconds: number;
    thresholds: Record<string, unknown>;
  }): Promise<QualityReport> {
    try {
      const response = await this.client.post<QualityReport>('/qa/inspect', input);
      return response.data;
    } catch (err) {
      this.fail('inspect', err);
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

let client: MediaEngineClient | undefined;

export function getMediaEngineClient(): MediaEngineClient {
  if (!client) {
    client = new HttpMediaEngineClient();
  }
  return client;
}

export function setMediaEngineClient(next: MediaEngineClient): void {
  client = next;
}

export type { VariantSpec };
