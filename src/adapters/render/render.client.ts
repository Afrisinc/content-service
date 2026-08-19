import { env } from '@/config/env';
import { PostSpec, RenderResult } from '@/types/post.types';
import { ServerError, BadRequestError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import axios, { AxiosInstance, isAxiosError } from 'axios';

export interface RenderClient {
  render(spec: PostSpec): Promise<RenderResult>;
  fetchSlide(slug: string, filename: string): Promise<Buffer>;
  slideUrl(slug: string, filename: string): string;
  healthy(): Promise<boolean>;
}

class HttpRenderClient implements RenderClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.RENDER_SERVICE_URL,
      timeout: env.RENDER_SERVICE_TIMEOUT_MS,
      headers: env.RENDER_SERVICE_API_KEY ? { 'x-api-key': env.RENDER_SERVICE_API_KEY } : undefined,
    });
  }

  async render(spec: PostSpec): Promise<RenderResult> {
    try {
      const response = await this.client.post<RenderResult>('/render/post', spec);
      return response.data;
    } catch (err) {
      if (isAxiosError(err) && err.response) {
        const detail = this.describe(err.response.data);
        // 422 is the render service rejecting the spec — a copy problem, not an outage.
        if (err.response.status === 422) {
          throw new BadRequestError(`render rejected the spec: ${detail}`);
        }
        logger.error({ status: err.response.status, detail }, 'Render service returned an error');
        throw new ServerError(`render service error: ${detail}`);
      }
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        'Render service unreachable'
      );
      throw new ServerError('render service unreachable');
    }
  }

  async fetchSlide(slug: string, filename: string): Promise<Buffer> {
    try {
      const response = await this.client.get<ArrayBuffer>(`/render/${slug}/${filename}`, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(response.data);
    } catch (err) {
      const detail = isAxiosError(err) ? this.describe(err.response?.data) : String(err);
      logger.error({ slug, filename, detail }, 'Could not fetch a rendered slide');
      throw new ServerError(`could not fetch rendered slide ${filename}: ${detail}`);
    }
  }

  slideUrl(slug: string, filename: string): string {
    return `${env.RENDER_SERVICE_URL.replace(/\/$/, '')}/render/${slug}/${filename}`;
  }

  async healthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private describe(payload: unknown): string {
    if (typeof payload === 'string') return payload;
    if (payload && typeof payload === 'object') {
      const body = payload as { detail?: unknown; resp_msg?: unknown };
      if (typeof body.resp_msg === 'string') return body.resp_msg;
      if (typeof body.detail === 'string') return body.detail;
      if (Array.isArray(body.detail)) return JSON.stringify(body.detail);
    }
    return 'unknown render failure';
  }
}

let instance: RenderClient | null = null;

export function getRenderClient(): RenderClient {
  if (!instance) {
    instance = new HttpRenderClient();
  }
  return instance;
}

export function setRenderClient(client: RenderClient | null): void {
  instance = client;
}
