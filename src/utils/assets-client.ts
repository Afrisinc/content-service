import FormData from 'form-data';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '@/utils/logger';

export interface Asset {
  id: string;
  name: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  folder_id?: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  url: string;
}

export interface AssetFolder {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
}

export interface UploadOptions {
  folderId?: string;
  tags?: string[];
}

export class AssetsClient {
  private client: AxiosInstance;
  private baseURL: string;
  private apiKey: string;
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly MAX_RETRIES = 3;

  constructor(baseURL: string, apiKey: string) {
    if (!baseURL?.trim()) {
      throw new Error('AssetsClient: baseURL is required');
    }
    if (!apiKey?.trim()) {
      throw new Error('AssetsClient: apiKey is required');
    }

    this.baseURL = baseURL.replace(/\/$/, '');
    this.apiKey = apiKey;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: this.DEFAULT_TIMEOUT,
    });

    logger.info(`[AssetsClient] Initialized with base URL: ${this.baseURL}`);
  }

  async uploadBuffer(buffer: Buffer, filename: string, options?: UploadOptions): Promise<Asset> {
    if (!buffer || buffer.length === 0) {
      throw new Error('AssetsClient.uploadBuffer: buffer is required and must not be empty');
    }

    if (!filename?.trim()) {
      throw new Error('AssetsClient.uploadBuffer: filename is required');
    }

    logger.debug(`[AssetsClient] Uploading buffer: ${filename} (${buffer.length} bytes)`);

    const formData = new FormData();
    formData.append('file', buffer, filename);

    if (options?.folderId) {
      formData.append('folder_id', options.folderId);
    }

    if (options?.tags && options.tags.length > 0) {
      const validatedTags = options.tags.map(tag => tag.trim()).filter(tag => tag.length > 0);
      if (validatedTags.length > 0) {
        formData.append('tags', validatedTags.join(','));
      }
    }

    const response: any = await this.executeWithRetry(
      () =>
        this.client.post<any>('/api/v1/assets', formData, {
          headers: formData.getHeaders(),
        }),
      `upload buffer: ${filename}`
    );

    return response.data || response;
  }

  async createFolder(name: string, description?: string): Promise<AssetFolder> {
    if (!name?.trim()) {
      throw new Error('AssetsClient.createFolder: name is required');
    }

    logger.debug(`[AssetsClient] Creating folder: ${name}`);

    const payload: any = { name };
    if (description?.trim()) {
      payload.description = description.trim();
    }

    const response: any = await this.executeWithRetry(
      () => this.client.post<any>('/api/v1/folders', payload),
      `create folder: ${name}`
    );

    return response.data || response;
  }

  async getAsset(assetId: string): Promise<Asset> {
    if (!assetId?.trim()) {
      throw new Error('AssetsClient.getAsset: assetId is required');
    }

    logger.debug(`[AssetsClient] Fetching asset: ${assetId}`);

    const response: any = await this.executeWithRetry(
      () => this.client.get<any>(`/api/v1/assets/${assetId}`),
      `get asset: ${assetId}`
    );

    return response.data || response;
  }

  async listFolders(): Promise<AssetFolder[]> {
    logger.debug(`[AssetsClient] Listing folders`);

    const response: any = await this.executeWithRetry(
      () => this.client.get<any>('/api/v1/folders'),
      'list folders'
    );

    const folders = response.data?.folders || response.folders || response || [];
    logger.debug(`[AssetsClient] Found ${folders.length} folders`);
    return Array.isArray(folders) ? folders : [];
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health/live', { timeout: 5000 });
      logger.debug('[AssetsClient] Health check passed');
      return response.status === 200;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        '[AssetsClient] Health check failed'
      );
      return false;
    }
  }

  private async executeWithRetry<T>(
    request: () => Promise<any>,
    operationName: string
  ): Promise<T> {
    let lastError: AxiosError | Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await request();
        return response.data;
      } catch (error) {
        lastError = error as AxiosError | Error;

        const axiosError = error as AxiosError;
        const statusCode = axiosError?.response?.status;

        if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          this.handleError(error, operationName);
        }

        logger.warn(
          {
            attempt,
            maxRetries: this.MAX_RETRIES,
            operationName,
            error: error instanceof Error ? error.message : String(error),
          },
          `[AssetsClient] Attempt ${attempt}/${this.MAX_RETRIES} failed for ${operationName}`
        );

        if (attempt < this.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
        }
      }
    }

    this.handleError(lastError, operationName);
  }

  private handleError(error: unknown, operationName: string): never {
    const axiosError = error as AxiosError;

    if (axiosError?.response?.data) {
      const responseData = axiosError.response.data as any;
      const message = responseData.error || responseData.message || 'Unknown error';
      logger.error(`[AssetsClient] Failed to ${operationName}: ${message}`);
      throw new Error(`AssetsClient: ${operationName} failed - ${message}`);
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[AssetsClient] Failed to ${operationName}: ${message}`);
    throw new Error(`AssetsClient: ${operationName} failed - ${message}`);
  }
}

let singletonInstance: AssetsClient | null = null;

export function initAssetsClient(baseURL: string, apiKey: string): AssetsClient {
  singletonInstance = new AssetsClient(baseURL, apiKey);
  logger.info('[AssetsClient] Singleton instance initialized');
  return singletonInstance;
}

export function getAssetsClient(): AssetsClient {
  if (!singletonInstance) {
    throw new Error(
      'AssetsClient not initialized. Call initAssetsClient() during ' + 'application bootstrap.'
    );
  }
  return singletonInstance;
}

export default AssetsClient;
